/**
 * Provider-agnostic VTU vocabulary.
 *
 * Shared by the V8 layer (`vtu.ts`, `vtuInternal.ts`), the Node action
 * (`vtuHttp.ts`), and every adapter. Not a "use node" module, so mutations may
 * import it; anything needing `crypto.subtle` or an outbound HTTP call lives in
 * `lib/encryption.ts` or `vtuProviderCall.ts`, which Convex will not let a V8
 * function import.
 *
 * The rule this file exists to enforce: no provider-specific concept appears
 * above this line. Everything here is the vocabulary an adapter maps ONTO.
 */

import { v } from "convex/values";
import {
  VTU_AUTH_SCHEMES,
  VTU_PROVIDER_STATUSES,
  VTU_SERVICE_TYPES,
  VTU_TRANSACTION_STATUSES,
} from "./schema";

export {
  VTU_AUTH_SCHEMES,
  VTU_PROVIDER_STATUSES,
  VTU_SERVICE_TYPES,
  VTU_TRANSACTION_STATUSES,
};
export type VtuAuthScheme = (typeof VTU_AUTH_SCHEMES)[number];

export const vtuServiceTypeValidator = v.union(
  ...VTU_SERVICE_TYPES.map((s) => v.literal(s)),
);
export const vtuTransactionStatusValidator = v.union(
  ...VTU_TRANSACTION_STATUSES.map((s) => v.literal(s)),
);
export const vtuProviderStatusValidator = v.union(
  ...VTU_PROVIDER_STATUSES.map((s) => v.literal(s)),
);

export type VtuServiceType = (typeof VTU_SERVICE_TYPES)[number];
export type VtuTransactionStatus = (typeof VTU_TRANSACTION_STATUSES)[number];

// ─── Provider-facing request/result types ───────────────────────────

export interface ProviderPurchaseRequest {
  /**
   * The LOGICAL identity of this purchase: the client-generated id, stable
   * across retries of the same attempt.
   *
   * Adapters that support upstream idempotency send this as their reference,
   * so a client retry after a timeout is de-duplicated on their side too.
   */
  requestId: string;
  /**
   * The PHYSICAL dispatch identity of this single outbound call — our
   * transaction id.
   *
   * Distinct from `requestId` on purpose. Some aggregators (AidaPay) reject a
   * duplicate `ref` outright with a 403, which collides with our own rule that
   * a FAILED transaction must release its key so the customer can retry using
   * the SAME request id. Forwarding the request id upstream would therefore
   * 403 every legitimate retry.
   *
   * An adapter needing a globally-unique-per-call reference uses this; one
   * that benefits from upstream dedup can use `requestId`. Our own layer
   * already guarantees a held key is never dispatched twice, so neither choice
   * can double-charge.
   */
  attemptId: string;
  serviceType: VtuServiceType;
  /** The aggregator's catalog id for the product. */
  productCode: string;
  /** Already validated and masked. */
  customerIdentifier: string;
  network?: string;
}

export interface ProviderCallOptions {
  baseUrl: string;
  /** Plaintext credential, decrypted at the call site. Never persisted. */
  apiKey: string;
  /**
   * Provider-level transaction PIN, for aggregators that require one on every
   * purchase. Opened from the provider row and passed through here so no
   * adapter has to reach for configuration itself.
   *
   * Optional, because it is a PROVIDER concept, not a platform one: Pairgate
   * has no equivalent and the value stays undefined for it. An adapter that
   * needs it must fail cleanly when it is absent rather than sending an empty
   * PIN.
   */
  accountPin?: string;
  /**
   * Header the credential is sent in, and how it is composed into that header.
   *
   * Both are DATA, read from the provider row, so retargeting a provider's
   * auth is an admin edit rather than a code change and a redeploy.
   */
  authHeader?: string;
  authScheme?: VtuAuthScheme;
  timeoutMs: number;
  /** Injected so adapters are testable with no network and no credentials. */
  fetchImpl: typeof fetch;
}

// ─── Auth header composition ───────────────────────────────────────

/**
 * Used when a row says nothing, so an unconfigured provider still sends a
 * well-formed header instead of an `Authorization: undefined`.
 */
export const DEFAULT_AUTH_HEADER = "x-api-key";

/**
 * Build the single auth header for a call, from row data.
 *
 * ONE rule, used by every adapter and by the test-connection probe, because a
 * second hand-rolled copy is how a provider ends up authenticating one call
 * correctly and the next one not at all.
 *
 * The scheme is the CLOSED enum from the schema, so this switch is exhaustive
 * by construction: adding a scheme to `VTU_AUTH_SCHEMES` turns the
 * `never` check below into a compile error here rather than a silent
 * malformed header at runtime.
 */
export function composeAuthHeader(opts: {
  authHeader?: string;
  authScheme?: VtuAuthScheme;
  apiKey: string;
}): Record<string, string> {
  const header = (opts.authHeader ?? "").trim() || DEFAULT_AUTH_HEADER;
  const scheme = opts.authScheme ?? "";

  switch (scheme) {
    case "bearer":
      return { [header]: `Bearer ${opts.apiKey}` };
    case "basic":
      return { [header]: `Basic ${opts.apiKey}` };
    case "":
      return { [header]: opts.apiKey };
    default: {
      // Unreachable while the enum is closed. Assigning to `never` is the
      // exhaustiveness assertion: it fails to COMPILE if a scheme is added
      // without being handled, which is the failure mode this whole design
      // exists to prevent.
      const unhandled: never = scheme;
      throw new Error(`Unsupported auth scheme: ${unhandled}`);
    }
  }
}

/**
 * A purchase outcome as a three-state discriminated union, not a thrown error.
 *
 * The three members drive three different ledger behaviours, and the type
 * forces every call site to handle all three:
 *   success -> the debit stands
 *   failed  -> definitive rejection; refund and release the key
 *   unknown -> we asked and the transport told us nothing. NOT a failure: the
 *              top-up may have reached the carrier, so points stay debited
 *              and the row sits in a real `unknown` state awaiting a webhook.
 */
export type ProviderPurchaseResult =
  | { status: "success"; providerReference: string; costNgn: number; raw: unknown }
  | {
      status: "failed";
      code: string;
      message: string;
      /**
       * Refused, or accepted and then withdrawn. Both refund the customer, but
       * they are different facts about what happened to their money.
       *
       * Optional because an adapter that cannot tell them apart may omit it;
       * the caller then records the conservative `provider_failed`.
       */
      failureKind?: "rejected" | "cancelled";
      providerReference?: string;
      raw: unknown;
    }
  | {
      status: "unknown";
      message: string;
      providerReference?: string;
      raw: unknown;
    };

export interface ProviderCallbackEvent {
  providerReference: string;
  outcome: "confirmed" | "failed";
  costNgn?: number;
  code?: string;
  message?: string;
  /**
   * Distinguishes a provider that rejected the purchase from one that
   * cancelled it AFTER accepting it. At least one aggregator reports these
   * separately, and collapsing them loses the ability to tell a customer
   * whether their money was refused outright or pulled back.
   */
  failureKind?: "rejected" | "cancelled";
  /** Stable across retries, so a duplicate callback is recognisable. */
  eventId?: string;
}

/**
 * The provider boundary.
 *
 * A second aggregator is a new file implementing this interface plus a
 * `vtuProviders` row. Nothing above `vtuRegistry.ts` changes.
 */
export interface VtuProviderAdapter {
  readonly name: string;
  readonly displayName: string;

  purchase(
    req: ProviderPurchaseRequest,
    opts: ProviderCallOptions,
  ): Promise<ProviderPurchaseResult>;

  /**
   * Single entry point for a webhook: verify the raw body's signature AND
   * parse it. Returns null on a bad signature, a bad parse, or an
   * unrecognised shape.
   *
   * Collapsing two methods into one is deliberate. Splitting verify and parse
   * let a call site verify and then forget to check the result — that mistake
   * compiles, ships, and silently accepts unsigned webhooks. One method
   * returning null merges "did not verify" and "did not parse" into a single
   * branch, and there is no ordering in which parsing happens first.
   */
  verifyAndParseCallback(
    rawBody: string,
    headers: Record<string, string>,
    secret: string,
  ): ProviderCallbackEvent | null;

  /**
   * Authoritative re-read of one transaction. UNUSED in slice 1.
   *
   * Present now so the slice-4 reconciliation does not change this interface.
   * Adding a method later breaks every adapter; omitting it guarantees one.
   */
  verify(
    providerReference: string,
    opts: ProviderCallOptions,
  ): Promise<ProviderPurchaseResult>;
}

// ─── Log sanitisation ───────────────────────────────────────────────

/**
 * Keys whose values must never reach a persisted `rawRequest` / `rawResponse`,
 * an audit row, or a notification.
 *
 * Matching is by substring on the key name, so `api_key`, `apiKey`,
 * `x-api-secret` and `authorization` are all caught. Nesting is bounded and
 * the output size-capped, because an aggregator response can be arbitrarily
 * large and a persisted blob that grows without bound is a storage cost with
 * no benefit.
 */
const SECRET_KEY_PATTERN =
  /(secret|password|passwd|token|authorization|auth|apikey|api_key|credential|signature|session)/i;

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 50;

/** Redact secrets and cap size in a payload destined for the database. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return null;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[max-depth]";

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key)
        ? "[redacted]"
        : sanitizeForLog(item, depth + 1);
    }
    return out;
  }
  return String(value);
}
