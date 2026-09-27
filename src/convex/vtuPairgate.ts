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
  const succeeded = status === "success" || status === "successful" || b.success === true;
  const explicitlyFailed =
    status === "failed" || status === "error" || status === "rejected" || b.success === false;

  if (succeeded) {
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

  if (explicitlyFailed) {
    return {
      status: "failed",
      code: str(data.code) ?? str(b.code) ?? "PROVIDER_REJECTED",
      message: str(data.message) ?? str(b.message) ?? "The provider rejected this purchase",
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
          "x-api-key": opts.apiKey,
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
        return {
          status: "failed",
          code: str(b.code) ?? str(data.code) ?? `HTTP_${response.status}`,
          message: str(b.message) ?? str(data.message) ?? "The provider rejected this purchase",
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

    const status = String(data.status ?? b.status ?? "").toLowerCase();
    const confirmed = status === "success" || status === "successful" || b.success === true;
    const failed = status === "failed" || status === "error" || status === "rejected" || b.success === false;

    // Neither signal: do not guess. Null leaves the transaction untouched
    // rather than resolving it on an assumption.
    if (!confirmed && !failed) return null;

    return {
      providerReference,
      outcome: confirmed ? "confirmed" : "failed",
      costNgn: num(data.cost) ?? num(data.amount),
      code: str(data.code) ?? str(b.code),
      message: str(data.message) ?? str(b.message),
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
        headers: { accept: "application/json", "x-api-key": opts.apiKey },
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
