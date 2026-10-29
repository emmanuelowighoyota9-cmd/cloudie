/**
 * Verified settlement webhooks for tenant banking.
 *
 * A webhook is never trusted because it "looks right": the raw request body must
 * carry a valid HMAC-SHA256 signature produced with `BANKING_WEBHOOK_SECRET`,
 * and the provider event id is recorded so a retry cannot credit a deposit
 * twice. Unmatched or refused events are recorded too — that is what stops the
 * provider from retrying forever and gives an operator a trail to read.
 *
 * Money movement only ever happens in `processDepositEvent`, inside one mutation:
 * the event row, the deposit status and the double-entry group commit together
 * or not at all.
 */
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/** Hex HMAC-SHA256 of `body` keyed with `secret`. Web Crypto (both runtimes). */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish comparison of two hex digests (length-checked first). */
export function signaturesMatch(expected: string, received: string): boolean {
  const a = expected.trim().toLowerCase();
  const b = received.trim().toLowerCase();
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyWebhookSignature(args: {
  secret: string;
  rawBody: string;
  signature: string;
}): Promise<boolean> {
  if (!args.secret) return false;
  const expected = await hmacSha256Hex(args.secret, args.rawBody);
  return signaturesMatch(expected, args.signature);
}

/**
 * Apply one verified deposit settlement event.
 *
 * Replay protection is the (provider, eventId) pair, so this is safe to call
 * any number of times with the same event. Returns a status the HTTP layer
 * maps to a response code.
 */
export const processDepositEvent = internalMutation({
  args: {
    provider: v.string(),
    eventId: v.string(),
    reference: v.string(),
    amountMinor: v.number(),
    currency: v.string(),
    outcome: v.union(v.literal("paid"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const provider = args.provider.trim().toLowerCase();
    const eventId = args.eventId.trim();
    if (!provider || !eventId || !args.reference.trim()) {
      throw new Error("INVALID_EVENT: provider, eventId and reference are required");
    }

    const seen = await ctx.db
      .query("bankingWebhookEvents")
      .withIndex("by_provider_event", (q) => q.eq("provider", provider).eq("eventId", eventId))
      .first();
    if (seen) return { status: "duplicate" as const, eventId };

    const record = async (
      status: string,
      extra: { tenantId?: any; signatureValid?: boolean; reason?: string } = {},
    ) => {
      await ctx.db.insert("bankingWebhookEvents", {
        provider,
        eventId,
        tenantId: extra.tenantId,
        reference: args.reference,
        status,
        signatureValid: extra.signatureValid ?? true,
        reason: extra.reason,
        amountMinor: args.amountMinor,
        currency: args.currency,
        createdAt: Date.now(),
      });
      return status;
    };

    const deposit = await ctx.db
      .query("bankingDeposits")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference.trim()))
      .first();
    if (!deposit) {
      await record("ignored", { reason: "unknown_reference" });
      return { status: "ignored" as const, reason: "unknown_reference" };
    }

    const tenant = await ctx.db.get((deposit as any).tenantId);
    if (!tenant) {
      await record("ignored", { reason: "tenant_missing" });
      return { status: "ignored" as const, reason: "tenant_missing" };
    }
    // A sandbox tenant has no provider relationship; a live event for one is
    // refused rather than silently crediting a simulated balance.
    if (((tenant as any).bankingMode === "live" ? "live" : "sandbox") !== "live") {
      await record("rejected", { tenantId: (tenant as any)._id, reason: "tenant_in_sandbox" });
      return { status: "rejected" as const, reason: "tenant_in_sandbox" };
    }

    if ((deposit as any).status === "completed") {
      await record("duplicate", { tenantId: (tenant as any)._id, reason: "already_settled" });
      return { status: "duplicate" as const, reason: "already_settled" };
    }
    if ((deposit as any).status !== "pending" && (deposit as any).status !== "processing") {
      await record("rejected", { tenantId: (tenant as any)._id, reason: `deposit_${(deposit as any).status}` });
      return { status: "rejected" as const, reason: `deposit_${(deposit as any).status}` };
    }
    if (args.amountMinor !== (deposit as any).amountMinor || args.currency.toUpperCase() !== String((deposit as any).currency).toUpperCase()) {
      await record("rejected", { tenantId: (tenant as any)._id, reason: "amount_or_currency_mismatch" });
      return { status: "rejected" as const, reason: "amount_or_currency_mismatch" };
    }

    const now = Date.now();
    if (args.outcome === "failed") {
      await ctx.db.patch((deposit as any)._id, { status: "failed", completedAt: now } as any);
      await record("applied", { tenantId: (tenant as any)._id, reason: "provider_failed" });
      await ctx.db.insert("notifications", {
        userId: (deposit as any).userId,
        title: "Deposit failed",
        message: `Deposit ${(deposit as any).reference} was not completed by the provider.`,
        type: "banking.deposit_failed",
        isRead: false,
        createdAt: now,
      } as any);
      return { status: "applied" as const, depositStatus: "failed" as const };
    }

    const accountId = (deposit as any).accountId;
    const account = accountId ? await ctx.db.get(accountId) : null;
    if (!account) {
      await record("rejected", { tenantId: (tenant as any)._id, reason: "no_funding_account" });
      return { status: "rejected" as const, reason: "no_funding_account" };
    }
    if ((account as any).tenantId !== (tenant as any)._id) {
      await record("rejected", { tenantId: (tenant as any)._id, reason: "account_tenant_mismatch" });
      return { status: "rejected" as const, reason: "account_tenant_mismatch" };
    }

    const amountMinor = args.amountMinor;
    const currency = String((deposit as any).currency);
    const groupId = `deposit-${(deposit as any).reference}-${(deposit as any)._id}`;
    await ctx.db.insert("bankingLedgerEntries", {
      tenantId: (tenant as any)._id,
      groupId,
      relatedKind: "deposit" as const,
      relatedId: (deposit as any)._id as unknown as string,
      accountId: (account as any)._id,
      userId: (deposit as any).userId,
      debitMinor: 0,
      creditMinor: amountMinor,
      currency,
      description: `Deposit ${(deposit as any).reference} settled by ${provider}`,
      createdAt: now,
    } as any);
    await ctx.db.insert("bankingLedgerEntries", {
      tenantId: (tenant as any)._id,
      groupId,
      relatedKind: "deposit" as const,
      relatedId: (deposit as any)._id as unknown as string,
      debitMinor: amountMinor,
      creditMinor: 0,
      currency,
      description: `Deposit ${(deposit as any).reference} (contra)`,
      createdAt: now,
    } as any);

    const prev = (account as any).balanceMinor ?? Math.round(((account as any).balance ?? 0) * 100);
    const next = prev + amountMinor;
    await ctx.db.patch((account as any)._id, {
      balanceMinor: next,
      availableBalanceMinor: next,
      ledgerBalanceMinor: next,
      balance: next / 100,
    } as any);
    await ctx.db.patch((deposit as any)._id, {
      status: "completed",
      completedAt: now,
      reconciledLedgerGroupId: groupId,
      settlementMode: "live",
    } as any);
    await ctx.db.insert("auditLogs", {
      actorId: undefined,
      action: "DEPOSIT_SETTLED_BY_WEBHOOK",
      resource: "bankingDeposit",
      resourceId: (deposit as any)._id as unknown as string,
      before: { status: "pending" },
      after: { status: "completed", groupId, provider, eventId },
      reason: "Verified provider settlement webhook",
      createdAt: now,
    } as any);
    await ctx.db.insert("notifications", {
      userId: (deposit as any).userId,
      title: "Deposit completed",
      message: `Your deposit ${(deposit as any).reference} (${(amountMinor / 100).toFixed(2)} ${currency}) was confirmed by ${provider}.`,
      type: "banking.deposit_completed",
      isRead: false,
      createdAt: now,
    } as any);
    await record("applied", { tenantId: (tenant as any)._id, reason: "settled" });
    return { status: "applied" as const, depositStatus: "completed" as const };
  },
});

/** Record a refused event (bad signature / unparsable body) for the audit trail. */
export const recordRejectedEvent = internalMutation({
  args: { provider: v.string(), eventId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("bankingWebhookEvents", {
      provider: args.provider,
      eventId: args.eventId,
      status: "rejected",
      signatureValid: false,
      reason: args.reason,
      createdAt: Date.now(),
    });
    return { recorded: true };
  },
});

/**
 * POST /api/banking/webhook
 *
 * Headers: `x-cloudie-signature: <hex hmac-sha256 of the raw body>`
 * Body:    { provider, eventId, reference, amountMinor, currency, outcome }
 *
 * Returns 503 when no secret is configured — an honest "not wired" instead of
 * accepting unsigned settlement traffic.
 */
export const bankingWebhookHandler = httpAction(async (ctx, req) => {
  const json = (data: unknown, status: number) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });

  const secret = process.env.BANKING_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return json({ error: "WEBHOOK_NOT_CONFIGURED", message: "Set BANKING_WEBHOOK_SECRET to accept settlement webhooks." }, 503);
  }

  const rawBody = await req.text();
  if (rawBody.length > 32_768) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  let body: any = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const provider = String(body?.provider ?? "").trim();
  const eventId = String(body?.eventId ?? "").trim();
  const signature = req.headers.get("x-cloudie-signature") ?? "";

  const valid = await verifyWebhookSignature({ secret, rawBody, signature });
  if (!valid) {
    if (provider && eventId) {
      await ctx.runMutation(internal.bankingWebhook.recordRejectedEvent, {
        provider,
        eventId,
        reason: "invalid_signature",
      });
    }
    return json({ error: "INVALID_SIGNATURE" }, 401);
  }

  const outcome = body?.outcome === "failed" ? "failed" : "paid";
  const amountMinor = Math.trunc(Number(body?.amountMinor));
  if (!provider || !eventId || !body?.reference || !Number.isFinite(amountMinor) || amountMinor <= 0 || !body?.currency) {
    return json({ error: "INVALID_EVENT" }, 400);
  }

  // The tenant is derived from the deposit reference, never from the body: a
  // caller cannot aim a webhook at another tenant by supplying its id.
  const result = await ctx.runMutation(internal.bankingWebhook.processDepositEvent, {
    provider,
    eventId,
    reference: String(body.reference),
    amountMinor,
    currency: String(body.currency),
    outcome,
  });

  const status =
    result.status === "applied" ? 200 : result.status === "duplicate" ? 200 : result.status === "ignored" ? 202 : 422;
  return json({ received: true, ...result }, status);
});

/** Mounted by `http.ts`. */
export const BANKING_WEBHOOK_PATH = "/api/banking/webhook";
