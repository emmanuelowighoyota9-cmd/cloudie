/**
 * VTU reversal — returning a failed transaction's points.
 *
 * This lives in its own module rather than beside the rest of `vtuInternal`
 * for a concrete reason: a Convex module that reaches for its OWN functions
 * through the generated `internal` API creates a self-referential type
 * inference cycle, which makes TypeScript fall back to `any` for the module
 * and for everything that imports it. Keeping the callee in a separate file
 * breaks that cycle.
 *
 * The reversal itself is replay-safe by construction: the credit key is
 * derived from the transaction's `requestId`, not from a timestamp, so
 * calling this twice — two webhooks, or a webhook racing a future reconciler
 * — credits the points exactly once.
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { maskIdentifier, vtuRefundKey } from "../lib/vtu";

export type VtuReversalResult =
  | { reversed: true; creditId: Id<"pointLedger"> }
  | { reversed: false; reason: string };

export const reverse = internalMutation({
  args: {
    transactionId: v.id("vtuTransactions"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<VtuReversalResult> => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return { reversed: false, reason: "not_found" };

    // Terminal states short-circuit BEFORE any ledger call, so a duplicate
    // reversal never reaches the points table at all.
    if (tx.status === "reversed") {
      return { reversed: false, reason: "already_reversed" };
    }
    if (!tx.debitLedgerId) {
      return { reversed: false, reason: "no_debit" };
    }

    const creditId = await ctx.runMutation(internal.points.credit, {
      userId: tx.userId,
      amount: tx.pointsCharged,
      type: "vtu_refund",
      description: `VTU refund: ${tx.productName ?? tx.productCode} (${maskIdentifier(tx.customerIdentifier)})`,
      reference: tx.provider,
      idempotencyKey: vtuRefundKey(tx.requestId),
      metadata: {
        requestId: tx.requestId,
        provider: tx.provider,
        productCode: tx.productCode,
        reason: args.reason,
        providerReference: tx.providerReference,
        reversedFromStatus: tx.status,
      },
    });

    const now = Date.now();
    await ctx.db.patch(args.transactionId, {
      status: "reversed",
      reversalLedgerId: creditId,
      reversedAt: now,
      resolvedAt: now,
      failureReason: args.reason,
      updatedAt: now,
    });

    return { reversed: true, creditId };
  },
});
