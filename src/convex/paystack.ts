"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { createHmac } from "node:crypto";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";

/** Paystack can report a charge as still settling for a moment after redirect. */
const SETTLING_STATUSES = new Set(["pending", "processing", "ongoing"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PAYSTACK_BASE = "https://api.paystack.co";

async function getSecretKey(ctx: { runQuery: Function }): Promise<string> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (key) return key;
  // Fall back to stored key in adminSettings
  const stored = await ctx.runQuery(internal.paymentConfig.getStoredKey, { key: "paystack_secret_key" });
  if (stored) return stored;
  throw new Error("PAYSTACK_SECRET_KEY is not configured. Add it in the project Keys tab or Admin > Payment Providers.");
}

async function paystackFetch(path: string, secretKey: string, opts: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok || body.status === false) {
    throw new Error(String(body.message ?? `Paystack API error ${res.status}`));
  }
  return body;
}

/**
 * Initialize a Paystack transaction for a points purchase.
 * Returns the authorization_url the user should be redirected to.
 */
export const initializePayment = action({
  args: {
    packageId: v.string(),
    points: v.number(),
    amountUsd: v.number(),
    amountNgn: v.optional(v.number()),
    email: v.string(),
    currency: v.optional(v.string()),
    callbackUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const secretKey = await getSecretKey(ctx);

    // The buyer must be known up-front: webhooks/callbacks arrive unauthenticated,
    // so the pending order (created below) is what later resolves who to credit.
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Please sign in again to purchase points.");

    // Absolute callback URL — actions run server-side where `window` never exists.
    const base = (args.callbackUrl ?? "").trim().replace(/\/+$/, "");
    let callbackUrl: string;
    try {
      callbackUrl = new URL(`${base}/buy-points`).toString();
    } catch {
      throw new Error("Invalid checkout callback URL. Please reload the page and try again.");
    }

    // Settle in naira when a naira price is supplied (keeps USD as fallback).
    const currency = (args.currency ?? (args.amountNgn ? "NGN" : "USD")).toUpperCase();
    const amountMajor = currency === "NGN" ? args.amountNgn ?? 0 : args.amountUsd;
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      throw new Error("Invalid payment amount");
    }
    if (!Number.isFinite(args.points) || args.points <= 0) {
      throw new Error("Invalid points package");
    }

    // Generate a unique reference
    const reference = `CLD-${args.packageId}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Amount in the smallest currency unit (kobo for NGN, cents for USD)
    const amountKobo = Math.round(amountMajor * 100);

    const result = await paystackFetch("/transaction/initialize", secretKey, {
      method: "POST",
      body: JSON.stringify({
        email: args.email,
        amount: amountKobo,
        currency,
        reference,
        callback_url: `${callbackUrl}?reference=${reference}&packageId=${encodeURIComponent(args.packageId)}`,
        metadata: {
          packageId: args.packageId,
          points: args.points,
          amountUsd: args.amountUsd,
          amountNgn: args.amountNgn ?? 0,
          currency,
          platform: "cloudie",
        },
      }),
    });

    const data = result.data as Record<string, unknown>;
    const accessCode = data.access_code as string;
    const authorizationUrl = data.authorization_url as string;

    // Record the pending order server-side so the webhook (no session) and the
    // browser callback can both resolve buyer + authoritative amounts by reference.
    await ctx.runMutation(internal.paystackInternal.recordPendingOrder, {
      reference,
      userId,
      packageId: args.packageId,
      points: args.points,
      amountSubunit: amountKobo,
      currency,
      accessCode,
      authorizationUrl,
    });

    return {
      authorization_url: authorizationUrl,
      access_code: accessCode,
      reference,
    };
  },
});

/**
 * Explicit result shape — also breaks TypeScript's inference cycle through
 * `_generated/api` (which imports this file) when typing the handler.
 */
type VerifyResult =
  | { verified: false; status?: string; message: string; reference?: string }
  | { verified: true; credited: boolean; points: number; reference: string; orderId?: string; message?: string };

/**
 * Verify a Paystack transaction by reference.
 * If verified, credits the user's points balance.
 */
export const verifyAndCredit = action({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, args): Promise<VerifyResult> => {
    const secretKey = await getSecretKey(ctx);
    const result = await paystackFetch(`/transaction/verify/${encodeURIComponent(args.reference)}`, secretKey);
    const data = result.data as Record<string, unknown>;

    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const reference = String(data.reference ?? args.reference);
    let status = data.status as string;

    // The instant the user lands back, Paystack can still report the charge as
    // settling. Poll a few times so the credit happens on this visit.
    for (let attempt = 0; SETTLING_STATUSES.has(status) && attempt < 4; attempt++) {
      await sleep(1200);
      try {
        const retry = await paystackFetch(`/transaction/verify/${encodeURIComponent(args.reference)}`, secretKey);
        const retryData = retry.data as Record<string, unknown>;
        status = retryData.status as string;
        if (status === "success") Object.assign(data, retryData);
      } catch {
        // transient Paystack error — keep the previous status and retry
      }
    }

    if (status !== "success") {
      return { verified: false, status, message: `Transaction status: ${status}` };
    }

    const amount = data.amount as number; // in kobo
    const currency = String(data.currency ?? metadata.currency ?? "USD").toUpperCase();

    // The pending order is authoritative for points/amount and resolves the buyer
    // even when this action runs without a session (callback before auth hydrates).
    const existing: Doc<"paymentOrders"> | null = await ctx.runQuery(internal.paystackInternal.findPaymentByRef, { reference });
    if (existing?.status === "paid") {
      return { verified: true, credited: false, message: "Already credited", points: existing.points, reference };
    }
    if (existing && existing.amountSubunit !== amount) {
      return {
        verified: false,
        message: "Payment amount does not match this order. Please contact support.",
        reference,
      };
    }

    const points = existing?.points ?? Number(metadata.points ?? 0);
    const packageId = existing?.packageId ?? String(metadata.packageId ?? "unknown");
    const amountMajor = amount / 100;
    const amountUsd = currency === "USD" ? amountMajor : Number(metadata.amountUsd ?? 0);
    const amountNgn = currency === "NGN" ? amountMajor : Number(metadata.amountNgn ?? 0);

    if (points <= 0) {
      return { verified: false, message: "Invalid points in transaction metadata" };
    }

    // Credit the user via points system (idempotent — safe to call again)
    const orderResult: string = await ctx.runMutation(internal.paystackInternal.recordPaymentAndCredit, {
      reference,
      packageId,
      points,
      amountUsd,
      amountNgn,
      currency,
      amountKobo: amount,
      paystackStatus: status,
      metadata,
    });
    const alreadyCredited = orderResult.startsWith("already:");
    return {
      verified: true,
      credited: !alreadyCredited,
      points,
      reference,
      orderId: alreadyCredited ? orderResult.slice(8) : orderResult,
    };
  },
});

/**
 * Result of the automatic recovery pass — typed explicitly to keep
 * TypeScript's inference from cycling through `_generated/api`.
 */
type RecoveryResult = { checked: number; recovered: number; points: number };

/**
 * Self-healing credit pass: re-verifies the buyer's recent UNPAID orders with
 * Paystack and credits any that succeeded but never made it through the
 * callback/webhook (closed tab, dropped redirect, webhook not configured…).
 *
 * Called once when the user opens Buy Points or Wallet. Idempotent — the
 * credit path refuses to double-pay.
 */
export const recoverPendingCredits = action({
  args: {},
  handler: async (ctx, args): Promise<RecoveryResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { checked: 0, recovered: 0, points: 0 };

    // Only recent orders — bounded work per visit.
    const since = Date.now() - 48 * 60 * 60 * 1000;
    const orders: Doc<"paymentOrders">[] = await ctx.runQuery(
      internal.paystackInternal.listRecentUnpaidOrders,
      { userId, since },
    );
    if (orders.length === 0) return { checked: 0, recovered: 0, points: 0 };

    const secretKey = await getSecretKey(ctx);
    let recovered = 0;
    let points = 0;
    let checked = 0;

    for (const order of orders.slice(0, 5)) {
      const reference = order.paystackReference!;
      checked++;

      let data: Record<string, unknown>;
      try {
        const res = await paystackFetch(
          `/transaction/verify/${encodeURIComponent(reference)}`,
          secretKey,
        );
        data = res.data as Record<string, unknown>;
      } catch {
        // Reference unknown or transient Paystack error — try again next visit.
        continue;
      }

      const status = String(data.status ?? "");
      if (status === "success") {
        const amountMinor = Number(data.amount ?? 0);
        if (order.amountSubunit !== amountMinor) {
          // Amount mismatch — do not credit; leave for manual review.
          continue;
        }
        const meta = (data.metadata ?? {}) as Record<string, unknown>;
        const currency = String(data.currency ?? meta.currency ?? order.currency).toUpperCase();
        const amountMajor = amountMinor / 100;
        const result: string = await ctx.runMutation(
          internal.paystackInternal.recordPaymentAndCredit,
          {
            reference,
            packageId: order.packageId,
            points: order.points,
            amountUsd: currency === "USD" ? amountMajor : Number(meta.amountUsd ?? 0),
            amountNgn: currency === "NGN" ? amountMajor : Number(meta.amountNgn ?? 0),
            currency,
            amountKobo: amountMinor,
            paystackStatus: status,
            metadata: meta,
          },
        );
        if (!result.startsWith("already:")) {
          recovered++;
          points += order.points;
        }
      } else if (status === "failed" || status === "abandoned" || status === "reversed") {
        // Terminal for us — stop re-verifying this order on future visits.
        await ctx.runMutation(internal.paystackInternal.markOrderSettled, {
          reference,
          status: status === "abandoned" ? "abandoned" : "failed",
          reason: `Paystack status: ${status}`,
        });
      }
      // "pending"/"processing" — still settling, retry next visit.
    }

    return { checked, recovered, points };
  },
});

/**
 * Verify a Paystack webhook HMAC signature.
 * Uses node:crypto to compute HMAC-SHA512 and compare with the provided signature.
 */
export const verifyWebhookSignature = action({
  args: {
    rawBody: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    // Try webhook signing secret first, then fall back to main secret
    let secret: string = process.env.PAYSTACK_WEBHOOK_SECRET ?? "";
    if (!secret) {
      const stored: string | null = await ctx.runQuery(internal.paymentConfig.getStoredKey, { key: "paystack_webhook_secret" });
      if (stored) secret = stored;
    }
    if (!secret) secret = await getSecretKey(ctx);
    if (!secret) throw new Error("No Paystack secret configured for webhook verification");

    const expected: string = createHmac("sha512", secret).update(args.rawBody).digest("hex");
    return expected === args.signature;
  },
});

/**
 * Get the Paystack public key for client-side inline checkout.
 * This is a safe query — the public key is meant to be exposed.
 */
export const getPublicKey = action({
  args: {},
  handler: async () => {
    const key = process.env.VITE_PAYSTACK_PUBLIC_KEY ?? process.env.PAYSTACK_PUBLIC_KEY;
    if (!key) throw new Error("PAYSTACK_PUBLIC_KEY is not configured. Add it in the project Keys tab.");
    return key;
  },
});
