import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import type { Id } from "../src/convex/_generated/dataModel";
import {
  can,
  canGrantRole,
  normalizeBankingRole,
  permissionsFor,
} from "../src/convex/bankingAccess";
import { hmacSha256Hex, signaturesMatch, verifyWebhookSignature } from "../src/convex/bankingWebhook";

/**
 * Banking tenancy integration tests.
 *
 * These run the real Convex functions against an in-memory deployment, so the
 * guarantees the platform claims — tenant isolation, balanced double-entry
 * groups, idempotent writes, lifecycle gating, role-based access and dual
 * approval — are exercised rather than described.
 *
 * Bun has no `import.meta.glob`, so the module map is explicit.
 */
const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/bankingAccess.ts": () => import("../src/convex/bankingAccess"),
  "src/convex/bankingCustomer.ts": () => import("../src/convex/bankingCustomer"),
  "src/convex/bankingAdmin.ts": () => import("../src/convex/bankingAdmin"),
  "src/convex/bankingWebhook.ts": () => import("../src/convex/bankingWebhook"),
};

type Harness = ReturnType<typeof convexTest>;

const asUser = (t: Harness, userId: string) =>
  t.withIdentity({ subject: userId, issuer: "https://test.cloudie.local", tokenIdentifier: `test|${userId}` });

async function seedUser(t: Harness, email: string, role?: "admin" | "user") {
  return (await t.run((ctx) =>
    ctx.db.insert("users", { name: email.split("@")[0], email, role, createdAt: Date.now() }),
  )) as Id<"users">;
}

async function seedTenant(
  t: Harness,
  ownerId: Id<"users">,
  overrides: Record<string, unknown> = {},
  subdomain = `bank-${Math.random().toString(36).slice(2, 8)}`,
) {
  return (await t.run((ctx) =>
    ctx.db.insert("tenantSites", {
      ownerId,
      siteName: "Test Bank",
      displayName: "Test Bank",
      subdomain,
      siteType: "bank",
      currency: "USD",
      lifecycleStatus: "active",
      bankingEnabled: true,
      isActive: true,
      createdAt: Date.now(),
      ...overrides,
    } as never),
  )) as Id<"tenantSites">;
}

async function addMember(t: Harness, tenantId: Id<"tenantSites">, userId: Id<"users">, role: string) {
  return t.run((ctx) =>
    ctx.db.insert("tenantUsers", { tenantId, userId, role, status: "active", createdAt: Date.now() }),
  );
}

async function seedAccount(
  t: Harness,
  tenantId: Id<"tenantSites">,
  userId: Id<"users">,
  balanceMinor: number,
) {
  return (await t.run((ctx) =>
    ctx.db.insert("tenantAccounts", {
      tenantId,
      userId,
      accountType: "checking",
      name: "Everyday",
      balance: balanceMinor / 100,
      accountNumber: String(1000000000 + Math.floor(Math.random() * 8_000_000_000)),
      routingNumber: "000000001",
      currency: "USD",
      isActive: true,
      status: "active",
      balanceMinor,
      availableBalanceMinor: balanceMinor,
      ledgerBalanceMinor: balanceMinor,
      createdAt: Date.now(),
    } as never),
  )) as Id<"tenantAccounts">;
}

async function groupBalance(t: Harness, groupId: string) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("bankingLedgerEntries")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect(),
  );
  const debit = rows.reduce((s, r) => s + (r.debitMinor ?? 0), 0);
  const credit = rows.reduce((s, r) => s + (r.creditMinor ?? 0), 0);
  return { rows, debit, credit };
}

async function balances(t: Harness, ...ids: Id<"tenantAccounts">[]) {
  return t.run(async (ctx) => {
    const out: number[] = [];
    for (const id of ids) out.push(((await ctx.db.get(id)) as any).balanceMinor);
    return out;
  });
}

// ─── RBAC matrix (pure) ──────────────────────────────────────────────

describe("banking RBAC matrix", () => {
  test("legacy membership values normalise to customer", () => {
    expect(normalizeBankingRole("member")).toBe("customer");
    expect(normalizeBankingRole(undefined)).toBe("customer");
    expect(normalizeBankingRole("FINANCE")).toBe("finance");
  });

  test("customer holds no console permission", () => {
    expect(permissionsFor("customer")).toEqual([]);
    expect(can("customer", "transactions.view")).toBe(false);
  });

  test("least privilege: compliance cannot approve ledger corrections", () => {
    expect(can("compliance", "kyc.review")).toBe(true);
    expect(can("compliance", "ledger.adjust.request")).toBe(true);
    expect(can("compliance", "ledger.adjust.approve")).toBe(false);
  });

  test("support is read-only on customers and transactions", () => {
    expect(can("support", "customers.view")).toBe(true);
    expect(can("support", "transactions.view")).toBe(true);
    expect(can("support", "fees.manage")).toBe(false);
    expect(can("support", "transactions.override")).toBe(false);
  });

  test("a tenant administrator cannot mint a peer with more rights than it holds", () => {
    expect(canGrantRole("owner", "admin")).toBe(true);
    expect(canGrantRole("admin", "finance")).toBe(true);
    expect(canGrantRole("finance", "admin")).toBe(false);
    expect(canGrantRole("support", "compliance")).toBe(false);
  });
});

// ─── Ledger, balances, idempotency ───────────────────────────────────

describe("double-entry transfers", () => {
  test("internal transfer posts one balanced group and moves both balances", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const bob = await seedUser(t, "bob@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, alice, "customer");
    await addMember(t, tenant, bob, "customer");
    const from = await seedAccount(t, tenant, alice, 10_000);
    const to = await seedAccount(t, tenant, bob, 0);

    const result = await asUser(t, alice).mutation(api.bankingCustomer.createTransfer, {
      tenantId: tenant,
      sourceAccountId: from,
      destType: "internal_account",
      destAccountId: to,
      amountMinor: 2_500,
    });

    expect(result.status).toBe("completed");
    expect(result.settlementMode).toBe("sandbox");
    expect(await balances(t, from, to)).toEqual([7_500, 2_500]);

    const group = await t.run((ctx) =>
      ctx.db.query("bankingTransfers").withIndex("by_tenant", (q) => q.eq("tenantId", tenant)).first(),
    );
    const ledger = await groupBalance(t, (group as any).ledgerGroupId);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.debit).toBe(2_500);
    expect(ledger.credit).toBe(2_500);
  });

  test("replaying an idempotency key returns the original transfer and writes nothing new", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const bob = await seedUser(t, "bob@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, alice, "customer");
    await addMember(t, tenant, bob, "customer");
    const from = await seedAccount(t, tenant, alice, 10_000);
    const to = await seedAccount(t, tenant, bob, 0);

    const args = {
      tenantId: tenant,
      sourceAccountId: from,
      destType: "internal_account" as const,
      destAccountId: to,
      amountMinor: 1_000,
      idempotencyKey: "portal-transfer-1",
    };
    const first = await asUser(t, alice).mutation(api.bankingCustomer.createTransfer, args);
    const second = await asUser(t, alice).mutation(api.bankingCustomer.createTransfer, args);

    expect(second.id).toBe(first.id);
    expect((second as any).reused).toBe(true);
    const counts = await t.run(async (ctx) => ({
      transfers: (await ctx.db.query("bankingTransfers").withIndex("by_tenant", (q) => q.eq("tenantId", tenant)).collect()).length,
      entries: (await ctx.db.query("bankingLedgerEntries").withIndex("by_tenant", (q) => q.eq("tenantId", tenant)).collect()).length,
    }));
    expect(counts).toEqual({ transfers: 1, entries: 2 });
    expect(await balances(t, from, to)).toEqual([9_000, 1_000]);
  });

  test("insufficient funds is refused and leaves balances and ledger untouched", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const bob = await seedUser(t, "bob@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, alice, "customer");
    await addMember(t, tenant, bob, "customer");
    const from = await seedAccount(t, tenant, alice, 500);
    const to = await seedAccount(t, tenant, bob, 0);

    await expect(
      asUser(t, alice).mutation(api.bankingCustomer.createTransfer, {
        tenantId: tenant,
        sourceAccountId: from,
        destType: "internal_account",
        destAccountId: to,
        amountMinor: 900,
      }),
    ).rejects.toThrow(/INSUFFICIENT_FUNDS/);

    expect(await balances(t, from, to)).toEqual([500, 0]);
    const entries = await t.run((ctx) =>
      ctx.db.query("bankingLedgerEntries").withIndex("by_tenant", (q) => q.eq("tenantId", tenant)).collect(),
    );
    expect(entries).toHaveLength(0);
  });

  test("concurrent withdrawals cannot overspend the account", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, alice, "customer");
    const acct = await seedAccount(t, tenant, alice, 1_000);

    const results = await Promise.allSettled([
      asUser(t, alice).mutation(api.bankingCustomer.createWithdrawal, { tenantId: tenant, accountId: acct, amountMinor: 800 }),
      asUser(t, alice).mutation(api.bankingCustomer.createWithdrawal, { tenantId: tenant, accountId: acct, amountMinor: 800 }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const [balance] = await balances(t, acct);
    expect(balance).toBe(200);
  });

  test("a live tenant refuses payout it cannot settle through a provider", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const tenant = await seedTenant(t, owner, { bankingMode: "live" });
    await addMember(t, tenant, alice, "customer");
    const acct = await seedAccount(t, tenant, alice, 5_000);

    await expect(
      asUser(t, alice).mutation(api.bankingCustomer.createWithdrawal, { tenantId: tenant, accountId: acct, amountMinor: 1_000 }),
    ).rejects.toThrow(/SETTLEMENT_PROVIDER_NOT_CONFIGURED/);
    expect(await balances(t, acct)).toEqual([5_000]);
  });
});

// ─── Tenant isolation & lifecycle ────────────────────────────────────

describe("tenant isolation and lifecycle", () => {
  test("a member of tenant A cannot read or move money in tenant B", async () => {
    const t = convexTest(schema, modules);
    const ownerA = await seedUser(t, "owner-a@bank.test");
    const ownerB = await seedUser(t, "owner-b@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const bob = await seedUser(t, "bob@bank.test");
    const tenantA = await seedTenant(t, ownerA);
    const tenantB = await seedTenant(t, ownerB);
    await addMember(t, tenantA, alice, "customer");
    await addMember(t, tenantB, bob, "customer");
    const aliceAcct = await seedAccount(t, tenantA, alice, 1_000);
    const bobAcct = await seedAccount(t, tenantB, bob, 7_000);

    expect(await asUser(t, alice).query(api.bankingCustomer.memberAccounts, { tenantId: tenantB })).toEqual([]);
    expect(await asUser(t, alice).query(api.bankingCustomer.memberAccounts, { tenantId: tenantA })).toHaveLength(1);

    await expect(
      asUser(t, alice).query(api.bankingCustomer.accountTransactions, { tenantId: tenantB, accountId: bobAcct }),
    ).rejects.toThrow(/FORBIDDEN/);

    // The account is also a cross-tenant id: passing A's tenant with B's account
    // must fail the account lookup, not leak B's row.
    await expect(
      asUser(t, alice).mutation(api.bankingCustomer.createTransfer, {
        tenantId: tenantA,
        sourceAccountId: aliceAcct,
        destType: "internal_account",
        destAccountId: bobAcct,
        amountMinor: 100,
      }),
    ).rejects.toThrow(/DESTINATION_NOT_FOUND/);

    expect(await balances(t, aliceAcct, bobAcct)).toEqual([1_000, 7_000]);
  });

  test("a suspended tenant refuses new financial operations server-side", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const bob = await seedUser(t, "bob@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, alice, "customer");
    await addMember(t, tenant, bob, "customer");
    const from = await seedAccount(t, tenant, alice, 1_000);
    const to = await seedAccount(t, tenant, bob, 0);
    await t.run((ctx) => ctx.db.patch(tenant, { lifecycleStatus: "suspended", isActive: false }));

    await expect(
      asUser(t, alice).mutation(api.bankingCustomer.createTransfer, {
        tenantId: tenant,
        sourceAccountId: from,
        destType: "internal_account",
        destAccountId: to,
        amountMinor: 100,
      }),
    ).rejects.toThrow(/TENANT_UNAVAILABLE/);

    // Suspension preserves records: the accounts and their balances still exist.
    expect(await balances(t, from, to)).toEqual([1_000, 0]);
    const publicView = await asUser(t, alice).query(api.bankingCustomer.publicTenant, { tenantId: tenant });
    expect(publicView?.isAvailable).toBe(false);
  });
});

// ─── Roles enforce on the server ─────────────────────────────────────

describe("tenant staff permissions", () => {
  async function tenantWithStaff() {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const customer = await seedUser(t, "customer@bank.test");
    const support = await seedUser(t, "support@bank.test");
    const compliance = await seedUser(t, "compliance@bank.test");
    const finance = await seedUser(t, "finance@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, customer, "customer");
    await addMember(t, tenant, support, "support");
    await addMember(t, tenant, compliance, "compliance");
    await addMember(t, tenant, finance, "finance");
    return { t, owner, customer, support, compliance, finance, tenant };
  }

  test("a customer cannot open the banking console", async () => {
    const { t, customer, tenant } = await tenantWithStaff();
    await expect(asUser(t, customer).query(api.bankingAdmin.adminDashboard, { tenantId: tenant })).rejects.toThrow(/FORBIDDEN/);
  });

  test("support can read the dashboard but cannot change fees", async () => {
    const { t, support, tenant } = await tenantWithStaff();
    const dash = await asUser(t, support).query(api.bankingAdmin.adminDashboard, { tenantId: tenant });
    expect(dash.tenant.siteName).toBe("Test Bank");
    expect((dash as any).viewer.role).toBe("support");

    await expect(
      asUser(t, support).mutation(api.bankingAdmin.adminSetFeeConfig, { tenantId: tenant, transferFeeMinor: 25 }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test("finance may configure fees and compliance may not", async () => {
    const { t, finance, compliance, tenant } = await tenantWithStaff();
    const ok = await asUser(t, finance).mutation(api.bankingAdmin.adminSetFeeConfig, {
      tenantId: tenant,
      transferFeeMinor: 25,
      reason: "pricing review",
    });
    expect(ok.id).toBeTruthy();
    await expect(
      asUser(t, compliance).mutation(api.bankingAdmin.adminSetFeeConfig, { tenantId: tenant, transferFeeMinor: 40 }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  test("owner grants staff roles and audit records who did it", async () => {
    const { t, owner, customer, tenant } = await tenantWithStaff();
    const granted = await asUser(t, owner).mutation(api.bankingAdmin.addTenantStaff, {
      tenantId: tenant,
      email: "customer@bank.test",
      role: "compliance",
    });
    expect(granted.updated).toBe(true);
    const perms = await asUser(t, customer).query(api.bankingAdmin.myTenantPermissions, { tenantId: tenant });
    expect(perms?.role).toBe("compliance");
    expect(perms?.permissions).toContain("kyc.review");

    const logged = await t.run((ctx) =>
      ctx.db.query("auditLogs").withIndex("by_actor", (q) => q.eq("actorId", owner)).collect(),
    );
    expect(logged.some((l) => l.action === "BANKING_STAFF_ROLE_CHANGED")).toBe(true);
  });
});

// ─── Dual-approval ledger corrections ────────────────────────────────

describe("dual-approval ledger corrections", () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const financeOne = await seedUser(t, "finance1@bank.test");
    const financeTwo = await seedUser(t, "finance2@bank.test");
    const support = await seedUser(t, "support@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const tenant = await seedTenant(t, owner);
    await addMember(t, tenant, financeOne, "finance");
    await addMember(t, tenant, financeTwo, "finance");
    await addMember(t, tenant, support, "support");
    await addMember(t, tenant, alice, "customer");
    const acct = await seedAccount(t, tenant, alice, 1_000);
    return { t, owner, financeOne, financeTwo, support, alice, tenant, acct };
  }

  test("requester cannot approve their own correction", async () => {
    const { t, financeOne, tenant, acct } = await setup();
    const request = await asUser(t, financeOne).mutation(api.bankingAdmin.requestLedgerAdjustment, {
      tenantId: tenant,
      accountId: acct,
      direction: "credit",
      amountMinor: 500,
      reason: "Reversal of a duplicate fee charge",
    });
    await expect(
      asUser(t, financeOne).mutation(api.bankingAdmin.decideLedgerAdjustment, { tenantId: tenant, approvalId: request.id, approve: true }),
    ).rejects.toThrow(/SELF_APPROVAL_FORBIDDEN/);
    expect(await balances(t, acct)).toEqual([1_000]);
  });

  test("a role without approval rights cannot decide, and a second officer can", async () => {
    const { t, financeOne, financeTwo, support, tenant, acct } = await setup();
    const request = await asUser(t, financeOne).mutation(api.bankingAdmin.requestLedgerAdjustment, {
      tenantId: tenant,
      accountId: acct,
      direction: "credit",
      amountMinor: 500,
      reason: "Reversal of a duplicate fee charge",
    });

    await expect(
      asUser(t, support).mutation(api.bankingAdmin.decideLedgerAdjustment, { tenantId: tenant, approvalId: request.id, approve: true }),
    ).rejects.toThrow(/FORBIDDEN/);

    const decided = await asUser(t, financeTwo).mutation(api.bankingAdmin.decideLedgerAdjustment, {
      tenantId: tenant,
      approvalId: request.id,
      approve: true,
      reason: "Verified against the fee statement",
    });
    expect(decided.status).toBe("approved");
    expect(await balances(t, acct)).toEqual([1_500]);

    const ledger = await groupBalance(t, decided.ledgerGroupId);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.debit).toBe(500);
    expect(ledger.credit).toBe(500);
  });

  test("rejection requires a reason and leaves the balance alone", async () => {
    const { t, financeOne, financeTwo, tenant, acct } = await setup();
    const request = await asUser(t, financeOne).mutation(api.bankingAdmin.requestLedgerAdjustment, {
      tenantId: tenant,
      accountId: acct,
      direction: "debit",
      amountMinor: 100,
      reason: "Suspected duplicate settlement",
    });
    await expect(
      asUser(t, financeTwo).mutation(api.bankingAdmin.decideLedgerAdjustment, { tenantId: tenant, approvalId: request.id, approve: false }),
    ).rejects.toThrow(/REJECTION_REASON_REQUIRED/);
    const rejected = await asUser(t, financeTwo).mutation(api.bankingAdmin.decideLedgerAdjustment, {
      tenantId: tenant,
      approvalId: request.id,
      approve: false,
      reason: "Settlement was correct",
    });
    expect(rejected.status).toBe("rejected");
    expect(await balances(t, acct)).toEqual([1_000]);
  });
});

// ─── Verified settlement webhooks ────────────────────────────────────

describe("settlement webhooks", () => {
  const secret = "test-banking-webhook-secret";

  test("HMAC verification rejects missing, wrong and empty-secret input", async () => {
    const body = JSON.stringify({ provider: "acme", eventId: "evt_1" });
    const signature = await hmacSha256Hex(secret, body);
    expect(await verifyWebhookSignature({ secret, rawBody: body, signature })).toBe(true);
    expect(await verifyWebhookSignature({ secret, rawBody: body, signature: "deadbeef" })).toBe(false);
    expect(await verifyWebhookSignature({ secret: "", rawBody: body, signature })).toBe(false);
    expect(signaturesMatch(signature, signature.toUpperCase())).toBe(true);
    expect(signaturesMatch(signature, signature.slice(0, -2) + "00")).toBe(false);
  });

  async function liveTenantWithPendingDeposit() {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const tenant = await seedTenant(t, owner, { bankingMode: "live" });
    await addMember(t, tenant, alice, "customer");
    const acct = await seedAccount(t, tenant, alice, 0);
    const deposit = await t.run((ctx) =>
      ctx.db.insert("bankingDeposits", {
        tenantId: tenant,
        userId: alice,
        accountId: acct,
        reference: "DEP-ABC123",
        amountMinor: 4_000,
        currency: "USD",
        status: "pending",
        method: "bank_transfer",
        idempotencyKey: undefined,
        createdAt: Date.now(),
      } as never),
    );
    return { t, tenant, acct, deposit: deposit as Id<"bankingDeposits"> };
  }

  test("a verified event settles the deposit exactly once", async () => {
    const { t, tenant, acct, deposit } = await liveTenantWithPendingDeposit();
    const event = { provider: "acme", eventId: "evt_settle_1", reference: "DEP-ABC123", amountMinor: 4_000, currency: "USD", outcome: "paid" as const };

    const first = await t.mutation(internal.bankingWebhook.processDepositEvent, event);
    expect(first.status).toBe("applied");
    expect(await balances(t, acct)).toEqual([4_000]);
    expect(((await t.run((ctx) => ctx.db.get(deposit))) as any).status).toBe("completed");

    const replay = await t.mutation(internal.bankingWebhook.processDepositEvent, event);
    expect(replay.status).toBe("duplicate");
    expect(await balances(t, acct)).toEqual([4_000]);
    const entries = await t.run((ctx) =>
      ctx.db.query("bankingLedgerEntries").withIndex("by_tenant", (q) => q.eq("tenantId", tenant)).collect(),
    );
    expect(entries).toHaveLength(2);
  });

  test("an amount mismatch is rejected without crediting", async () => {
    const { t, acct, tenant } = await liveTenantWithPendingDeposit();
    const result = await t.mutation(internal.bankingWebhook.processDepositEvent, {
      provider: "acme",
      eventId: "evt_bad_amount",
      reference: "DEP-ABC123",
      amountMinor: 40_000,
      currency: "USD",
      outcome: "paid",
    });
    expect(result.status).toBe("rejected");
    expect(await balances(t, acct)).toEqual([0]);
    const events = await t.run((ctx) =>
      ctx.db.query("bankingWebhookEvents").withIndex("by_tenant", (q) => q.eq("tenantId", tenant)).collect(),
    );
    expect(events[0]?.reason).toBe("amount_or_currency_mismatch");
  });

  test("a sandbox tenant never accepts a live settlement event", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t, "owner@bank.test");
    const alice = await seedUser(t, "alice@bank.test");
    const tenant = await seedTenant(t, owner); // sandbox by default
    await addMember(t, tenant, alice, "customer");
    const acct = await seedAccount(t, tenant, alice, 0);
    await t.run((ctx) =>
      ctx.db.insert("bankingDeposits", {
        tenantId: tenant,
        userId: alice,
        accountId: acct,
        reference: "DEP-SANDBOX",
        amountMinor: 1_000,
        currency: "USD",
        status: "pending",
        method: "bank_transfer",
        createdAt: Date.now(),
      } as never),
    );

    const result = await t.mutation(internal.bankingWebhook.processDepositEvent, {
      provider: "acme",
      eventId: "evt_sandbox",
      reference: "DEP-SANDBOX",
      amountMinor: 1_000,
      currency: "USD",
      outcome: "paid",
    });
    expect(result.status).toBe("rejected");
    expect((result as any).reason).toBe("tenant_in_sandbox");
    expect(await balances(t, acct)).toEqual([0]);
  });

  test("an unknown reference is recorded and ignored, not retried forever", async () => {
    const { t } = await liveTenantWithPendingDeposit();
    const result = await t.mutation(internal.bankingWebhook.processDepositEvent, {
      provider: "acme",
      eventId: "evt_unknown",
      reference: "DEP-NOPE",
      amountMinor: 100,
      currency: "USD",
      outcome: "paid",
    });
    expect(result.status).toBe("ignored");
  });
});
