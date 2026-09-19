import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Banking maintenance jobs — Convex-owned cron tasks.
 * No external queue (Redis/BullMQ) required. All state lives in Convex DB.
 * Jobs are idempotent and bounded (take 100 per run) to avoid unbounded load.
 *
 * Invariants:
 * - Never deletes ledger/history; only flips lifecycleStatus or emits auditLogs.
 * - Every side-effect is audited with actorId = null (system) or admin.
 * - Ledger audit is read-only: detects drift without mutating balances.
 */

// System actor for cron audit entries
const SYSTEM_ACTOR = undefined as unknown as string;

/** Ledger integrity check: verify per-group debits == credits. Bounded read. */
export const ledgerAudit = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Sample recent ledger groups (last 200 groups)
    const recent = await ctx.db.query("bankingLedgerEntries").order("desc").take(200);
    const byGroup = new Map<string, { deb: number; cre: number; count: number }>();
    for (const e of recent) {
      const g = byGroup.get(e.groupId) ?? { deb: 0, cre: 0, count: 0 };
      g.deb += (e as any).debitMinor ?? 0;
      g.cre += (e as any).creditMinor ?? 0;
      g.count += 1;
      byGroup.set(e.groupId, g);
    }
    const drift: Array<{ groupId: string; deb: number; cre: number }> = [];
    for (const [gid, v] of byGroup) if (v.deb !== v.cre) drift.push({ groupId: gid, deb: v.deb, cre: v.cre });
    if (drift.length) {
      await ctx.db.insert("auditLogs", {
        actorId: undefined,
        action: "LEDGER_AUDIT_DRIFT_DETECTED",
        resource: "bankingLedgerEntries",
        after: { driftCount: drift.length, drift: drift.slice(0, 5) },
        createdAt: Date.now(),
      } as any);
    } else if (recent.length) {
      // Periodic heartbeat so operators know the job ran
      await ctx.db.insert("auditLogs", {
        actorId: undefined,
        action: "LEDGER_AUDIT_OK",
        resource: "bankingLedgerEntries",
        after: { groupsChecked: byGroup.size, entriesChecked: recent.length },
        createdAt: Date.now(),
      } as any);
    }
    return { groupsChecked: byGroup.size, driftCount: drift.length };
  },
});

/** Tenant status check: suspend tenants past renewalDate; preserve all history. */
export const tenantStatusCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const tenants = await ctx.db.query("tenantSites").take(200);
    let suspended = 0;
    for (const t of tenants) {
      const lifecycle = (t as any).lifecycleStatus ?? (t.isActive ? "active" : "disabled");
      const renewal = (t as any).renewalDate as number | undefined;
      if (!renewal) continue;
      if (lifecycle !== "active") continue;
      // Grace period: 7 days past renewal before auto-suspend (prevents flapping on clock skew)
      if (renewal + 7 * 24 * 3600 * 1000 < now) {
        await ctx.db.patch(t._id, { lifecycleStatus: "suspended", isActive: false } as any);
        await ctx.db.insert("auditLogs", {
          actorId: undefined,
          action: "TENANT_AUTO_SUSPENDED_RENEWAL_EXPIRED",
          resource: "tenantSite",
          resourceId: t._id,
          before: { lifecycleStatus: "active", isActive: true, renewalDate: renewal },
          after: { lifecycleStatus: "suspended", isActive: false },
          reason: "Automated status check: renewalDate expired + 7d grace",
          createdAt: now,
        } as any);
        suspended++;
      }
    }
    if (suspended) {
      await ctx.db.insert("auditLogs", {
        actorId: undefined,
        action: "TENANT_STATUS_CHECK_COMPLETED",
        resource: "tenantSite",
        after: { suspended },
        createdAt: now,
      } as any);
    }
    return { suspended, checked: tenants.length };
  },
});

/** Fee reconciliation: mark stale pending deposits/withdrawals for operator review (no auto-credit). */
export const feeReconciliationCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - 48 * 3600 * 1000; // 48h stale threshold
    const staleDeposits = await ctx.db
      .query("bankingDeposits")
      .withIndex("by_tenant")
      .take(200);
    const stale = staleDeposits.filter((d: any) => d.status === "pending" && d.createdAt < cutoff);
    if (stale.length) {
      await ctx.db.insert("auditLogs", {
        actorId: undefined,
        action: "STALE_DEPOSITS_FLAGGED",
        resource: "bankingDeposits",
        after: { count: stale.length, refs: stale.slice(0, 5).map((s: any) => s.reference) },
        createdAt: now,
      } as any);
    }
    // No auto-mutation of financial state — operator must reconcile via reconcileDeposit mutation.
    return { staleDeposits: stale.length };
  },
});

/** Read-only health probe for cron liveness (used by /health queue counters). */
export const cronHealthProbe = internalQuery({
  args: {},
  handler: async (ctx) => {
    const queued = await ctx.db.query("cloudieJobs").withIndex("by_status", (q) => q.eq("status", "queued")).take(20);
    return { queued: queued.length, at: Date.now() };
  },
});
