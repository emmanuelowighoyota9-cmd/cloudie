/**
 * RESTful banking HTTP layer — JWT/OAuth2-compatible by design.
 * Every route authenticates via Convex session (Bearer from Convex Auth / cookie),
 * extracts tenant from subdomain or body tenantId, enforces row-level tenant_id guards
 * server-side, and never trusts client-supplied balances.
 *
 * Routes (tenant-scoped, auth required unless marked Public):
 *  POST   /api/tenants/provision          → tenantResolver.provisionTenant
 *  POST   /api/banking/tenants/:tenantId/join     → bankingCustomer.joinTenant  [Self-signup]
 *  POST   /api/banking/tenants/:tenantId/accounts → bankingCustomer.openAccount
 *  GET    /api/banking/tenants/:tenantId/accounts → bankingCustomer.memberAccounts
 *  POST   /api/banking/tenants/:tenantId/transfers → bankingCustomer.createTransfer  [Idempotency-Key header]
 *  POST   /api/banking/tenants/:tenantId/deposits  → bankingCustomer.createDeposit
 *  POST   /api/banking/tenants/:tenantId/withdrawals → bankingCustomer.createWithdrawal
 *  POST   /api/banking/tenants/:tenantId/beneficiaries → bankingCustomer.addBeneficiary
 *  GET    /api/banking/tenants/:tenantId/ledger/:accountId → bankingCustomer.accountTransactions
 *  POST   /api/banking/tenants/:tenantId/admin/transfer-override → bankingAdmin.adminOverrideTransfer
 *  POST   /api/banking/tenants/:tenantId/admin/deposit-override  → bankingAdmin.adminOverrideDeposit
 *  POST   /api/banking/tenants/:tenantId/admin/withdrawal-override → bankingAdmin.adminOverrideWithdrawal
 *  POST   /api/banking/tenants/:tenantId/admin/accounts/:accountId/approve|freeze|unfreeze
 *  POST   /api/banking/tenants/:tenantId/admin/fees   → bankingAdmin.adminSetFeeConfig
 *  GET    /api/banking/tenants/:tenantId/admin/dashboard → bankingAdmin.adminDashboard
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx } from "./_generated/server";

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(extra ?? {}) },
  });
}
function err(code: string, message: string, status = 400) {
  return json({ error: code, message }, status);
}

async function requireAuthHttp(ctx: ActionCtx) {
  const uid = await getAuthUserId(ctx as any);
  if (!uid) throw Object.assign(new Error("UNAUTHORIZED"), { httpStatus: 401, code: "UNAUTHORIZED" });
  return uid as string;
}

async function parseJson(req: Request): Promise<Record<string, any>> {
  try {
    const t = await req.text();
    if (!t) return {};
    return JSON.parse(t);
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { httpStatus: 400, code: "INVALID_JSON" });
  }
}

function tenantIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/api\/banking\/tenants\/([^/]+)/);
  return m?.[1] ?? null;
}

// Called from http.ts via ctx.runAction style is not directly routable for mutations,
// so we expose httpAction wrappers there. This module just documents the route shape
// and provides a helper to validate the envelope that http.ts uses.
export function bankingRouteDocs() {
  return {
    provision: "POST /api/tenants/provision { tenantName, subdomain, siteType, currency?, status?, planTier? }",
    join: "POST /api/banking/tenants/:tenantId/join",
    openAccount: "POST /api/banking/tenants/:tenantId/accounts { name, accountType, currency?, idempotencyKey? }",
    listAccounts: "GET /api/banking/tenants/:tenantId/accounts",
    createTransfer: "POST /api/banking/tenants/:tenantId/transfers { sourceAccountId, destType, destAccountId?, beneficiaryId?, amountMinor, idempotencyKey? }  Header: Idempotency-Key",
    createDeposit: "POST /api/banking/tenants/:tenantId/deposits { accountId?, amountMinor, method, description? }",
    createWithdrawal: "POST /api/banking/tenants/:tenantId/withdrawals { accountId, amountMinor, destination? }",
    adminTransferOverride: "POST /api/banking/tenants/:tenantId/admin/transfer-override { transferId, action, reason }",
    adminDepositOverride: "POST /api/banking/tenants/:tenantId/admin/deposit-override { depositId, action, reason }",
    adminApproval: "POST /api/banking/tenants/:tenantId/admin/accounts/:accountId/approve|freeze|unfreeze { reason? }",
    adminFees: "POST /api/banking/tenants/:tenantId/admin/fees { transferFeeMinor?, withdrawalFeeMinor?, ... , reason? }",
    dashboard: "GET /api/banking/tenants/:tenantId/admin/dashboard",
  };
}
