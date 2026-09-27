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
  VTU_PROVIDER_STATUSES,
  VTU_SERVICE_TYPES,
  VTU_TRANSACTION_STATUSES,
} from "./schema";

export { VTU_PROVIDER_STATUSES, VTU_SERVICE_TYPES, VTU_TRANSACTION_STATUSES };

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
  /** Sent upstream as ITS reference, so a retry dedupes on their side too.
   *  Without this a client retry after a timeout buys two top-ups for one
   *  charge. */
  requestId: string;
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
  timeoutMs: number;
  /** Injected so adapters are testable with no network and no credentials. */
  fetchImpl: typeof fetch;
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
