"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { createHmac } from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";

async function getSecretKey(ctx: { runQuery: Function }): Promise<string> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (key) return key;
  // Fall back to stored key in adminSettings
  const stored = await ctx.runQuery(internal.paymentConfig.getStoredKey, { key: "paystack_secret_key" });
  if (stored) return stored;
  throw new Error("PAYSTACK_SECRET_KEY is not configured. Add it in the project Keys tab or Admin > Payment Providers.");
}

async function paystackFetch(path: string, secretKey: string, opts: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok || body.status === false) {
    throw new Error(String(body.message ?? `Paystack API error ${res.status}`));
  }
  return body;
}

/**
 * Initialize a Paystack transaction for a points purchase.
 * Returns the authorization_url the user should be redirected to.
 */
export const initializePayment = action({
  args: {
    packageId: v.string(),
    points: v.number(),
    amountUsd: v.number(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const secretKey = await getSecretKey(ctx);

    // Generate a unique reference
    const reference = `CLD-${args.packageId}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Amount in kobo (Paystack uses smallest currency unit; USD has 2 decimals)
    const amountKobo = Math.round(args.amountUsd * 100);

    const result = await paystackFetch("/transaction/initialize", secretKey, {
      method: "POST",
      body: JSON.stringify({
        email: args.email,
        amount: amountKobo,
        currency: "USD",
        reference,
        callback_url: `${typeof window !== "undefined" ? window.location.origin : ""}/buy-points?reference=${reference}`,
        metadata: {
          packageId: args.packageId,
          points: args.points,
          amountUsd: args.amountUsd,
          platform: "cloudie",
        },
      }),
    });

    const data = result.data as Record<string, unknown>;

    return {
      authorization_url: data.authorization_url as string,
      access_code: data.access_code as string,
      reference: reference,
    };
  },
});

/**
 * Verify a Paystack transaction by reference.
 * If verified, credits the user's points balance.
 */
export const verifyAndCredit = action({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    const secretKey = await getSecretKey(ctx);
    const result = await paystackFetch(`/transaction/verify/${encodeURIComponent(args.reference)}`, secretKey);
    const data = result.data as Record<string, unknown>;

    const status = data.status as string;
    const amount = data.amount as number; // in kobo
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const reference = data.reference as string;

    if (status !== "success") {
      return { verified: false, status, message: `Transaction status: ${status}` };
    }

    const points = Number(metadata.points ?? 0);
    const packageId = String(metadata.packageId ?? "unknown");
    const amountUsd = amount / 100;

    if (points <= 0) {
      return { verified: false, message: "Invalid points in transaction metadata" };
    }

    // Check for idempotency — don't credit twice
    const existing = await ctx.runQuery(internal.paystackInternal.findPaymentByRef, { reference });
    if (existing) {
      return { verified: true, credited: false, message: "Already credited", points, reference };
    }

    // Credit the user via points system
    const orderResult: string = await ctx.runMutation(internal.paystackInternal.recordPaymentAndCredit, {
      reference,
      packageId,
      points,
      amountUsd,
      amountKobo: amount,
      paystackStatus: status,
      metadata,
    });
    return { verified: true, credited: true, points, reference, orderId: orderResult };
  },
});

/**
 * Verify a Paystack webhook HMAC signature.
 * Uses node:crypto to compute HMAC-SHA512 and compare with the provided signature.
 */
export const verifyWebhookSignature = action({
  args: {
    rawBody: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    // Try webhook signing secret first, then fall back to main secret
    let secret: string = process.env.PAYSTACK_WEBHOOK_SECRET ?? "";
    if (!secret) {
      const stored: string | null = await ctx.runQuery(internal.paymentConfig.getStoredKey, { key: "paystack_webhook_secret" });
      if (stored) secret = stored;
    }
    if (!secret) secret = await getSecretKey(ctx);
    if (!secret) throw new Error("No Paystack secret configured for webhook verification");

    const expected: string = createHmac("sha512", secret).update(args.rawBody).digest("hex");
    return expected === args.signature;
  },
});

/**
 * Get the Paystack public key for client-side inline checkout.
 * This is a safe query — the public key is meant to be exposed.
 */
export const getPublicKey = action({
  args: {},
  handler: async () => {
    const key = process.env.VITE_PAYSTACK_PUBLIC_KEY ?? process.env.PAYSTACK_PUBLIC_KEY;
    if (!key) throw new Error("PAYSTACK_PUBLIC_KEY is not configured. Add it in the project Keys tab.");
    return key;
  },
});
