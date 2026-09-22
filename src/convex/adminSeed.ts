"use node";

import { createAccount, getAuthUserId, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Bootstraps the platform administrator account.
 *
 * The credentials passed here are stored through Convex Auth's own
 * `createAccount`, i.e. the SAME Scrypt hashing and `authAccounts` records a
 * normal sign-up creates — so `signIn("password", ...)` works identically.
 *
 * Gated by the ADMIN_SEED_TOKEN environment variable (Keys tab). Runs once:
 * subsequent calls verify the existing password and are a no-op.
 */
export const seedAdminAccount = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const expected = process.env.ADMIN_SEED_TOKEN;
    if (!expected || args.token !== expected) {
      throw new Error("UNAUTHORIZED: invalid or missing seed token");
    }

    const email = args.email.trim().toLowerCase();

    // Idempotency: if the account already exists, verify the password is
    // correct and that the user is an admin. Return status instead of erroring
    // so the seeding command is safely re-runnable.
    const retrieved = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
    }).catch(() => null);

    if (retrieved && typeof retrieved !== "string") {
      const runVerify = await ctx.runMutation(internal.adminSeedInternal.ensureAdminRole, {
        userId: retrieved.user?._id ?? null,
      });
      if (runVerify.ok) {
        return {
          status: "already_provisioned" as const,
          userId: retrieved.user?._id ?? null,
          email,
        };
      }
      // Wrong password for an existing account: update it to the provided one.
      await ctx.runMutation(internal.adminSeedInternal.rotatePassword, {
        accountId: retrieved.account._id,
        password: args.password,
      });
      return { status: "password_rotated" as const, userId: retrieved.user?._id ?? null, email };
    }

    // Fresh provisioning: create the auth account + user, hashed like any
    // regular sign-up.
    const { user: createdUser } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: args.name.trim() || "Administrator",
        role: "admin",
        createdAt: Date.now(),
      },
    });

    const userId = createdUser?._id ?? null;
    await ctx.runMutation(internal.adminSeedInternal.ensureAdminRole, { userId });

    await ctx.runMutation(internal.adminSeedInternal.recordSeedLog, {
      email,
      userId,
    });

    return { status: "created" as const, userId, email };
  },
});

/**
 * Creates an additional platform administrator.
 *
 * Callable ONLY by a signed-in administrator. Uses the same
 * `createAccount` + Scrypt hashing path as a normal sign-up, so the new
 * administrator signs in through the standard admin login page. Audited.
 *
 * This is the supported way to move an existing operator onto a dedicated
 * admin identity (e.g. a platform-owned mailbox) without touching the
 * database by hand. If the email already has a password account, and the
 * supplied password verifies, that existing account is promoted instead.
 */
export const createAdministrator = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; status: "created"; userId: Id<"users"> | null; email: string }
    | { ok: true; status: "promoted"; userId: Id<"users">; email: string }
  > => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("UNAUTHORIZED: sign in first");

    const caller = await ctx.runQuery(api.users.currentUser);
    if (!caller || caller.role !== "admin") {
      throw new Error("FORBIDDEN: administrator only");
    }

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("INVALID_EMAIL: enter a valid email address");
    }
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const existing: { accountId: Id<"authAccounts">; userId: Id<"users"> } | null =
      await ctx.runQuery(internal.adminSeedInternal.findPasswordAccount, { email });

    // Already has a password account: promote it (the password must verify, so
    // a typo can never hand admin rights to an account you cannot log into).
    if (existing) {
      let retrieved: unknown = null;
      try {
        retrieved = await retrieveAccount(ctx, {
          provider: "password",
          account: { id: email, secret: args.password },
        });
      } catch {
        retrieved = null;
      }
      if (!retrieved || typeof retrieved === "string") {
        throw new Error(
          "ACCOUNT_EXISTS: that email already has an account. Enter its current password to promote it, or use another email.",
        );
      }
      await ctx.runMutation(internal.adminSeedInternal.ensureAdminRole, {
        userId: existing.userId,
      });
      await ctx.runMutation(internal.adminSeedInternal.recordAdminCreated, {
        email,
        userId: existing.userId,
        actorId: callerId,
        actorEmail: caller.email ?? null,
      });
      return { ok: true, status: "promoted" as const, userId: existing.userId, email };
    }

    const { user: createdUser } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: args.name.trim() || "Administrator",
        role: "admin",
        createdAt: Date.now(),
      },
    });

    const userId = createdUser?._id ?? null;
    await ctx.runMutation(internal.adminSeedInternal.ensureAdminRole, { userId });
    await ctx.runMutation(internal.adminSeedInternal.recordAdminCreated, {
      email,
      userId,
      actorId: callerId,
      actorEmail: caller.email ?? null,
    });

    return { ok: true, status: "created" as const, userId, email };
  },
});
