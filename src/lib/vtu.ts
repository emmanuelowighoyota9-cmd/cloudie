/**
 * VTU primitives: idempotency-key construction, naira→points conversion, and
 * customer-identifier validation.
 *
 * Deliberately free of Convex imports so the test suite can exercise the money
 * arithmetic directly, with no database. Nothing here performs I/O; the
 * database-touching counterpart lives in `src/convex/vtuShared.ts`.
 */

/** Namespace for the debit taken when a VTU purchase is created. */
export const VTU_DEBIT_NAMESPACE = "vtu:purchase";

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
export function vtuPurchaseKey(requestId: string): string {
  return `${VTU_DEBIT_NAMESPACE}:${requestId}`;
}

/**
 * Idempotency key for a reversal credit.
 *
 * Derived from the same `requestId` and NOT from a timestamp: that is what
 * makes reversal replay-safe, so a webhook arriving twice (or a webhook racing
 * a future reconciler) credits the points exactly once.
 */
export function vtuRefundKey(requestId: string): string {
  return `${VTU_REVERSAL_NAMESPACE}:${requestId}`;
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
