// Internal mutations used by the adminSeed action (must NOT be in a "use node"
// file together with the action, so they live here).
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { Scrypt } from "lucia";

/** Look up an existing password auth account by email (avoids duplicates). */
export const findPasswordAccount = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", args.email),
      )
      .first();
    return account ? { accountId: account._id, userId: account.userId } : null;
  },
});

/** Audit trail entry for an administrator account created from the console. */
export const recordAdminCreated = internalMutation({
  args: {
    email: v.string(),
    userId: v.union(v.id("users"), v.null()),
    actorId: v.id("users"),
    actorEmail: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actorEmail: args.actorEmail ?? undefined,
      action: "ADMIN_CREATED",
      resource: "user",
      resourceId: args.userId ?? undefined,
      after: { email: args.email, role: "admin" },
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Idempotently ensure a user document has the admin role + profile fields. */
export const ensureAdminRole = internalMutation({
  args: { userId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, args) => {
    if (!args.userId) return { ok: false };
    const user = await ctx.db.get(args.userId);
    if (!user) return { ok: false };
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      role: "admin",
      // Keep whatever exists; fill only missing fields.
      ...(user.createdAt === undefined ? { createdAt: now } : {}),
      ...(user.referralCode === undefined
        ? { referralCode: `CLOUD-${Math.random().toString(36).slice(2, 8).toUpperCase()}` }
        : {}),
    });
    return { ok: true };
  },
});

/** Overwrite the stored password hash for an auth account (rotation path). */
export const rotatePassword = internalMutation({
  args: { accountId: v.id("authAccounts"), password: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    const hash = await new Scrypt().hash(args.password);
    await ctx.db.patch(args.accountId, { secret: hash });
    return { ok: true };
  },
});

/** One-time (per seed run) audit + idempotency log. */
export const recordSeedLog = internalMutation({
  args: { email: v.string(), userId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      actorId: args.userId ?? undefined,
      actorEmail: args.email,
      action: "ADMIN_SEEDED",
      resource: "user",
      resourceId: args.userId ?? undefined,
      after: { email: args.email },
      createdAt: now,
    });
    return { ok: true };
  },
});
