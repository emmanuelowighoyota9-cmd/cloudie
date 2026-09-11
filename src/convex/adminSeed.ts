"use node";

import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
