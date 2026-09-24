import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/**
 * Moves money between two accounts that belong to the same tenant site.
 *
 * Authorisation is server-side (the caller must own the site), balances are
 * never written without a balanced double-entry group, and the movement is
 * mirrored into the tenant ledger, the audit log, and the recipient's
 * notifications exactly like deposits and withdrawals.
 */
export const transferBetweenAccounts = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    fromAccountId: v.id("tenantAccounts"),
    toAccountId: v.id("tenantAccounts"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (args.fromAccountId === args.toAccountId) throw new Error("Choose two different accounts");

    const source = await ctx.db.get(args.fromAccountId);
    if (!source || source.tenantId !== args.tenantId) throw new Error("Source account not found");
    const destination = await ctx.db.get(args.toAccountId);
    if (!destination || destination.tenantId !== args.tenantId) throw new Error("Destination account not found");

    for (const account of [source, destination]) {
      if (!account.isActive) throw new Error(`${account.name} is closed`);
      const status = (account as any).status ?? (account.isActive ? "active" : "closed");
      if (["frozen", "suspended", "closed"].includes(status)) throw new Error(`${account.name} is ${status}`);
    }

    const transferAmount = Math.abs(args.amount);
    const amountMinor = Math.round(transferAmount * 100);
    if (amountMinor <= 0) throw new Error("Invalid amount");
    const currency = (source as any).currency ?? (tenant as any).currency ?? "USD";

    const prevSource = (source as any).balanceMinor ?? Math.round((source.balance ?? 0) * 100);
    if (source.accountType !== "credit" && prevSource < amountMinor) throw new Error("Insufficient funds");
    const prevDest = (destination as any).balanceMinor ?? Math.round((destination.balance ?? 0) * 100);
    const nextSource = prevSource - amountMinor;
    const nextDest = prevDest + amountMinor;
    const now = Date.now();
    const groupId = `transfer-${args.fromAccountId}-${now}`;
    const note = args.description?.trim();
    const label = note || `${source.name} to ${destination.name}`;

    // Balanced group: one debit and one credit for the same amount.
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "transfer", relatedId: args.toAccountId, accountId: args.fromAccountId, userId: source.userId, debitMinor: amountMinor, creditMinor: 0, currency, description: label, createdAt: now } as any);
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "transfer", relatedId: args.fromAccountId, accountId: args.toAccountId, userId: destination.userId, debitMinor: 0, creditMinor: amountMinor, currency, description: label, createdAt: now } as any);

    await ctx.db.patch(args.fromAccountId, { balanceMinor: nextSource, availableBalanceMinor: nextSource, ledgerBalanceMinor: nextSource, balance: nextSource / 100 } as any);
    await ctx.db.patch(args.toAccountId, { balanceMinor: nextDest, availableBalanceMinor: nextDest, ledgerBalanceMinor: nextDest, balance: nextDest / 100 } as any);

    await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: source.userId,
      amount: -transferAmount,
      description: `Transfer to ${destination.name}${note ? ` — ${note}` : ""}`,
      type: "withdrawal",
      createdAt: now,
    });
    await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: destination.userId,
      amount: transferAmount,
      description: `Transfer from ${source.name}${note ? ` — ${note}` : ""}`,
      type: "deposit",
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "TRANSFER_RECORDED", resource: "tenantAccount", resourceId: args.fromAccountId, before: { balanceMinor: prevSource }, after: { balanceMinor: nextSource, amountMinor, currency, groupId, toAccountId: args.toAccountId }, createdAt: now } as any);

    await ctx.db.insert("notifications", {
      userId: destination.userId,
      title: "Transfer received",
      message: `${fmtCurrency(transferAmount)} moved into ${destination.name} from ${source.name}. New balance: ${fmtCurrency(nextDest / 100)}.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });

    return { fromBalance: nextSource / 100, toBalance: nextDest / 100 };
  },
});
