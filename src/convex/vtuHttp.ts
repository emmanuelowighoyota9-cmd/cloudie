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
import { vtuDeliveryValidator } from "./vtuSchema/types";
import type { VtuDelivery } from "./vtuSchema/types";
import {
  isValidRequestId,
  parseServiceCode,
  validateCustomerIdentifier,
} from "../lib/vtu";
import type {
  ProviderCallOptions,
  ProviderPurchaseRequest,
  ProviderPurchaseResult,
  VtuProviderAdapter,
  VtuServiceType,
} from "./vtuShared";

/**
 * The provider slice 1 shipped with, used ONLY as the webhook's fallback
 * provider hint.
 *
 * There is deliberately no default for the PURCHASE path: routing decides, and
 * a product with no live route fails rather than being sent somewhere the
 * operator did not choose. This constant survives for the one place a
 * provider must be named before a transaction exists — the webhook, which
 * arrives with only a header hint.
 */
const WEBHOOK_PROVIDER_FALLBACK = "pairgate";

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
  /** A machine-readable failure code, so the page can tell "no provider
   *  serves this product" from "the provider rejected the purchase". */
  code?: string;
}

export interface CallbackVerification {
  verified: boolean;
  reason?:
    | "unknown_provider"
    | "no_callback_secret"
    | "secret_unreadable"
    | "missing_signature"
    | "signature_mismatch"
    | "unparseable"
    /** OUR adapter cannot process callbacks. Distinct from every other reason
     *  because none of them are the aggregator's fault, and the HTTP layer
     *  answers it with a different status for exactly that reason. */
    | "adapter_incomplete"
    /** Same cause, later symptom: the method exists and threw on a payload it
     *  did not guard — the shape a bad classifier produces. Still ours, still
     *  not retryable by the aggregator. */
    | "adapter_error";
  event?: {
    providerReference: string;
    outcome: "confirmed" | "failed";
    costNgn?: number;
    code?: string;
    message?: string;
    failureKind?: "rejected" | "cancelled";
    /** What the customer needs from a delivered purchase — a meter token and
     *  its units. Absent on every callback that delivers nothing of the kind. */
    delivery?: VtuDelivery;
    eventId?: string;
  };
}

/**
 * Call an adapter's `purchase` without letting the adapter's own defect escape.
 *
 * The debit has already committed by the time this runs, so an exception
 * reaching the action would strand the points in `pending` and hand the client
 * a 500 for a failure we could have described. `unknown` is the honest result:
 * an adapter throws when something it expected is missing or a response shape
 * it did not guard against arrives, and in that moment we genuinely do not know
 * whether the request reached the carrier — so the points stay debited and the
 * row becomes pollable by the reconciliation sweep, which is the same state a
 * transport timeout produces and the same one that already has a recovery path.
 *
 * Refunding here instead would return money for a top-up that may have been
 * delivered, which is the one thing this system never does by accident.
 *
 * `try`/`await` rather than `.catch()` deliberately: a method that throws
 * synchronously (a non-async implementation, a helper evaluated at call time)
 * never produces a promise for `.catch` to attach to, so only `try` covers
 * both shapes.
 */
async function callPurchase(
  adapter: VtuProviderAdapter,
  req: ProviderPurchaseRequest,
  opts: ProviderCallOptions,
): Promise<ProviderPurchaseResult> {
  try {
    return await adapter.purchase(req, opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider call failed";
    return { status: "unknown", message, raw: { thrown: message } };
  }
}

/**
 * Drive one VTU purchase — airtime, data, cable, or electricity: reserve, mark
 * processing, call the provider, record the outcome, and refund on a
 * definitive failure.
 *
 * ONE action for every service type. What varies between them is the service
 * code's shape and the destination-number rules, and both are decided by data
 * (the catalog row and the per-type validator) rather than by a branch here —
 * which is why adding a fifth service type needs no change to the money path.
 *
 * Note the return value is NOT a success signal. It reports what the record
 * says; the page renders that through a subscription, because a transport
 * timeout legitimately leaves the transaction in `unknown`.
 */
export const purchaseVtu = action({
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
    // Per service type: a phone for airtime/data, a smartcard for cable, a
    // meter for electricity. Checked here so a malformed destination never
    // reaches the reservation, and again in the mutation that owns the write.
    const identity = validateCustomerIdentifier(parsed.serviceType, args.customerIdentifier);
    if (!identity.ok) throw new Error(identity.error);

    // 1. Reserve: ROUTING, idempotency, rate limit, price, and the ledger
    //    debit, all in one mutation. A routing failure throws before the
    //    claim and the debit, so nothing is charged.
    let reserved:
      | {
          reused: true;
          transactionId: Id<"vtuTransactions">;
          status: string;
          pointsDebited: number;
        }
      | {
          reused: false;
          transactionId: Id<"vtuTransactions">;
          status: "pending";
          pointsDebited: number;
          routedProvider: string;
          routedProviderProductCode: string;
          routedProviderPackageCode: string | null;
          /** The catalog's schema-validated type, passed to the adapter. */
          serviceType: VtuServiceType;
        };
    try {
      reserved = await ctx.runMutation(internal.vtuInternal.beginPurchase, {
        userId,
        clientRequestId: args.clientRequestId,
        serviceCode: args.serviceCode,
        customerIdentifier: identity.value,
      });
    } catch (e) {
      // Checked STRUCTURALLY, not with `instanceof`: Convex serialises a
      // thrown error when it crosses the mutation -> action boundary, so the
      // class identity does not survive and only the `code` property does.
      const code = (e as { code?: unknown } | null | undefined)?.code;
      if (typeof code !== "string") throw e;
      return {
        requestId: args.clientRequestId,
        status: "rejected",
        reused: false,
        code,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    if (reserved.reused) {
      return {
        requestId: args.clientRequestId,
        status: reserved.status,
        transactionId: reserved.transactionId,
        reused: true,
      };
    }

    const transactionId = reserved.transactionId;

    /**
     * Every post-debit failure funnels through here, so points always come
     * back.
     *
     * It is also the ONE place `pending -> failed` is legitimate, and it says
     * so with `source: "dispatch"`: this runs before any HTTP call was made, so
     * "nothing was sent" is a fact this action knows and the transaction's
     * status alone cannot express. Without that distinction the only honest
     * outcome for a missing credential would be a row stuck in `pending` with
     * the customer's points still spent.
     */
    const fail = async (
      code: string,
      message: string,
      // A cancellation is the provider pulling back a purchase it had already
      // accepted; everything else here is a plain provider-side failure. Both
      // refund, so the difference is recorded rather than acted on.
      reversalReason: "provider_failed" | "provider_cancelled" = "provider_failed",
    ): Promise<PurchaseResult> => {
      const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
        transactionId,
        source: "dispatch",
        verdict: { status: "failed", reversalReason, code, message },
      });
      return {
        requestId: args.clientRequestId,
        status: settled.settled ? settled.status : "unchanged",
        transactionId,
        reused: false,
        error: message,
        // The typed code the caller already had — surfaced rather than
        // swallowed, because "the provider rejected this" and "the provider's
        // adapter is not implemented" need different responses from the page
        // and from an operator reading a failed purchase.
        code,
      };
    };

    // 2. Open the ROUTED provider's credential. The name comes from the
    //    snapshot `beginPurchase` wrote, so this cannot drift from the route
    //    that was charged for.
    //
    // The adapter comes from the registry and the credential is opened INSIDE
    // this action — the plaintext key never crosses a mutation boundary, never
    // appears in a query result, and is never logged. Every failure mode is a
    // typed code; there is no env fallback under any condition.
    const call = await openForPurchase(ctx, reserved.routedProvider);
    if (!call.ok) return fail(call.code, "This payment provider is not available");

    // 3. pending -> processing, immediately before dispatch.
    await ctx.runMutation(internal.vtuInternal.markProcessing, { transactionId });

    // 4. Call the aggregator, through the wrapper below.
    const outcome = await callPurchase(
      call.adapter,
      {
        requestId: args.clientRequestId,
        // Physical dispatch identity: a fresh value per attempt, so an adapter
        // that needs a never-repeating upstream `ref` gets one. The logical
        // id above is what the CLIENT retries with.
        attemptId: transactionId,
        // The catalog's own service type, carried through the reservation.
        // Never re-derived here: an adapter must be told the same type the
        // routed product was configured with.
        serviceType: reserved.serviceType,
        // The PROVIDER's product code, from the route — not our service code.
        // This is the single translation point between the two namespaces.
        productCode: reserved.routedProviderProductCode,
        // The face value, for an aggregator whose purchase endpoint takes the
        // size as its own number rather than inside the product code (AidaPay).
        // Pairgate ignores this — its code already carries `{amount}`.
        ...(parsed.amountNgn !== null ? { amountNgn: parsed.amountNgn } : {}),
        ...(reserved.routedProviderPackageCode
          ? { providerPackageCode: reserved.routedProviderPackageCode }
          : {}),
        customerIdentifier: identity.value,
        network: parsed.network,
      },
      call.opts,
    );

    // 5. Settle. ONE mutation decides the terminal state and moves the ledger
    //    with it: `success` stands, `failed` refunds and releases the key.
    //
    //    `unknown` is deliberately not settled here — it is not terminal. The
    //    points stay debited and the row waits for a webhook or the sweep,
    //    which is the only honest thing to do when the transport told us
    //    nothing about a top-up that may already have reached the carrier.
    if (outcome.status === "unknown") {
      const marked = await ctx.runMutation(internal.vtuInternal.markUnknown, {
        transactionId,
        source: "dispatch",
        message: outcome.message,
        providerReference: outcome.providerReference,
        raw: outcome.raw,
      });
      return {
        requestId: args.clientRequestId,
        status: marked.applied ? "unknown" : "unchanged",
        transactionId,
        reused: false,
      };
    }

    const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
      transactionId,
      source: "dispatch",
      verdict:
        outcome.status === "success"
          ? {
              status: "confirmed",
              providerReference: outcome.providerReference,
              costNgn: outcome.costNgn,
              // A synced success can already carry the token — the buy call is
              // where a meter token arrives when the provider answers inline
              // rather than by webhook.
              ...(outcome.delivery ? { delivery: outcome.delivery } : {}),
              raw: outcome.raw,
            }
          : {
              status: "failed",
              // The adapter told us which kind of failure it was; an adapter
              // that could not tell us defaults to the conservative
              // provider_failed.
              reversalReason:
                outcome.failureKind === "cancelled" ? "provider_cancelled" : "provider_failed",
              code: outcome.code,
              message: outcome.message,
              providerReference: outcome.providerReference,
              raw: outcome.raw,
            },
    });

    return {
      requestId: args.clientRequestId,
      status: settled.settled ? settled.status : "unchanged",
      transactionId,
      reused: false,
      ...(outcome.status === "failed" ? { error: outcome.message } : {}),
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
    const provider = args.provider ?? WEBHOOK_PROVIDER_FALLBACK;

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
    //
    // Guarded because the alternative is a TypeError escaping this action,
    // which the HTTP layer sees as a 500 — and a 500 is the one answer that
    // makes an aggregator retry forever against a handler that cannot improve.
    // Returning a typed reason instead lets the route answer with a 4xx and
    // lets reconciliation, which does not need this method, settle the row.
    if (typeof call.adapter.verifyAndParseCallback !== "function") {
      return { verified: false, reason: "adapter_incomplete" };
    }

    // Two failure modes, two reasons. The guard above catches a method that is
    // absent; this catches a method that exists and throws. Both are our
    // defect, both must be a 4xx and never a 500, and the body must never be
    // treated as authenticated.
    let event: ReturnType<typeof call.adapter.verifyAndParseCallback>;
    try {
      event = call.adapter.verifyAndParseCallback(
        args.rawBody,
        lowered,
        call.opts.apiKey,
      );
    } catch {
      return { verified: false, reason: "adapter_error" };
    }
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
        ...(event.delivery ? { delivery: event.delivery } : {}),
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
      delivery: v.optional(vtuDeliveryValidator),
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

    // One owner for the transition, whichever path we arrived from. The
    // reversal is NOT a second call: `settleTransaction` moves the status and
    // the ledger together, which is what makes a webhook landing in the same
    // tick as a reconciliation verdict settle exactly once instead of paying
    // the customer twice.
    const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
      transactionId,
      source: "webhook",
      verdict:
        args.event.outcome === "confirmed"
          ? {
              status: "confirmed",
              providerReference: args.event.providerReference,
              costNgn: args.event.costNgn,
              // Carried straight to the row: for prepaid electricity the token
              // IS the delivery, and dropping it here would confirm a purchase
              // the customer cannot use.
              ...(args.event.delivery ? { delivery: args.event.delivery } : {}),
              raw: { via: "webhook", eventId: args.event.eventId ?? null },
            }
          : {
              status: "failed",
              reversalReason:
                args.event.failureKind === "cancelled" ? "provider_cancelled" : "provider_failed",
              providerReference: args.event.providerReference,
              code: args.event.code,
              message: args.event.message ?? "Provider reported failure",
              raw: { via: "webhook", eventId: args.event.eventId ?? null },
            },
    });

    if (!settled.settled) {
      return {
        applied: false,
        outcome: args.event.outcome,
        status: "unchanged",
        reason: settled.reason,
      };
    }

    return { applied: true, outcome: args.event.outcome, status: settled.status };
  },
});
