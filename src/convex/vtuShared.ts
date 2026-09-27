/**
 * Server-side VTU vocabulary shared by the V8 layer (`vtu.ts`), the Node
 * action (`vtuHttp.ts`), and the Pairgate adapter (`vtuPairgate.ts`).
 *
 * This file is NOT a "use node" module, so mutations and queries may import it.
 * Anything needing `node:crypto` lives in `vtuCrypto.ts` or `vtuPairgate.ts`,
 * which Convex will not let a V8 function import.
 *
 * The rule this file exists to enforce: no provider-specific concept appears
 * above this line. Everything here is the vocabulary an aggregator adapter
 * maps *onto*.
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
  /** Namespaced idempotency key, forwarded upstream as its own reference. */
  requestId: string;
  serviceType: VtuServiceType;
  /** Provider's catalog identifier, sent verbatim. */
  productCode: string;
  /** Phone, meter, smartcard or betting user id — already validated. */
  customerIdentifier: string;
  quantity?: number;
  pinCount?: number;
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
 * A purchase outcome as a discriminated union rather than a thrown error.
 *
 * The three members drive three different ledger behaviours, and the type
 * forces every call site to handle all three:
 *   success → debit stands
 *   failed  → reverse immediately, points returned
 *   unknown → leave `pending`; reversing a timeout would refund airtime that
 *              may genuinely have been delivered
 */
export type ProviderPurchaseResult =
  | {
      status: "success";
      providerReference: string;
      costNgn: number;
      serial?: string;
      pin?: string;
      raw: unknown;
    }
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
  outcome: "success" | "failed";
  costNgn?: number;
  code?: string;
  message?: string;
  serial?: string;
  pin?: string;
  /** Stable across retries, so a duplicate callback is recognisable. */
  eventId?: string;
}

/**
 * The provider boundary. A second aggregator is a new file implementing this
 * interface plus one row in `vtuProviders` — no other file changes.
 */
export interface VtuProviderAdapter {
  readonly name: string;
  readonly displayName: string;

  purchase(
    req: ProviderPurchaseRequest,
    opts: ProviderCallOptions,
  ): Promise<ProviderPurchaseResult>;

  /**
   * Verify a callback over the RAW body string.
   *
   * Must use a timing-safe comparison. Never accept a pre-parsed object: JSON
   * re-serialization changes the bytes and the HMAC will not match.
   */
  verifyCallback(
    rawBody: string,
    headers: Record<string, string>,
    secret: string,
  ): boolean;

  /** Parse a callback body. Return null when the shape is unrecognised. */
  parseCallback(rawBody: string): ProviderCallbackEvent | null;
}

// ─── Log sanitisation ───────────────────────────────────────────────

/**
 * Keys whose values must never reach a persisted `rawRequest` / `rawResponse`,
 * an audit row, or a notification.
 *
 * Matching is by substring on the key name, so `api_key`, `apiKey`,
 * `x-api-secret` and `authorization` are all caught. Nesting is walked to a
 * bounded depth and the output is size-capped, because an aggregator response
 * can be arbitrarily large and a persisted blob that grows without bound is a
 * storage cost with no benefit.
 */
const SECRET_KEY_PATTERN =
  /(secret|password|passwd|token|authorization|apikey|api_key|credential|signature|session)/i;

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 50;

/** Redact secrets and cap size in a payload destined for the database. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[max-depth]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForLog(item, depth + 1));
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
