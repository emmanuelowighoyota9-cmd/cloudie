"use node";

/**
 * Pairgate VTU adapter.
 *
 * Every Pairgate-specific detail lives in this file. Everything else is
 * written against `VtuProviderAdapter` via `vtuRegistry.getAdapter()`, so a
 * second aggregator is a new adapter file plus a `vtuProviders` row.
 *
 * ── On the endpoint paths ────────────────────────────────────────────
 * Pairgate publishes no API spec, so the paths and field names below are the
 * ones to confirm against the Pairgate dashboard before going live. They are
 * isolated in `purchasePath()` and `mapPurchaseResponse()` so a correction
 * from the vendor is a two-line change here and nowhere else. The ledger,
 * lifecycle, reversal, and callback verification logic are unaffected by any
 * of it — none of them know which aggregator produced a response.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { composeAuthHeader } from "./vtuShared";
import type {
  ProviderCallOptions,
  ProviderCallbackEvent,
  ProviderPurchaseRequest,
  ProviderPurchaseResult,
  VtuProviderAdapter,
} from "./vtuShared";

// ─── Endpoint mapping (verify against Pairgate docs) ────────────────

function purchasePath(serviceType: ProviderPurchaseRequest["serviceType"]): string {
  switch (serviceType) {
    case "airtime":
      return "/api/v1/airtime";
    case "data":
      return "/api/v1/data";
    case "cable":
      return "/api/v1/cable";
    case "electricity":
      return "/api/v1/electricity";
    case "exam":
      return "/api/v1/exam";
    case "betting":
      return "/api/v1/betting";
  }
}

// ─── Status interpretation ─────────────────────────────────────────

/**
 * The words ONE provider uses for its transaction states.
 *
 * The vocabulary is DATA and the classifier below is a PURE FUNCTION with no
 * provider knowledge in it. That split is the whole point: it is what lets a
 * second aggregator's status words be tested against the same rules without a
 * line of shared code learning the word "Completed".
 */
export interface ProviderStatusVocabulary {
  /** The top-up landed. Terminal and successful. */
  confirmed: readonly string[];
  /** Refused. Terminal and unsuccessful. */
  failed: readonly string[];
  /** Accepted, then withdrawn by the provider. Terminal and unsuccessful. */
  cancelled: readonly string[];
  /** Accepted and still in flight. NOT terminal. */
  processing: readonly string[];
}

export type ProviderStatusVerdict =
  | { kind: "confirmed" }
  | { kind: "processing" }
  | { kind: "failed"; failureKind: "rejected" | "cancelled" }
  | { kind: "unknown" };

/**
 * Pairgate's vocabulary, transcribed from the strings this adapter already
 * interpreted inline. Deliberately NOT widened: a word Pairgate has never been
 * observed to send must keep resolving to `unknown`, because guessing
 * "confirmed" marks undelivered airtime as paid for.
 */
export const PAIRGATE_STATUS_VOCABULARY: ProviderStatusVocabulary = {
  confirmed: ["success", "successful"],
  failed: ["failed", "error", "rejected"],
  cancelled: [],
  processing: [],
};

/**
 * Classify one provider status word.
 *
 * Two properties this function must never lose, because both are money:
 *
 *  1. It NEVER returns a `reversed` notion. Reversal is OUR decision, taken
 *     when we decide to credit points back — a provider has no authority over
 *     our ledger, so a status word can only ever say "confirmed", "failed",
 *     "still going", or "I don't know".
 *
 *  2. `cancelled` and `rejected` stay distinguishable. They are the same
 *     outcome for the ledger (both refund) but different facts for a customer:
 *     one was refused, the other was taken back. Collapsing them here would
 *     lose the distinction before it reaches the transaction row.
 *
 * An unrecognised word is `unknown`, never a guess. `unknown` is a real state
 * that keeps the points debited and waits for a webhook; guessing either way
 * would either refund a delivered top-up or bill for one that never arrived.
 */
export function mapProviderStatus(
  rawStatus: unknown,
  vocab: ProviderStatusVocabulary,
  successFlag?: unknown,
): ProviderStatusVerdict {
  const status = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";

  // `cancelled` is tested before `failed` so a provider that lists a word in
  // both still gets the more specific answer.
  if (status !== "") {
    if (vocab.confirmed.includes(status)) return { kind: "confirmed" };
    if (vocab.cancelled.includes(status)) return { kind: "failed", failureKind: "cancelled" };
    if (vocab.failed.includes(status)) return { kind: "failed", failureKind: "rejected" };
    if (vocab.processing.includes(status)) return { kind: "processing" };
  }
  if (successFlag === true) return { kind: "confirmed" };
  if (successFlag === false) return { kind: "failed", failureKind: "rejected" };
  return { kind: "unknown" };
}

// ─── Response mapping ───────────────────────────────────────────────

function num(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Pull `reference` out of a payload, top level or nested under `data`. */
function referenceOf(b: Record<string, unknown>, data: Record<string, unknown>) {
  return str(data.reference) ?? str(data.transaction_id) ?? str(b.reference) ?? str(b.transaction_id);
}

/**
 * Map a Pairgate response onto the provider-agnostic three-state union.
 *
 * The branch that matters most is the last one. A payload we do not
 * recognise — or one carrying neither a success nor a failure signal — is
 * reported as `unknown`, never optimistically as success. Guessing "success"
 * would mark undelivered airtime as paid for; guessing "failed" would refund
 * airtime that was actually delivered.
 */
export function mapPurchaseResponse(
  body: unknown,
  requestId: string,
): ProviderPurchaseResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const data =
    b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : b;
  const providerReference = referenceOf(b, data);

  const status = String(data.status ?? b.status ?? "").toLowerCase();
  const verdict = mapProviderStatus(
    data.status ?? b.status,
    PAIRGATE_STATUS_VOCABULARY,
    b.success,
  );

  if (verdict.kind === "confirmed") {
    const costNgn = num(data.cost) ?? num(data.amount) ?? num(data.price);
    if (costNgn === undefined) {
      // Delivered but unpriceable. Success would leave the customer out of
      // pocket with nothing to reconcile against; failure would refund a
      // delivered top-up. `unknown` is the only honest answer.
      return {
        status: "unknown",
        message: "Provider reported success without a chargeable amount",
        providerReference,
        raw: body,
      };
    }
    return {
      status: "success",
      providerReference: providerReference ?? requestId,
      costNgn,
      raw: body,
    };
  }

  if (verdict.kind === "failed") {
    return {
      status: "failed",
      code: str(data.code) ?? str(b.code) ?? "PROVIDER_REJECTED",
      message: str(data.message) ?? str(b.message) ?? "The provider rejected this purchase",
      failureKind: verdict.failureKind,
      providerReference,
      raw: body,
    };
  }

  // Accepted but not finished. `unknown` is exactly right: the top-up may
  // still land, so the points stay debited and the row waits for a webhook.
  if (verdict.kind === "processing") {
    return {
      status: "unknown",
      message: "The provider is still processing this purchase",
      providerReference,
      raw: body,
    };
  }

  return {
    status: "unknown",
    message: `Unrecognised provider response (status="${status}")`,
    providerReference,
    raw: body,
  };
}

// ─── Signature helpers ─────────────────────────────────────────────

/**
 * Constant-time comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, so the length check runs
 * first and returns false rather than throwing — an early return on length
 * leaks only the digest length, which is not a secret.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** Header names Pairgate may sign under, in preference order. */
const SIGNATURE_HEADERS = [
  "x-pairgate-signature",
  "x-signature",
  "x-vtu-signature",
  "signature",
];

function signatureFrom(headers: Record<string, string>): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value) return value.replace(/^sha256=/, "").trim();
  }
  return null;
}

// ─── Adapter ────────────────────────────────────────────────────────

export const pairgateAdapter: VtuProviderAdapter = {
  name: "pairgate",
  displayName: "Pairgate",

  async purchase(
    req: ProviderPurchaseRequest,
    opts: ProviderCallOptions,
  ): Promise<ProviderPurchaseResult> {
    const url = `${opts.baseUrl.replace(/\/+$/, "")}${purchasePath(req.serviceType)}`;

    // `reference` is the aggregator-side idempotency key. Sending OUR namespaced
    // key means a retry is de-duplicated by Pairgate too, not only by us.
    //
    // `req.attemptId` is deliberately NOT sent. Pairgate 403s nothing on a
    // repeated reference and gains nothing from a per-call one, so adding it
    // would change bytes on the wire for no reason. Adapters whose vendor
    // rejects a duplicate reference (AidaPay) are the ones that read it.
    const rawBody = JSON.stringify({
      reference: req.requestId,
      product_code: req.productCode,
      phone: req.customerIdentifier,
      ...(req.network ? { network: req.network } : {}),
    });

    // Sign the exact bytes sent, so the provider verifies the same string.
    const signature = createHmac("sha256", opts.apiKey).update(rawBody).digest("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await opts.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          // With the shipped Pairgate row (no authHeader, scheme "") this
          // composes to exactly `x-api-key: <token>` — the same header as
          // before — while letting an operator retarget auth from the admin
          // page instead of a redeploy.
          ...composeAuthHeader(opts),
          signature,
        },
        body: rawBody,
        signal: controller.signal,
      });

      const text = await response.text();

      // 5xx and 429 are the server's problem, not the customer's: the outcome
      // is undetermined, so this is `unknown` and the row stays unresolved.
      if (response.status >= 500 || response.status === 429) {
        return {
          status: "unknown",
          message: `Provider returned HTTP ${response.status}`,
          raw: { status: response.status, body: text },
        };
      }

      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        return {
          status: "unknown",
          message: "Provider returned a non-JSON response",
          raw: { status: response.status, body: text },
        };
      }

      if (!response.ok) {
        const b = parsed as Record<string, unknown>;
        const data =
          b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : b;
        // A 4xx body can still name a terminal state, so classify it rather
        // than assuming every non-2xx is the same kind of rejection.
        const verdict = mapProviderStatus(
          data.status ?? b.status,
          PAIRGATE_STATUS_VOCABULARY,
          b.success,
        );
        return {
          status: "failed",
          code: str(b.code) ?? str(data.code) ?? `HTTP_${response.status}`,
          message: str(b.message) ?? str(data.message) ?? "The provider rejected this purchase",
          ...(verdict.kind === "failed" ? { failureKind: verdict.failureKind } : {}),
          providerReference: referenceOf(b, data),
          raw: parsed,
        };
      }

      return mapPurchaseResponse(parsed, req.requestId);
    } catch (error) {
      // Network error or abort. The top-up may or may not have landed at the
      // carrier, so the caller must NOT refund on this path.
      const message =
        error instanceof Error ? error.message : "Network error contacting provider";
      return { status: "unknown", message, raw: { thrown: message } };
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Verify, THEN parse.
   *
   * The order is the security property, and the single method is what makes
   * it unavoidable: there is no way for a caller to obtain the parsed event
   * without the signature having been checked first, because an unverified
   * body returns null instead of an event.
   */
  verifyAndParseCallback(
    rawBody: string,
    headers: Record<string, string>,
    secret: string,
  ): ProviderCallbackEvent | null {
    if (!secret) return null;

    const provided = signatureFrom(headers);
    if (!provided) return null;

    const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
    // Vendors differ on encoding, so accept both hex and base64.
    const verified =
      safeEqualHex(expectedHex, provided) ||
      safeEqualHex(Buffer.from(expectedHex, "hex").toString("base64"), provided);
    if (!verified) return null;

    // Only now is the body parsed.
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!body || typeof body !== "object") return null;

    const b = body as Record<string, unknown>;
    const data =
      b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : b;

    const providerReference = referenceOf(b, data);
    if (!providerReference) return null;

    const verdict = mapProviderStatus(
      data.status ?? b.status,
      PAIRGATE_STATUS_VOCABULARY,
      b.success,
    );

    // Only a TERMINAL verdict resolves a transaction. `processing` and
    // `unknown` both return null, which leaves the row untouched rather than
    // resolving it on an assumption — a duplicate or premature callback is
    // then simply a no-op.
    if (verdict.kind !== "confirmed" && verdict.kind !== "failed") return null;

    return {
      providerReference,
      outcome: verdict.kind === "confirmed" ? "confirmed" : "failed",
      costNgn: num(data.cost) ?? num(data.amount),
      code: str(data.code) ?? str(b.code),
      message: str(data.message) ?? str(b.message),
      // Preserved so a cancellation is recorded as a cancellation rather than
      // a generic rejection.
      ...(verdict.kind === "failed" ? { failureKind: verdict.failureKind } : {}),
      eventId: str(b.event_id) ?? str(b.id),
    };
  },

  /**
   * Authoritative re-read. Unused in slice 1 — present so the slice-4
   * reconciliation does not force an interface change.
   */
  async verify(
    providerReference: string,
    opts: ProviderCallOptions,
  ): Promise<ProviderPurchaseResult> {
    const url = `${opts.baseUrl.replace(/\/+$/, "")}/api/v1/transaction/${encodeURIComponent(providerReference)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await opts.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json", ...composeAuthHeader(opts) },
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.status >= 500) {
        return {
          status: "unknown",
          message: `Provider returned HTTP ${response.status}`,
          raw: { status: response.status, body: text },
        };
      }
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        return { status: "unknown", message: "Non-JSON response", raw: { body: text } };
      }
      // Reuse the purchase mapper: the re-read payload describes the same
      // transaction and carries the same three-way signal.
      return mapPurchaseResponse(parsed, providerReference);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      return { status: "unknown", message, raw: { thrown: message } };
    } finally {
      clearTimeout(timer);
    }
  },
};
