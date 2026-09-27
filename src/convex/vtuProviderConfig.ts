/**
 * Provider resolution — the V8 half, and the only part a client can never
 * reach indirectly.
 *
 * Split from the Node-side registry deliberately:
 *   - this file runs in the V8 runtime, so `convex-test` can exercise it
 *   - it returns SEALED fields only, so no subscriber can receive a plaintext
 *     credential even in principle
 *
 * The Node half in `vtuProviderCall.ts` adds the two failures that can only be
 * detected by actually opening the credential: `ADAPTER_UNKNOWN` and
 * `CREDENTIAL_CORRUPT`.
 */

import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

export type ProviderConfigErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_DISABLED"
  | "CREDENTIAL_MISSING";

/**
 * A resolution result, not a thrown error.
 *
 * A discriminated union means a caller cannot forget a failure branch, and it
 * carries a code rather than a message so nothing derived from a credential
 * can leak into a UI or an audit row.
 */
export type ProviderResolution =
  | { ok: true; provider: Doc<"vtuProviders"> }
  | { ok: false; code: ProviderConfigErrorCode };

/**
 * Resolve a provider by name, for use by a NEW purchase.
 *
 * Only `status === "active"` resolves. `sandbox` deliberately does not: a
 * sandbox key is for integration work, and routing live customer money at one
 * is a mistake this check prevents rather than documents.
 *
 * NOTE: this is the ONLY place provider configuration is read, and it reads
 * the table and nothing else. There is no env fallback under any condition —
 * a row that is missing or disabled fails loudly, because a silent fallback to
 * a deleted credential is far harder to diagnose during an incident than a
 * typed error.
 */
export const resolveForPurchase = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<ProviderResolution> => {
    const provider = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (!provider) return { ok: false, code: "PROVIDER_NOT_FOUND" };
    if (provider.status !== "active") return { ok: false, code: "PROVIDER_DISABLED" };
    if (!provider.encryptedApiKey) return { ok: false, code: "CREDENTIAL_MISSING" };

    return { ok: true, provider };
  },
});

/**
 * Resolve a provider for webhook VERIFICATION only.
 *
 * Deliberately more permissive than {@link resolveForPurchase}: a provider
 * that has just been disabled must still be able to verify callbacks for
 * transactions it dispatched before the change, otherwise those customers'
 * money moves into an unrecoverable `unknown` state. `disabled` and `sandbox`
 * both verify; only a missing row or a missing secret fails.
 *
 * The webhook secret is required here and NOT in the purchase path — a
 * provider's webhook secret is a different credential from its API key and is
 * rotated independently.
 */
export const resolveForVerification = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<ProviderResolution> => {
    const provider = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (!provider) return { ok: false, code: "PROVIDER_NOT_FOUND" };
    if (!provider.encryptedWebhookSecret) {
      return { ok: false, code: "CREDENTIAL_MISSING" };
    }

    return { ok: true, provider };
  },
});
