/**
 * VTU primitives: idempotency-key construction, naira→points conversion, and
 * customer-identifier validation.
 *
 * Deliberately free of Convex imports so the test suite can exercise the money
 * arithmetic directly, with no database. Nothing here performs I/O; the
 * database-touching counterpart lives in `src/convex/vtuShared.ts`.
 */

/** Namespace for the debit taken when a purchase begins. */
export const VTU_PURCHASE_NAMESPACE = "vtu:purchase";

/**
 * Namespace for the credit that returns points when a purchase fails.
 *
 * Deliberately distinct from {@link VTU_DEBIT_NAMESPACE}: `pointLedger` keys
 * idempotency on ONE global `by_idempotency` index, so the namespace prefix is
 * the only thing stopping a reversal from colliding with its own debit — or
 * with a `docrender:*` key from the document engine.
 */
export const VTU_REVERSAL_NAMESPACE = "vtu:refund";

/**
 * Idempotency key for the debit taken when a VTU purchase is created.
 *
 * Keyed on the client-supplied `requestId` only, so a retry of a request that
 * timed out on the client is served from the existing ledger row rather than
 * charged twice.
 */
export function vtuPurchaseKey(clientRequestId: string): string {
  return `${VTU_PURCHASE_NAMESPACE}:${clientRequestId}`;
}

/**
 * Idempotency key for a reversal credit.
 *
 * Keyed on the TRANSACTION id, not the request id. Each purchase attempt is
 * its own transaction, and a key that varies per row needs no further guarding
 * beyond the `failed -> reversed` status check.
 */
export function vtuRefundKey(transactionId: string): string {
  return `${VTU_REVERSAL_NAMESPACE}:${transactionId}`;
}

/**
 * Idempotency key for the LEDGER debit.
 *
 * Keyed on the TRANSACTION id, not the client request id — and that
 * distinction is load-bearing rather than cosmetic.
 *
 * `pointLedger` is immutable: a debit row is written once and never removed,
 * and `points.debit` returns the existing row instead of charging again when
 * it sees a key it has already used. So if the ledger key were the client
 * request id, releasing the `vtuIdempotency` claim after a failure would NOT
 * actually let the customer retry — the immutable ledger row would still block
 * the charge and the retry would be free.
 *
 * Keying on the transaction id gives each ATTEMPT its own ledger key, so a
 * retry after a failure is a genuinely new charge. True-duplicate protection
 * is the `vtuIdempotency` claim, which is checked before this key is ever used
 * and IS released on failure.
 */
export function vtuLedgerPurchaseKey(transactionId: string): string {
  return `${VTU_PURCHASE_NAMESPACE}:${transactionId}`;
}

/** Minimum naira charge worth transacting. Guards against zero-price products. */
export const MIN_VTU_COST_NGN = 1;

/**
 * Convert an aggregator's naira cost into the points a customer is charged.
 *
 * Rounds UP deliberately. Rounding down would let a customer pay slightly less
 * than the airtime they received, and that shortfall is realised on every
 * single transaction, so the bias must go the platform's way.
 *
 * `markupBp` is basis points (1/100 of a percent) and defaults to zero, so
 * nothing is invented: at the default, a customer pays exactly what Pairgate
 * charges. A margin can be introduced later by an admin setting without
 * touching this function.
 */
export function pointsForNaira(
  costNgn: number,
  ngnPerPoint: number,
  markupBp = 0,
): number {
  if (!Number.isFinite(costNgn) || costNgn < MIN_VTU_COST_NGN) {
    throw new Error("Invalid VTU cost");
  }
  if (!Number.isFinite(ngnPerPoint) || ngnPerPoint <= 0) {
    throw new Error("Invalid point rate");
  }
  if (!Number.isFinite(markupBp) || markupBp < 0) {
    throw new Error("Invalid markup");
  }
  return Math.ceil((costNgn * (1 + markupBp / 10_000)) / ngnPerPoint);
}

/**
 * Validate the phone / meter / smartcard number a purchase targets.
 *
 * The value is a VTU target, not an identity document: it is a number a top-up
 * is delivered TO. It is never logged in full — see {@link maskIdentifier}.
 */
export function validateCustomerIdentifier(
  serviceType: string,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Enter a destination number" };

  if (serviceType === "airtime" || serviceType === "data" || serviceType === "betting") {
    const digits = value.replace(/[\s-]/g, "");
    if (!/^(\+?234|0)[789]\d{9}$/.test(digits)) {
      return {
        ok: false,
        error: "Enter a valid Nigerian number, e.g. 0803 123 4567",
      };
    }
    return { ok: true, value: digits };
  }

  if (serviceType === "electricity") {
    // Prepaid meters across Nigeria are 10–13 digits, typically 11 or 12.
    const digits = value.replace(/[\s-]/g, "");
    if (!/^\d{10,13}$/.test(digits)) {
      return { ok: false, error: "Enter a valid meter number (10–13 digits)" };
    }
    return { ok: true, value: digits };
  }

  if (serviceType === "cable") {
    const digits = value.replace(/[\s-]/g, "");
    if (!/^\d{8,14}$/.test(digits)) {
      return { ok: false, error: "Enter a valid smartcard number" };
    }
    return { ok: true, value: digits };
  }

  if (serviceType === "exam") {
    const digits = value.replace(/[\s-]/g, "");
    if (!/^\d{5,15}$/.test(digits)) {
      return { ok: false, error: "Enter a valid candidate number" };
    }
    return { ok: true, value: digits };
  }

  return { ok: false, error: "Unsupported service type" };
}

/**
 * Mask a destination number for display and for log payloads.
 *
 * Shows the last four digits only. Phone and meter numbers are personal data
 * that has no business appearing in full in a notification, an audit row, a
 * support screenshot, or a persisted `rawResponse`.
 */
export function maskIdentifier(value: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  return `${"*".repeat(Math.min(trimmed.length - 4, 6))}${trimmed.slice(-4)}`;
}

/** A `requestId` must be unguessable-ish and short enough to send upstream. */
export function isValidRequestId(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/**
 * Resolve the points cost for a product: an admin override wins outright,
 * otherwise convert from naira.
 *
 * Mirrors `resolveRenderCost`'s override-then-fallback precedence. The
 * override is ABSOLUTE, not a delta — an admin pricing a loss-leading product
 * should not have to reason about the live rate.
 */
export function resolveVtuPointsCost(
  costNgn: number,
  ngnPerPoint: number,
  overridePoints: number | null | undefined,
): number {
  if (
    typeof overridePoints === "number" &&
    Number.isFinite(overridePoints) &&
    overridePoints > 0
  ) {
    return overridePoints;
  }
  return pointsForNaira(costNgn, ngnPerPoint);
}

// ─── Airtime service codes ─────────────────────────────────────────

export const AIRTIME_NETWORKS = ["mtn", "airtel", "glo", "9mobile"] as const;
export type AirtimeNetwork = (typeof AIRTIME_NETWORKS)[number];

/** e.g. "airtime.mtn.1000" */
export function airtimeServiceCode(network: string, amountNgn: number): string {
  const net = (network ?? "").trim().toLowerCase();
  if (!(AIRTIME_NETWORKS as readonly string[]).includes(net)) {
    throw new Error("Unsupported network");
  }
  if (!Number.isInteger(amountNgn) || amountNgn < 100 || amountNgn > 100_000) {
    throw new Error("Amount is out of range");
  }
  return `airtime.${net}.${amountNgn}`;
}

/** Parse "airtime.mtn.1000" back into its parts, or null if unrecognised. */
export function parseServiceCode(
  serviceCode: string,
): { serviceType: string; network: string; amountNgn: number } | null {
  const parts = (serviceCode ?? "").split(".");
  if (parts.length !== 3 || parts[0] !== "airtime") return null;
  if (!(AIRTIME_NETWORKS as readonly string[]).includes(parts[1])) return null;
  const amountNgn = Number(parts[2]);
  if (!Number.isInteger(amountNgn) || amountNgn < 100 || amountNgn > 100_000) {
    return null;
  }
  return { serviceType: "airtime", network: parts[1], amountNgn };
}

/** Validate a Nigerian mobile number. Stored masked — see maskIdentifier. */
export function validatePhone(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Enter a phone number" };

  const digits = value.replace(/[\s-]/g, "");
  if (!/^(\+?234|0)[789]\d{9}$/.test(digits)) {
    return { ok: false, error: "Enter a valid Nigerian number, e.g. 0803 123 4567" };
  }
  return { ok: true, value: digits };
}
