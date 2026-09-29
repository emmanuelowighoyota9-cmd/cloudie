/**
 * The unresolved VTU queue — the human half of reconciliation.
 *
 * When the sweep cannot reach a verdict it parks the transaction here rather
 * than reversing it. That default is the whole point: a provider that has not
 * confirmed failure means the top-up may have landed, and refunding on that
 * basis hands the customer both the airtime and their points.
 *
 * So this file has exactly two actions, and both of them go through
 * `settleTransaction` — the single writer. There is no direct status patch
 * here, which is what makes an operator decision and a webhook racing in the
 * same tick settle once instead of twice; the second caller sees the terminal
 * status and no-ops. Both also no-op if someone else already settled the row,
 * so a stale queue tab cannot double-refund.
 *
 * Every function re-verifies the admin role SERVER-SIDE via `requireAdmin`
 * and writes an audit row, because both actions move money.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { auditLog, requireAdmin } from "./adminApi";
import { internal } from "./_generated/api";
import { effectiveProvider } from "./vtuServiceRouting";

/**
 * Bounded, newest first. A backlog larger than this is an incident to work
 * through, not a page to render in full — and the sweep only ever escalates a
 * handful per provider per window anyway.
 */
const MAX_QUEUE = 100;

/**
 * Every unresolved transaction, with enough context to decide.
 *
 * `rawRequest` / `rawResponse` are the outbound request and the received
 * response the row was settled or escalated with. They were sanitised on write
 * by `sanitizeForLog`, so no credential can be in them — which is also why they
 * are safe to stream to a browser here.
 *
 * The user lookup is batched with `Promise.all` rather than awaited in the
 * loop: one row per transaction either way, but issued concurrently instead of
 * serially, and never one query per row inside a mutation.
 */
export const listUnresolved = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const rows = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_status", (q) => q.eq("status", "unresolved"))
      .order("desc")
      .take(MAX_QUEUE);

    const users = await Promise.all(rows.map((row) => ctx.db.get(row.userId)));

    return rows.map((row, index) => {
      const user = users[index];
      return {
        _id: row._id,
        status: row.status,
        unresolvedReason: row.unresolvedReason ?? null,
        failureReason: row.failureReason ?? null,
        source: row.source ?? null,
        /** Snapshot-derived, exactly as the sweep resolved it. */
        provider: effectiveProvider(row),
        providerReference: row.providerReference ?? null,
        serviceCode: row.serviceCode,
        network: row.network ?? null,
        /** Masked on write — this is personal data, not a plaintext number. */
        customerIdentifier: row.customerIdentifier,
        amountNgn: row.amountNgn ?? null,
        pointsDebited: row.pointsDebited,
        ngnPerPoint: row.ngnPerPoint,
        reconcileAttempts: row.reconcileAttempts ?? 0,
        lastReconcileAt: row.lastReconcileAt ?? null,
        rawRequest: row.rawRequest ?? null,
        rawResponse: row.rawResponse ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        user: user ? { name: user.name ?? null, email: user.email ?? null } : null,
      };
    });
  },
});

export type AdminSettleResult =
  | { settled: true; status: "confirmed" | "reversed" | "unresolved" }
  | { settled: false; reason: string; status?: string };

/**
 * "Confirm delivered" — the top-up happened, so the debit stands.
 *
 * No reversal and no ledger movement: the points were taken when the purchase
 * was reserved and that is the correct end state. Only reachable from
 * `unresolved`, and a no-op if the row has already been settled.
 */
export const confirmDelivered = mutation({
  args: {
    transactionId: v.id("vtuTransactions"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AdminSettleResult> => {
    const { adminId } = await requireAdmin(ctx);

    const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
      transactionId: args.transactionId,
      source: "admin",
      verdict: { status: "confirmed" },
    });

    if (settled.settled) {
      await auditLog(ctx, adminId, {
        action: "vtu_transaction_confirmed_delivered",
        resource: "vtuTransaction",
        resourceId: args.transactionId,
        reason: args.note ?? "Operator confirmed the top-up was delivered",
      });
    }

    return settled;
  },
});

/**
 * "Refund customer" — the one path that returns points for an unconfirmed
 * top-up, and it is a decision rather than a policy.
 *
 * `reversalReason: "admin_override"` records that a human did this, distinct
 * from `provider_failed` (the webhook said no) and `reconciliation` (the sweep
 * asked and the provider said no) only in provenance — the customer-visible
 * outcome is identical.
 *
 * The refund and the status commit in one Convex transaction via
 * `settleTransaction`, so the credit cannot land without the status and vice
 * versa.
 */
export const refundCustomer = mutation({
  args: {
    transactionId: v.id("vtuTransactions"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AdminSettleResult> => {
    const { adminId } = await requireAdmin(ctx);

    const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
      transactionId: args.transactionId,
      source: "admin",
      verdict: {
        status: "reversed",
        reversalReason: "admin_override",
        reason: args.note ?? "Refunded by an operator",
      },
    });

    if (settled.settled) {
      await auditLog(ctx, adminId, {
        action: "vtu_transaction_refunded",
        resource: "vtuTransaction",
        resourceId: args.transactionId,
        reason: args.note ?? "Operator refunded an unresolved transaction",
      });
    }

    return settled;
  },
});
