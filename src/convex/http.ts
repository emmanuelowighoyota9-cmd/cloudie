import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import { getAuthUserId } from "@convex-dev/auth/server";

const http = httpRouter();

auth.addHttpRoutes(http);

// ─── Helpers ─────────────────────────────────────────────────────────

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(extra ?? {}) },
  });
}

function extractSubFromRaw(raw: string): string {
  const h = raw.trim().toLowerCase();
  const withoutPort = h.split(":")[0] ?? h;
  const suffixes = [".g0ki.com", ".vercel.app", ".convex.site", ".convex.cloud", ".vly.sh"];
  for (const sfx of suffixes) {
    if (withoutPort.endsWith(sfx)) {
      const prefix = withoutPort.slice(0, -sfx.length);
      const label = prefix.split(".")[0]?.trim();
      if (label) return label;
    }
  }
  if (!withoutPort.includes(".")) return withoutPort;
  return withoutPort;
}

async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const t = await req.text();
    if (!t) return {};
    return JSON.parse(t);
  } catch {
    return { __invalid: true };
  }
}

// Convex document ids are long base32-ish strings. Reserved path segments such as
// "accounts", "transfers" or "join" must never be mistaken for a tenant id.
function looksLikeId(value: string): boolean {
  return value.length >= 20 && !/[/?&\s]/.test(value);
}

function tenantIdFromUrl(url: URL): string | null {
  const m = url.pathname.match(/\/api\/banking\/tenants\/([^/]+)/);
  const captured = m?.[1] ?? null;
  if (!captured || !looksLikeId(captured)) return null;
  return captured;
}

function errorResponse(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as any)?.httpStatus as number | undefined;
  // Map Convex throws to HTTP
  if (msg.includes("UNAUTHORIZED")) return json({ error: "UNAUTHORIZED", message: msg }, status ?? 401);
  if (msg.includes("FORBIDDEN")) return json({ error: "FORBIDDEN", message: msg }, 403);
  if (msg.includes("TENANT_NOT_FOUND")) return json({ error: "TENANT_NOT_FOUND", message: msg }, 404);
  if (msg.includes("TENANT_UNAVAILABLE")) return json({ error: "TENANT_UNAVAILABLE", message: msg }, 423);
  if (msg.includes("ACCOUNT_NOT_FOUND")) return json({ error: "ACCOUNT_NOT_FOUND", message: msg }, 404);
  if (msg.includes("INSUFFICIENT_FUNDS")) return json({ error: "INSUFFICIENT_FUNDS", message: msg }, 422);
  if (msg.includes("INVALID_")) return json({ error: msg.split(":")[0] ?? "VALIDATION_ERROR", message: msg }, 400);
  if (msg.includes("DUPLICATE") || msg.includes("IDEMPOTENCY_KEY_CONFLICT")) return json({ error: "CONFLICT", message: msg }, 409);
  if (msg.includes("ACCOUNT_INACTIVE") || msg.includes("SOURCE_ACCOUNT_INACTIVE") || msg.includes("DESTINATION_INACTIVE")) return json({ error: "ACCOUNT_INACTIVE", message: msg }, 409);
  if (msg.includes("DAILY_LIMIT")) return json({ error: "LIMIT_EXCEEDED", message: msg }, 422);
  if (msg === "INVALID_JSON") return json({ error: "INVALID_JSON", message: "Invalid JSON body" }, 400);
  return json({ error: "BAD_REQUEST", message: msg }, status ?? 400);
}

// ─── Tenant resolver — wildcard subdomain routing ──────────────────
// GET /api/tenants/resolve?host=crestline-capitalfive.g0ki.com
// GET /api/tenants/resolve?subdomain=crestline-capitalfive

const tenantResolveHandler = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("host") ?? url.searchParams.get("subdomain") ?? "").trim().toLowerCase();
  if (!raw) {
    return json({ error: "MISSING_HOST", message: "Provide ?host= or ?subdomain=" }, 400);
  }
  const subdomain = extractSubFromRaw(raw);
  if (!subdomain || subdomain.length < 2) {
    return json({ tenant: null, subdomain: null });
  }
  let tenant: unknown = null;
  try {
    tenant = await ctx.runQuery(api.tenantResolver.resolveBySubdomain, { subdomain });
  } catch {
    tenant = null;
  }
  return json({ subdomain, tenant }, 200, { "access-control-allow-origin": "*" });
});

http.route({ path: "/api/tenants/resolve", method: "GET", handler: tenantResolveHandler });
http.route({ path: "/api/tenant/resolve", method: "GET", handler: tenantResolveHandler });

// ─── Tenant-scoped health ──────────────────────────────────────────
// GET /api/tenants/:subdomain/health

const tenantHealthHandler = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/api\/tenants\/([^/]+)\/health\/?$/);
  const sub = m?.[1]?.trim().toLowerCase() ?? "";
  let tenant: any = null;
  if (sub) {
    try {
      tenant = await ctx.runQuery(api.tenantResolver.resolveBySubdomain, { subdomain: sub });
    } catch {
      tenant = null;
    }
  }
  let db: any = null;
  try {
    db = await ctx.runQuery(internal.health.ping, {});
  } catch {
    db = null;
  }
  const payload: Record<string, unknown> = {
    subdomain: sub || null,
    tenant: tenant ? { name: tenant.siteName, status: tenant.lifecycleStatus, isAvailable: tenant.isAvailable, currency: tenant.currency } : null,
    database: db ? db.database : "unreachable",
    queue: db ? { queued: db.queuedJobs, failed: db.failedJobs } : null,
    timestamp: new Date().toISOString(),
  };
  const status = !db ? 503 : 200;
  return json(payload, status);
});
http.route({ path: "/api/tenants/health", method: "GET", handler: tenantHealthHandler });
http.route({ path: "/api/tenants/crestline-capitalfive/health", method: "GET", handler: tenantHealthHandler });

// ─── Global health ─────────────────────────────────────────────────
// GET /health, GET /api/health

const healthHandler = httpAction(async (ctx) => {
  try {
    const db = await ctx.runQuery(internal.health.ping, {});
    return json({ status: "ok", service: "cloudie", database: db.database, queue: { queued: db.queuedJobs, failed: db.failedJobs }, timestamp: new Date().toISOString() });
  } catch {
    return json({ status: "degraded", service: "cloudie", database: "unreachable", timestamp: new Date().toISOString() }, 503);
  }
});
http.route({ path: "/health", method: "GET", handler: healthHandler });
http.route({ path: "/api/health", method: "GET", handler: healthHandler });

// ─── RESTful banking API (tenant-scoped, auth required) ───────────
// All routes below require a Convex session (cookie or Authorization header via Convex Auth).
// tenant_id is taken from the URL path and validated server-side; client balances are never trusted.

// POST /api/tenants/provision  { tenantName, subdomain, siteType, currency?, status?, planTier? }
const provisionHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const uid = await getAuthUserId(ctx as any);
    if (!uid) return json({ error: "UNAUTHORIZED" }, 401);
    // Delegate to existing Convex mutation (admin-only guard inside)
    const result: any = await ctx.runMutation(api.tenantResolver.provisionTenant as any, {
      tenantName: String(body.tenantName ?? body.siteName ?? "").trim(),
      subdomain: String(body.subdomain ?? "").trim().toLowerCase(),
      siteType: (body.siteType ?? "bank") as any,
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      status: body.status ? String(body.status) : undefined,
      planTier: body.planTier ?? body.plan ? String(body.planTier ?? body.plan) : undefined,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/tenants/provision", method: "POST", handler: provisionHandler });

// POST /api/banking/tenants/:tenantId/join
const joinHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    return json(await ctx.runMutation(api.bankingCustomer.joinTenant as any, { tenantId: tenantId as any }));
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/join", method: "POST", handler: joinHandler });
http.route({ path: "/api/banking/tenants/self-join", method: "POST", handler: joinHandler });

// POST /api/banking/tenants/:tenantId/accounts  { name, accountType, currency?, idempotencyKey? }
const openAccountHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const idempotencyKey = (req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? undefined) as string | undefined;
    const result = await ctx.runMutation(api.bankingCustomer.openAccount as any, {
      tenantId: tenantId as any,
      name: String(body.name ?? body.accountName ?? "").trim(),
      accountType: (body.accountType ?? "checking") as any,
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
    return json(result, 201);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/accounts", method: "POST", handler: openAccountHandler });
http.route({ path: "/api/banking/accounts", method: "POST", handler: openAccountHandler });

// GET /api/banking/tenants/:tenantId/accounts
const listAccountsHandler = httpAction(async (ctx, req) => {
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? url.searchParams.get("tenantId");
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const rows = await ctx.runQuery(api.bankingCustomer.memberAccounts as any, { tenantId: tenantId as any });
    return json({ tenantId, accounts: rows });
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/accounts-list", method: "GET", handler: listAccountsHandler });
http.route({ path: "/api/banking/accounts-list", method: "GET", handler: listAccountsHandler });

// POST /api/banking/tenants/:tenantId/transfers  { sourceAccountId, destType, destAccountId?, beneficiaryId?, amountMinor, idempotencyKey? }
const transferHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const idempotencyKey = (req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? undefined) as string | undefined;
    const result = await ctx.runMutation(api.bankingCustomer.createTransfer as any, {
      tenantId: tenantId as any,
      sourceAccountId: body.sourceAccountId as any,
      destType: (body.destType ?? "internal_account") as any,
      destAccountId: body.destAccountId as any,
      beneficiaryId: body.beneficiaryId as any,
      amountMinor: Number(body.amountMinor ?? body.amount ?? 0),
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      description: body.description ? String(body.description) : undefined,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
    return json(result, 201);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/transfers", method: "POST", handler: transferHandler });
http.route({ path: "/api/banking/transfers", method: "POST", handler: transferHandler });

// POST /api/banking/tenants/:tenantId/deposits  { accountId?, amountMinor, method, description? }
const depositHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const idempotencyKey = (req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? undefined) as string | undefined;
    const result = await ctx.runMutation(api.bankingCustomer.createDeposit as any, {
      tenantId: tenantId as any,
      accountId: body.accountId as any,
      amountMinor: Number(body.amountMinor ?? body.amount ?? 0),
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      method: String(body.method ?? "bank_transfer"),
      description: body.description ? String(body.description) : undefined,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
    return json(result, 201);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/deposits", method: "POST", handler: depositHandler });
http.route({ path: "/api/banking/deposits", method: "POST", handler: depositHandler });

// POST /api/banking/tenants/:tenantId/withdrawals  { accountId, amountMinor, destination? }
const withdrawalHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const idempotencyKey = (req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? undefined) as string | undefined;
    const result = await ctx.runMutation(api.bankingCustomer.createWithdrawal as any, {
      tenantId: tenantId as any,
      accountId: body.accountId as any,
      amountMinor: Number(body.amountMinor ?? body.amount ?? 0),
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      destination: body.destination ? String(body.destination) : undefined,
      method: body.method ? String(body.method) : undefined,
      description: body.description ? String(body.description) : undefined,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
    return json(result, 201);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/withdrawals", method: "POST", handler: withdrawalHandler });
http.route({ path: "/api/banking/withdrawals", method: "POST", handler: withdrawalHandler });

// ─── Admin overrides — tenant admin / super admin only ─────────────
// POST /api/banking/tenants/:tenantId/admin/transfer-override { transferId, action, reason }
const adminTransferOverrideHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const result = await ctx.runMutation(api.bankingAdmin.adminOverrideTransfer as any, {
      tenantId: tenantId as any,
      transferId: body.transferId as any,
      action: String(body.action) as any,
      reason: String(body.reason ?? "admin override"),
    });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/admin/transfer-override", method: "POST", handler: adminTransferOverrideHandler });
http.route({ path: "/api/banking/admin/transfer-override", method: "POST", handler: adminTransferOverrideHandler });

// POST /api/banking/tenants/:tenantId/admin/deposit-override { depositId, action, reason }
const adminDepositOverrideHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const result = await ctx.runMutation(api.bankingAdmin.adminOverrideDeposit as any, {
      tenantId: tenantId as any,
      depositId: body.depositId as any,
      action: String(body.action) as any,
      reason: String(body.reason ?? "admin override"),
    });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/admin/deposit-override", method: "POST", handler: adminDepositOverrideHandler });
http.route({ path: "/api/banking/admin/deposit-override", method: "POST", handler: adminDepositOverrideHandler });

// POST /api/banking/tenants/:tenantId/admin/fees  { transferFeeMinor?, withdrawalFeeMinor?, ... , reason? }
const adminFeesHandler = httpAction(async (ctx, req) => {
  const body = await readJson(req);
  if ((body as any).__invalid) return json({ error: "INVALID_JSON" }, 400);
  try {
    const url = new URL(req.url);
    const tenantId = tenantIdFromUrl(url) ?? String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "MISSING_TENANT" }, 400);
    const result = await ctx.runMutation(api.bankingAdmin.adminSetFeeConfig as any, {
      tenantId: tenantId as any,
      transferFeeMinor: body.transferFeeMinor !== undefined ? Number(body.transferFeeMinor) : undefined,
      withdrawalFeeMinor: body.withdrawalFeeMinor !== undefined ? Number(body.withdrawalFeeMinor) : undefined,
      depositFeeMinor: body.depositFeeMinor !== undefined ? Number(body.depositFeeMinor) : undefined,
      dailyTransferLimitMinor: body.dailyTransferLimitMinor !== undefined ? Number(body.dailyTransferLimitMinor) : undefined,
      dailyWithdrawalLimitMinor: body.dailyWithdrawalLimitMinor !== undefined ? Number(body.dailyWithdrawalLimitMinor) : undefined,
      perTransactionLimitMinor: body.perTransactionLimitMinor !== undefined ? Number(body.perTransactionLimitMinor) : undefined,
      minTransactionMinor: body.minTransactionMinor !== undefined ? Number(body.minTransactionMinor) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
});
http.route({ path: "/api/banking/tenants/admin/fees", method: "POST", handler: adminFeesHandler });
http.route({ path: "/api/banking/admin/fees", method: "POST", handler: adminFeesHandler });

// ─── Route inventory for docs ──────────────────────────────────────
const apiDocsHandler = httpAction(async () => {
  return json({
    service: "cloudie-banking",
    routes: [
      "GET  /api/tenants/resolve?host=:host",
      "GET  /api/tenants/:subdomain/health",
      "GET  /health  |  GET /api/health",
      "POST /api/tenants/provision  { tenantName, subdomain, siteType, currency?, status?, planTier? }",
      "POST /api/banking/tenants/:tenantId/join  |  POST /api/banking/tenants/join { tenantId }",
      "POST /api/banking/tenants/:tenantId/accounts  { name, accountType, currency?, Idempotency-Key? }",
      "GET  /api/banking/tenants/:tenantId/accounts-list?tenantId=:id",
      "POST /api/banking/tenants/:tenantId/transfers  { sourceAccountId, destType, amountMinor, Idempotency-Key? }",
      "POST /api/banking/tenants/:tenantId/deposits   { accountId?, amountMinor, method }",
      "POST /api/banking/tenants/:tenantId/withdrawals { accountId, amountMinor, destination? }",
      "POST /api/banking/tenants/:tenantId/admin/transfer-override { transferId, action, reason }",
      "POST /api/banking/tenants/:tenantId/admin/deposit-override  { depositId, action, reason }",
      "POST /api/banking/tenants/:tenantId/admin/fees { transferFeeMinor?, withdrawalFeeMinor?, ... }",
    ],
    auth: "Convex session cookie + Authorization bearer (JWT/OAuth2-compatible); server enforces tenant_id guards on every route.",
  });
});
http.route({ path: "/api/banking/docs", method: "GET", handler: apiDocsHandler });
http.route({ path: "/api/docs", method: "GET", handler: apiDocsHandler });

// ─── Paystack Webhook ─────────────────────────────────────────────
// POST /api/webhooks/paystack
// Verifies HMAC signature, records payment, credits user points.

const paystackWebhookHandler = httpAction(async (ctx, req) => {
  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify signature using Paystack action (crypto is not available in httpAction)
  const signature = req.headers.get("x-paystack-signature");
  if (!signature) {
    return json({ error: "Missing signature" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Verify HMAC via Paystack API (uses node:crypto in the action)
  try {
    const verified = await ctx.runAction(api.paystack.verifyWebhookSignature, {
      rawBody,
      signature,
    });
    if (!verified) {
      return json({ error: "Invalid signature" }, 401);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "Signature verification failed", message: msg }, 500);
  }

  const event = body.event as string | undefined;
  const data = body.data as Record<string, unknown> | undefined;

  if (event !== "charge.success" || !data) {
    // Acknowledge non-success events without processing
    return json({ ok: true, skipped: true });
  }

  const reference = data.reference as string;
  if (!reference) {
    return json({ error: "Missing reference" }, 400);
  }

  try {
    // Record and credit via internal mutation. The pending order (created at
    // checkout init) resolves the buyer — webhooks have no user session.
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const currency = String(data.currency ?? meta.currency ?? "USD").toUpperCase();
    const amountMinor = Number(data.amount ?? 0); // kobo/cents
    const amountMajor = amountMinor / 100;
    const result: string = await ctx.runMutation(internal.paystackInternal.recordPaymentAndCredit, {
      reference,
      packageId: String(meta.packageId ?? "unknown"),
      points: Number(meta.points ?? 0),
      amountUsd: currency === "USD" ? amountMajor : Number(meta.amountUsd ?? 0),
      amountNgn: currency === "NGN" ? amountMajor : Number(meta.amountNgn ?? 0),
      currency,
      amountKobo: amountMinor,
      paystackStatus: String(data.status ?? "success"),
      metadata: meta,
      paidSubunit: amountMinor,
      paidCurrency: currency,
    });

    return json({ ok: true, reference, credited: !result.startsWith("already:") });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If already credited, that's fine
    if (msg.includes("Duplicate") || msg.includes("already")) {
      return json({ ok: true, reference, note: "already credited" });
    }
    return json({ error: "Processing failed", message: msg }, 500);
  }
});

http.route({ path: "/api/webhooks/paystack", method: "POST", handler: paystackWebhookHandler });

// ─── VTU Webhook ───────────────────────────────────────────────────
// POST /api/webhooks/vtu
// Verifies the HMAC signature over the RAW body BEFORE anything is trusted,
// then applies the provider event to its transaction.

const vtuWebhookHandler = httpAction(async (ctx, req) => {
  // Raw body, never parsed-and-restringified: re-serialization changes the
  // bytes and the HMAC would not match.
  const rawBody = await req.text();

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Signature verification runs in an action because the Convex HTTP runtime
  // has no node:crypto.
  const verification = await ctx.runAction(internal.vtuHttp.verifyVtuCallback, {
    rawBody,
    headers,
  });

  if (!verification.verified) {
    // 401 for a bad or absent signature: this request is not from the
    // aggregator and must not be processed at all.
    return json({ error: "Invalid signature", reason: verification.reason }, 401);
  }

  try {
    const result = await ctx.runAction(internal.vtuHttp.handleVtuCallback, { rawBody });
    // Always 200 from here on, including for an unmatched reference. A 4xx
    // would make the aggregator retry forever against something that will
    // never resolve on our side. `result` already carries its own `ok` flag,
    // so it is returned as-is rather than re-spread with a conflicting key.
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "Processing failed", message: msg }, 500);
  }
});

http.route({ path: "/api/webhooks/vtu", method: "POST", handler: vtuWebhookHandler });

export default http;
