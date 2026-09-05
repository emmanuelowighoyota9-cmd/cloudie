import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const buf = new Uint8Array(hash);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      throw new Error("An account with this email already exists");
    }

    const hash = await hashPassword(args.password);
    const now = Date.now();

    await ctx.db.patch(userId, {
      name: args.name,
      email: args.email,
      role: "user",
      pointsBalance: 0,
      passwordHash: hash,
      createdAt: now,
    });

    return { success: true };
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const valid = await checkPassword(args.password, user.passwordHash ?? "");
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    return { success: true, user };
  },
});
