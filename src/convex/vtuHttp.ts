"use node";

/**
 * VTU action layer.
 *
 * A Node runtime because it does two things a V8 function cannot: make
 * outbound HTTP calls and open a sealed credential. Both are server-side — the
 * browser never sees a provider key, and never chooses a price.
 *
 * Adapters are resolved through `getAdapter()`, never imported directly, so no
 * call site above this file knows Pairgate exists.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { openForPurchase, openForVerification } from "./vtuProviderCall";
import { isValidRequestId, parseServiceCode, validatePhone } from "../lib/vtu";

/** The provider slice 1 ships with. Resolved via the registry, not imported. */
const DEFAULT_PROVIDER = "pairgate";

/**
 * Explicit result shapes.
 *
 * Load-bearing, not decoration: without annotations TypeScript infers these
 * return types THROUGH the generated `internal` object, which contains these
 * very functions. That circular inference collapses them to `any` (TS7022).
 */
export interface PurchaseResult {
  requestId: string;
  /** `pending` is a real outcome, not an error. */
  status: string;
  transactionId?: Id<"vtuTransactions">;
  /** True when this requestId was already seen — nothing was re-charged. */
  reused: boolean;
  error?: string;
}

export interface CallbackVerification {
  verified: boolean;
  reason?:
    | "unknown_provider"
    | "no_callback_secret"
    | "secret_unreadable"
    | "missing_signature"
    | "signature_mismatch"
    | "unparseable";
  event?: {
    providerReference: string;
    outcome: "confirmed" | "failed";
    costNgn?: number;
    code?: string;
    message?: string;
    failureKind?: "rejected" | "cancelled";
    eventId?: string;
  };
}

/**
 * Drive one airtime purchase: reserve, mark processing, call the provider,
 * record the outcome, and refund on a definitive failure.
 *
 * Note the return value is NOT a success signal. It reports what the record
 * says; the page renders that through a subscription, because a transport
 * timeout legitimately leaves the transaction in `unknown`.
 */
export const purchaseAirtime = action({
  args: {
    clientRequestId: v.string(),
    serviceCode: v.string(),
    customerIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<PurchaseResult> => {
    const userId = await getAuthUserId(ctx as any);
    if (!userId) throw new Error("Unauthorized");
    if (!isValidRequestId(args.clientRequestId)) {
      throw new Error("A valid clientRequestId is required");
    }

    const parsed = parseServiceCode(args.serviceCode);
    if (!parsed) throw new Error("Unsupported product");
    const phone = validatePhone(args.customerIdentifier);
    if (!phone.ok) throw new Error(phone.error);

    // 1. Reserve: idempotency, rate limit, price, and the ledger debit, all
    //    in one mutation.
    const reserved = await ctx.runMutation(internal.vtuInternal.beginPurchase, {
      userId,
      clientRequestId: args.clientRequestId,
      serviceCode: args.serviceCode,
      customerIdentifier: phone.value,
      provider: DEFAULT_PROVIDER,
    });

    if (reserved.reused) {
      return {
        requestId: args.clientRequestId,
        status: reserved.status,
        transactionId: reserved.transactionId,
        reused: true,
      };
    }

    const transactionId = reserved.transactionId;

    /** Every post-debit failure funnels through here, so points always come back. */
    const fail = async (
      code: string,
      message: string,
      // A cancellation is the provider pulling back a purchase it had already
      // accepted; everything else here is a plain provider-side failure. Both
      // refund, so the difference is recorded rather than acted on.
      reversalReason: "provider_failed" | "provider_cancelled" = "provider_failed",
    ): Promise<PurchaseResult> => {
      const outcome = await ctx.runMutation(internal.vtuInternal.recordOutcome, {
        transactionId,
        outcome: { status: "failed", code, message },
        source: "provider_response",
      });
      if (outcome.applied && outcome.status === "failed") {
        await ctx.runMutation(internal.vtuInternal.refundAndRelease, {
          transactionId,
          reason: message,
          reversalReason,
        });
      }
      return {
        requestId: args.clientRequestId,
        status: "reversed",
        transactionId,
        reused: false,
        error: message,
      };
    };

    // 2. Resolve the provider and open its credential.
    //
    // The adapter comes from the registry and the credential is opened INSIDE
    // this action — the plaintext key never crosses a mutation boundary, never
    // appears in a query result, and is never logged. Every failure mode is a
    // typed code; there is no env fallback under any condition.
    const call = await openForPurchase(ctx, DEFAULT_PROVIDER);
    if (!call.ok) return fail(call.code, "This payment provider is not available");

    // 3. pending -> processing, immediately before dispatch.
    await ctx.runMutation(internal.vtuInternal.markProcessing, { transactionId });

    // 4. Call the aggregator.
    const outcome = await call.adapter.purchase(
      {
        requestId: args.clientRequestId,
        // Physical dispatch identity: a fresh value per attempt, so an adapter
        // that needs a never-repeating upstream `ref` gets one. The logical
        // id above is what the CLIENT retries with.
        attemptId: transactionId,
        serviceType: "airtime",
        productCode: args.serviceCode,
        customerIdentifier: phone.value,
        network: parsed.network,
      },
      call.opts,
    );

    // 5. Record it. `success` stands, `unknown` waits for a webhook with the
    //    points still debited, `failed` refunds and releases the key.
    const recorded = await ctx.runMutation(internal.vtuInternal.recordOutcome, {
      transactionId,
      source: "provider_response",
      outcome:
        outcome.status === "success"
          ? {
              status: "success",
              providerReference: outcome.providerReference,
              costNgn: outcome.costNgn,
              raw: outcome.raw,
            }
          : outcome.status === "failed"
            ? {
                status: "failed",
                code: outcome.code,
                message: outcome.message,
                ...(outcome.failureKind ? { failureKind: outcome.failureKind } : {}),
                providerReference: outcome.providerReference,
                raw: outcome.raw,
              }
            : {
                status: "unknown",
                message: outcome.message,
                providerReference: outcome.providerReference,
                raw: outcome.raw,
              },
    });

    if (recorded.applied && recorded.status === "failed") {
      await ctx.runMutation(internal.vtuInternal.refundAndRelease, {
        transactionId,
        reason: "Provider rejected the purchase",
        // The adapter told us which kind of failure it was; an adapter that
        // could not tell us defaults to the conservative provider_failed.
        reversalReason:
          outcome.status === "failed" && outcome.failureKind === "cancelled"
            ? "provider_cancelled"
            : "provider_failed",
      });
      return {
        requestId: args.clientRequestId,
        status: "reversed",
        transactionId,
        reused: false,
        error: "Provider rejected the purchase",
      };
    }

    return {
      requestId: args.clientRequestId,
      status: recorded.applied ? recorded.status : "unchanged",
      transactionId,
      reused: false,
    };
  },
});

/**
 * Verify a provider callback over its RAW body.
 *
 * Split from the HTTP handler because Convex's HTTP runtime has no
 * `node:crypto`. The `rawBody` string is passed through untouched: parsing and
 * re-serializing would change the bytes and the HMAC would not match.
 *
 * The provider name arrives from the HTTP layer, which reads it from a HEADER.
 * It is never taken from the body — an unsigned body field would let a caller
 * choose which secret we verify against.
 */
function hasSignatureHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.includes("signature"));
}

export const verifyCallback = internalAction({
  args: {
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CallbackVerification> => {
    const provider = args.provider ?? DEFAULT_PROVIDER;

    // Webhook verification deliberately resolves even for a DISABLED
    // provider: transactions dispatched before it was disabled must still be
    // able to complete. Only a missing row or an unopenable secret fails.
    const call = await openForVerification(ctx, provider);
    if (!call.ok) {
      return {
        verified: false,
        reason:
          call.code === "CREDENTIAL_MISSING"
            ? "no_callback_secret"
            : call.code === "CREDENTIAL_CORRUPT"
              ? "secret_unreadable"
              : "unknown_provider",
      };
    }

    // Lowercase every header name so lookup is case-insensitive.
    const lowered: Record<string, string> = {};
    for (const [k, val] of Object.entries(args.headers)) lowered[k.toLowerCase()] = val;

    // Honour the row's admin-configured signature header by aliasing it onto
    // every name the adapter checks, so changing the header needs no code
    // change and no redeploy.
    const configured = call.signatureHeader?.toLowerCase();
    if (configured && lowered[configured]) {
      for (const alias of ["x-signature", "x-pairgate-signature", "signature"]) {
        lowered[alias] ??= lowered[configured];
      }
    }

    if (!hasSignatureHeader(lowered)) {
      return { verified: false, reason: "missing_signature" };
    }

    // ONE call: verify AND parse. Null means the body did not authenticate.
    const event = call.adapter.verifyAndParseCallback(
      args.rawBody,
      lowered,
      call.opts.apiKey,
    );
    if (!event) return { verified: false, reason: "signature_mismatch" };

    return {
      verified: true,
      event: {
        providerReference: event.providerReference,
        outcome: event.outcome,
        costNgn: event.costNgn,
        code: event.code,
        message: event.message,
        failureKind: event.failureKind,
        eventId: event.eventId,
      },
    };
  },
});

export interface CallbackApplyResult {
  applied: boolean;
  outcome?: string;
  status?: string;
  reason?: string;
}

/**
 * Apply a verified callback to its transaction.
 *
 * The provider reference is the join key. Terminal transactions are no-ops,
 * which is what makes a duplicate webhook harmless, and an unmatched reference
 * is audited rather than rejected so the aggregator stops retrying something
 * that will never resolve on our side.
 */
export const applyCallback = internalAction({
  args: {
    provider: v.string(),
    event: v.object({
      providerReference: v.string(),
      outcome: v.union(v.literal("confirmed"), v.literal("failed")),
      costNgn: v.optional(v.number()),
      code: v.optional(v.string()),
      message: v.optional(v.string()),
      failureKind: v.optional(v.union(v.literal("rejected"), v.literal("cancelled"))),
      eventId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<CallbackApplyResult> => {
    const transactionId = await ctx.runQuery(
      internal.vtuInternal.findByProviderReference,
      { provider: args.provider, providerReference: args.event.providerReference },
    );

    if (!transactionId) {
      await ctx.runMutation(internal.vtuInternal.auditUnmatchedCallback, {
        provider: args.provider,
        providerReference: args.event.providerReference,
      });
      return { applied: false, outcome: "unmatched" };
    }

    // One owner for the transition, whichever path we arrived from.
    const recorded = await ctx.runMutation(internal.vtuInternal.recordOutcome, {
      transactionId,
      source: "webhook",
      outcome:
        args.event.outcome === "confirmed"
          ? {
              status: "success",
              providerReference: args.event.providerReference,
              costNgn: args.event.costNgn,
              raw: { via: "webhook", eventId: args.event.eventId ?? null },
            }
          : {
              status: "failed",
              providerReference: args.event.providerReference,
              code: args.event.code,
              message: args.event.message ?? "Provider reported failure",
              raw: { via: "webhook", eventId: args.event.eventId ?? null },
            },
    });

    if (recorded.applied && recorded.status === "failed") {
      await ctx.runMutation(internal.vtuInternal.refundAndRelease, {
        transactionId,
        reason: args.event.message ?? "Provider reported failure",
        reversalReason:
          args.event.failureKind === "cancelled" ? "provider_cancelled" : "provider_failed",
      });
      return { applied: true, outcome: "failed", status: "reversed" };
    }

    return {
      applied: recorded.applied,
      outcome: args.event.outcome,
      status: recorded.applied ? recorded.status : "unchanged",
      ...(recorded.applied ? {} : { reason: "illegal_transition" }),
    };
  },
});
