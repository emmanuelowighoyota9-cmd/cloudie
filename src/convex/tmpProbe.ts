"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

async function secret(ctx: { runQuery: Function }): Promise<string> {
  const env = process.env.PAYSTACK_SECRET_KEY;
  if (env) return env;
  const stored = await ctx.runQuery(internal.paymentConfig.getStoredKey, { key: "paystack_secret_key" });
  if (stored) return stored;
  throw new Error("no key");
}

export const probe = internalAction({
  args: { amountMajor: v.number(), currency: v.string() },
  handler: async (ctx, args) => {
    const key = await secret(ctx as never);
    const ref = `CLD-PROBE-${Date.now()}`;
    const amount = Math.round(args.amountMajor * 100);
    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "probe@example.test",
        amount,
        currency: args.currency,
        reference: ref,
        callback_url: "https://cloudie.freebuff.app/buy-points",
      }),
    });
    const initBody = (await initRes.json()) as Record<string, unknown>;
    if (initRes.ok && initBody.status !== false) {
      const vres = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const vbody = (await vres.json()) as Record<string, unknown>;
      const vdata = (vbody.data ?? {}) as Record<string, unknown>;
      return {
        sentAmount: amount,
        sentCurrency: args.currency,
        verifyStatus: vbody.status,
        verifyAmount: vdata.amount,
        verifyCurrency: vdata.currency,
        verifyTxStatus: vdata.status,
      };
    }
    return {
      sentAmount: amount,
      sentCurrency: args.currency,
      initOk: false,
      initMessage: initBody.message ?? JSON.stringify(initBody),
    };
  },
});
