"use node";

/**
 * Pairgate VTU adapter.
 *
 * Every Pairgate-specific detail lives in this file. The rest of the VTU
 * feature is written against the `VtuProviderAdapter` interface, so adding a
 * second aggregator means a new adapter file plus one `vtuProviders` row —
 * nothing else changes.
 *
 * ── On the endpoint paths ────────────────────────────────────────────
 * Pairgate does not publish an open API spec, so the paths and field names
 * below are the ones to confirm against the Pairgate dashboard before going
 * live. They are deliberately isolated in two small helpers, `purchasePath()`
 * and `mapPurchaseResponse()`, so a correction from the vendor is a two-line
 * change here and nowhere else. The ledger, lifecycle, reversal, and callback
 * verification logic are NOT affected by any of this — none of them know
 * which aggregator produced a response.
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

/** Human-facing label for the notification/ledger description. */
const SERVICE_LABELS: Record<ProviderPurchaseRequest["serviceType"], string> = {
  airtime: "Airtime",
  data: "Data bundle",
  cable: "Cable TV",
  electricity: "Electricity",
  exam: "Exam PIN",
  betting: "Betting wallet",
};

// ─── Response mapping ───────────────────────────────────────────────

function num(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Map a Pairgate purchase response onto the provider-agnostic union.
 *
 * The branch that matters most is the last one: a payload we do not
 * recognise, or one carrying neither a success nor a failure signal, is
 * reported as `unknown` rather than being optimistically treated as a
 * success. Guessing "success" here would mark undelivered airtime as paid for.
 */
export function mapPurchaseResponse(
  body: unknown,
  requestId: string,
): ProviderPurchaseResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const providerReference =
    str(b.reference) ?? str(b.transaction_id) ?? str(b.transactionId);

  // Some aggregators nest the payload under `data`.
  const data =
    b.data && typeof b.data === "object"
      ? (b.data as Record<string, unknown>)
      : b;

  const status = String(data.status ?? b.status ?? "").toLowerCase();
  const succeeded = status === "success" || status === "successful" || b.success === true;
  const explicitlyFailed =
    status === "failed" || status === "error" || status === "rejected" || b.success === false;

  if (succeeded) {
    const costNgn = num(data.cost) ?? num(data.amount) ?? num(data.price);
    if (costNgn === undefined) {
      // Delivered, but we cannot price it — treating this as success would
      // leave the customer out of pocket with nothing to reconcile against.
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
      serial: str(data.serial) ?? str(data.recharge_id),
      pin: str(data.pin) ?? str(data.pin_code),
      raw: body,
    };
  }

  if (explicitlyFailed) {
    return {
      status: "failed",
      code: str(data.code) ?? str(b.code) ?? "PROVIDER_REJECTED",
      message:
        str(data.message) ?? str(b.message) ?? "The provider rejected this purchase",
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

// ─── HMAC helpers ───────────────────────────────────────────────────

/**
 * Constant-time HMAC comparison.
 *
 * `timingSafeEqual` throws on length mismatch, so a length check runs first
 * and returns false rather than throwing — an early return on length does leak
 * only the digest length, which is not a secret.
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

// ─── Adapter ────────────────────────────────────────────────────────

export const pairgateAdapter: VtuProviderAdapter = {
  name: "pairgate",
  displayName: "Pairgate",

  async purchase(
    req: ProviderPurchaseRequest,
    opts: ProviderCallOptions,
  ): Promise<ProviderPurchaseResult> {
    const url = `${opts.baseUrl.replace(/\/+$/, "")}${purchasePath(req.serviceType)}`;

    // `reference` is the aggregator-side idempotency key. Sending OUR
    // namespaced key means a retry is de-duplicated by Pairgate too, not just
    // by us — without it, a client retry after a timeout buys the customer
    // two top-ups for one charge.
    const payload = {
      reference: req.requestId,
      product_code: req.productCode,
      phone: req.customerIdentifier,
      ...(req.quantity !== undefined ? { quantity: req.quantity } : {}),
      ...(req.pinCount !== undefined ? { pin_count: req.pinCount } : {}),
    };
    const rawBody = JSON.stringify(payload);

    // Sign the exact bytes sent, so the provider can verify the same string.
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
      // is undetermined, so this is `unknown` and the row stays `pending`.
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
        return {
          status: "failed",
          code: str(b.code) ?? `HTTP_${response.status}`,
          message: str(b.message) ?? "The provider rejected this purchase",
          providerReference: str(b.reference),
          raw: parsed,
        };
      }

      return mapPurchaseResponse(parsed, req.requestId);
    } catch (error) {
      // Network error or abort. The top-up may or may not have landed at the
      // carrier, so the caller must NOT reverse on this path.
      const message =
        error instanceof Error ? error.message : "Network error contacting provider";
      return { status: "unknown", message, raw: { thrown: message } };
    } finally {
      clearTimeout(timer);
    }
  },

  verifyCallback(
    rawBody: string,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    if (!secret) return false;

    const provided =
      headers["x-signature"] ??
      headers["x-pairgate-signature"] ??
      headers["signature"] ??
      "";
    if (!provided) return false;

    const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
    const providedClean = provided.replace(/^sha256=/, "").trim();

    // Accept hex (the common form) and base64, since vendors differ.
    if (safeEqualHex(expectedHex, providedClean)) return true;
    const expectedB64 = Buffer.from(expectedHex, "hex").toString("base64");
    return safeEqualHex(expectedB64, providedClean);
  },

  parseCallback(rawBody: string): ProviderCallbackEvent | null {
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

    const providerReference =
      str(data.reference) ?? str(data.transaction_id) ?? str(b.reference);
    if (!providerReference) return null;

    const status = String(data.status ?? b.status ?? "").toLowerCase();
    const succeeded =
      status === "success" || status === "successful" || b.success === true;
    const failed =
      status === "failed" || status === "error" || status === "rejected" || b.success === false;

    // Neither signal: do not guess. Returning null leaves the transaction
    // untouched rather than resolving it on a guess.
    if (!succeeded && !failed) return null;

    return {
      providerReference,
      outcome: succeeded ? "success" : "failed",
      costNgn: num(data.cost) ?? num(data.amount),
      code: str(data.code),
      message: str(data.message),
      serial: str(data.serial) ?? str(data.recharge_id),
      pin: str(data.pin) ?? str(data.pin_code),
      eventId: str(b.event_id) ?? str(b.id),
    };
  },
};

export { SERVICE_LABELS as PAIRGATE_SERVICE_LABELS };

/** Registry. Adding a provider means adding an entry here and a schema row. */
const ADAPTERS: Record<string, VtuProviderAdapter> = {
  [pairgateAdapter.name]: pairgateAdapter,
};

export function getAdapter(provider: string): VtuProviderAdapter | null {
  return ADAPTERS[provider] ?? null;
}
