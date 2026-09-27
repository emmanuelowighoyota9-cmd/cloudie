"use node";

/**
 * VTU action layer.
 *
 * Lives in the Node runtime because it performs two things a V8 function
 * cannot: make outbound HTTP calls, and open a sealed credential. Both are
 * strictly server-side — the browser never sees a provider key, and never
 * chooses a price.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { decryptVtuSecret } from "./vtuCrypto";
import { getAdapter, PAIRGATE_SERVICE_LABELS } from "./vtuPairgate";
import { isValidRequestId, validateCustomerIdentifier } from "../lib/vtu";

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Explicit result shapes.
 *
 * Load-bearing, not decoration: without annotations TypeScript infers these
 * return types THROUGH the generated `internal` object, which contains these
 * very functions. The circular inference collapses them to `any` (TS7022).
 */
export interface PurchaseResult {
  requestId: string;
  /** `pending` is a real outcome, not an error: a transport timeout leaves
   *  the points debited and the row unresolved, pending a webhook or support. */
  status: string;
  transactionId?: Id<"vtuTransactions">;
  /** True when this requestId had already been seen — nothing was re-charged. */
  reused: boolean;
  result?: unknown;
}

export type CallbackVerification =
  | { verified: true }
  | {
      verified: false;
      reason:
        | "unknown_provider"
        | "no_callback_secret"
        | "secret_unreadable"
        | "missing_signature"
        | "signature_mismatch";
    };

/**
 * The master key that seals provider credentials.
 *
 * Read here, in the Node runtime, rather than returned from a query, so the
 * key never travels through a Convex function result. The user sets this in
 * the project's Keys panel as `VTU_ENCRYPTION_SECRET`.
 */
function encryptionSecret(): string {
  const value = process.env.VTU_ENCRYPTION_SECRET;
  if (!value) {
    throw new Error(
      "VTU_ENCRYPTION_SECRET is not configured. Add it in the project Keys panel.",
    );
  }
  return value;
}

/** The public-facing purchase action. */
export const runPurchase = action({
  args: {
    requestId: v.string(),
    provider: v.optional(v.string()),
    serviceType: v.union(
      v.literal("airtime"),
      v.literal("data"),
      v.literal("cable"),
      v.literal("electricity"),
      v.literal("exam"),
      v.literal("betting"),
    ),
    productCode: v.string(),
    customerIdentifier: v.string(),
    quantity: v.optional(v.number()),
    pinCount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PurchaseResult> => {
    const userId = await getAuthUserId(ctx as any);
    if (!userId) throw new Error("Unauthorized");
    if (!isValidRequestId(args.requestId)) {
      throw new Error("A valid requestId is required");
    }

    const identifier = validateCustomerIdentifier(
      args.serviceType,
      args.customerIdentifier,
    );
    if (!identifier.ok) throw new Error(identifier.error);

    // Reject absurd quantities before they reach the aggregator.
    if (args.pinCount !== undefined && (args.pinCount < 1 || args.pinCount > 20)) {
      throw new Error("Choose between 1 and 20 PINs");
    }
    if (args.quantity !== undefined && (args.quantity < 1 || args.quantity > 100)) {
      throw new Error("Quantity is out of range");
    }

    const provider = args.provider ?? "pairgate";
    const adapter = getAdapter(provider);
    if (!adapter) throw new Error("Unsupported payment provider");

    // 1. Reserve: idempotency, rate limit, catalog price, ledger debit. All
    //    transactional, so a failure here leaves no money taken.
    const reserved = await ctx.runMutation(internal.vtuInternal.reserveTransaction, {
      userId,
      requestId: args.requestId,
      provider,
      serviceType: args.serviceType,
      productCode: args.productCode,
      customerIdentifier: identifier.value,
      quantity: args.quantity,
      pinCount: args.pinCount,
    });

    if (reserved.already) {
      // A retry of a request we have already seen. Never re-charge.
      return {
        requestId: args.requestId,
        status: reserved.status,
        reused: true,
      };
    }

    const transactionId: Id<"vtuTransactions"> = reserved.transactionId;

    // 2. Load the provider row and open the sealed credential.
    const providerRow = await ctx.runQuery(
      internal.vtuInternal.getProviderConfig,
      { provider },
    );
    if (!providerRow) {
      const result = await ctx.runMutation(internal.vtuInternal.finalizeTransaction, {
        transactionId,
        result: {
          status: "failed",
          code: "PROVIDER_NOT_CONFIGURED",
          message: "This payment provider is not configured",
        },
      });
      return {
        requestId: args.requestId,
        status: "reversed",
        transactionId,
        reused: false,
        result,
      };
    }

    let apiKey: string;
    try {
      apiKey = decryptVtuSecret(providerRow.encryptedSecret, encryptionSecret());
    } catch {
      // A credential that cannot be opened is a configuration failure, not a
      // customer failure — but the debit must still be returned, so this
      // routes through `failed` and reverses like any other rejection.
      const result = await ctx.runMutation(internal.vtuInternal.finalizeTransaction, {
        transactionId,
        result: {
          status: "failed",
          code: "CREDENTIAL_UNAVAILABLE",
          message: "Payment provider credential could not be read",
        },
      });
      return {
        requestId: args.requestId,
        status: "reversed",
        transactionId,
        reused: false,
        result,
      };
    }

    // 3. Call the aggregator.
    const outcome = await adapter.purchase(
      {
        requestId: args.requestId,
        serviceType: args.serviceType,
        productCode: args.productCode,
        customerIdentifier: identifier.value,
        quantity: args.quantity,
        pinCount: args.pinCount,
      },
      {
        baseUrl: providerRow.baseUrl,
        apiKey,
        timeoutMs: providerRow.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetchImpl: fetch,
      },
    );

    // 4. Record the outcome. Success/failure resolve here; `unknown` leaves
    //    the row pending with the points still debited.
    const result = await ctx.runMutation(internal.vtuInternal.finalizeTransaction, {
      transactionId,
      result:
        outcome.status === "success"
          ? {
              status: "success" as const,
              providerReference: outcome.providerReference,
              costNgn: outcome.costNgn,
              serial: outcome.serial,
              pin: outcome.pin,
              raw: outcome.raw,
            }
          : outcome.status === "failed"
            ? {
                status: "failed" as const,
                code: outcome.code,
                message: outcome.message,
                providerReference: outcome.providerReference,
                raw: outcome.raw,
              }
            : {
                status: "unknown" as const,
                message: outcome.message,
                providerReference: outcome.providerReference,
                raw: outcome.raw,
              },
    });

    return {
      requestId: args.requestId,
      status: result.status,
      transactionId,
      reused: false,
      result,
    };
  },
});

/**
 * Verify a provider callback over its RAW body.
 *
 * Split out from the HTTP handler because Convex's HTTP runtime has no
 * `node:crypto` — the handler reads the raw text and delegates here, exactly
 * as the Paystack webhook does.
 *
 * The `rawBody` string is passed through untouched. Parsing and re-serializing
 * would change the bytes and the HMAC would not match, which is the usual way
 * these checks break silently.
 */
export const verifyVtuCallback = internalAction({
  args: {
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CallbackVerification> => {
    const provider = args.provider ?? "pairgate";
    const adapter = getAdapter(provider);
    if (!adapter) return { verified: false, reason: "unknown_provider" };

    const config = await ctx.runQuery(internal.vtuInternal.getProviderConfig, { provider });
    if (!config?.encryptedCallbackSecret) {
      return { verified: false, reason: "no_callback_secret" };
    }

    let secret: string;
    try {
      secret = decryptVtuSecret(config.encryptedCallbackSecret, encryptionSecret());
    } catch {
      return { verified: false, reason: "secret_unreadable" };
    }

    const headerName = (config.callbackSignatureHeader ?? "x-signature").toLowerCase();
    // Collect every plausible header spelling: the signature may arrive under
    // the configured name, a vendor-specific one, or a prefixed variant.
    const lowered: Record<string, string> = {};
    for (const [k, val] of Object.entries(args.headers)) {
      lowered[k.toLowerCase()] = val;
    }
    const signature =
      lowered[headerName] ??
      lowered["x-signature"] ??
      lowered["x-pairgate-signature"] ??
      lowered["signature"] ??
      "";

    if (!signature) return { verified: false, reason: "missing_signature" };

    const verified = adapter.verifyCallback(args.rawBody, lowered, secret);
    return verified ? { verified: true } : { verified: false, reason: "signature_mismatch" };
  },
});

/**
 * Process a verified provider callback end to end.
 *
 * Verification happens in {@link verifyVtuCallback} and MUST succeed before
 * this runs — the HTTP route enforces that ordering. An unparseable body is
 * acknowledged rather than rejected, so the aggregator stops retrying
 * something that will never resolve.
 */
export type CallbackHandleResult =
  | { ok: false; reason: "unknown_provider" }
  | { ok: true; reason: "unrecognised_payload" }
  | { ok: true; result: unknown };

export const handleVtuCallback = internalAction({
  args: {
    rawBody: v.string(),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CallbackHandleResult> => {
    const provider = args.provider ?? "pairgate";
    const adapter = getAdapter(provider);
    if (!adapter) return { ok: false, reason: "unknown_provider" };

    const event = adapter.parseCallback(args.rawBody);
    if (!event) return { ok: true, reason: "unrecognised_payload" };

    const result = await ctx.runMutation(internal.vtuInternal.applyCallback, {
      provider,
      event: {
        providerReference: event.providerReference,
        outcome: event.outcome,
        costNgn: event.costNgn,
        code: event.code,
        message: event.message,
        serial: event.serial,
        pin: event.pin,
        eventId: event.eventId,
      },
    });

    return { ok: true, result };
  },
});

/** Human labels for the purchase page. */
export const serviceLabels = action({
  args: {},
  handler: async () => PAIRGATE_SERVICE_LABELS,
});
