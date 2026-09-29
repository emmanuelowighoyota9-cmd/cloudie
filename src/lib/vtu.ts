/**
 * VTU primitives: idempotency-key construction, naira→points conversion, and
 * customer-identifier validation.
 *
 * Deliberately free of Convex imports so the test suite can exercise the money
 * arithmetic directly, with no database. Nothing here performs I/O; the
 * database-touching counterpart lives in `src/convex/vtuShared.ts`.
 *
 * The one import below is TYPE-ONLY and is erased at build time, so this module
 * still pulls no Convex runtime into a bundle or a test.
 */

import type {
  VtuReversalReason,
  VtuTransactionStatus,
  VtuUnresolvedReason,
} from "../convex/vtuSchema/types";

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

/**
 * Display names for the four Nigerian networks.
 *
 * Shared rather than re-declared per page so that "9mobile" cannot be spelled
 * three ways on three screens, and so the receipt renderer uses the same words
 * the browse page did.
 */
export const AIRTIME_NETWORK_LABELS: Record<string, string> = {
  mtn: "MTN",
  airtel: "Airtel",
  glo: "Glo",
  "9mobile": "9mobile",
};

/**
 * A name for a service, derived from the service code ALONE.
 *
 * This is the FALLBACK for a surface whose catalog row is gone. A transaction
 * outlives the product it was sold from — a deleted catalog row leaves its
 * completed sales behind — and `airtime.mtn.1000` is a row that has stopped
 * explaining itself. Whenever a catalog `displayName` still exists it wins,
 * because that is the name the customer saw when they bought.
 *
 * Returns the code unchanged for anything `parseServiceCode` does not
 * recognise. That is the honest answer: a made-up label for an unknown product
 * would be worse than the raw identifier.
 */
export function vtuServiceCodeLabel(serviceCode: string): string {
  const parsed = parseServiceCode(serviceCode);
  if (!parsed) return serviceCode;
  const network = AIRTIME_NETWORK_LABELS[parsed.network] ?? parsed.network;
  return `${network} airtime`;
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

// ─── Customer-facing status copy ────────────────────────────────────

/**
 * A status a customer can actually be shown.
 *
 * `failed` is absent BY CONSTRUCTION, not by an oversight: it is not a resting
 * state, so no client can ever observe it (the verdict and the reversal that
 * follows it commit inside one mutation — see `vtuSchema/types.ts`). Excluding
 * it from the type is what makes the exclusion enforceable: a copy map typed
 * `Record<VtuVisibleStatus, …>` cannot carry a `failed` label, and cannot be
 * silently redefined to drop a real one. A test asserting that a `failed` row
 * renders is therefore testing something that cannot happen.
 */
export type VtuVisibleStatus = Exclude<VtuTransactionStatus, "failed">;

export interface VtuStatusCopy {
  /** The status this copy belongs to, so a caller can index a local
   *  tone/icon map without casting the raw status string. */
  status: VtuVisibleStatus;
  label: string;
  detail: string;
}

/**
 * The ONE place a transaction status is described to a customer.
 *
 * Both the purchase page and the history page read this, so an operator reading
 * two screens cannot find the same status described two ways. Every sentence is
 * provider-neutral on purpose: routing moves between aggregators, and a
 * customer-facing string naming one of them is wrong the day the route changes.
 *
 * `unknown` keeps its deliberately careful wording — "we have not heard back"
 * is a different fact from "it failed", and telling a customer either of those
 * when we do not know is worse than admitting we do not know yet. `unresolved`
 * is a THIRD distinct fact: a human is on it.
 */
const STATUS_COPY: Record<VtuVisibleStatus, { label: string; detail: string }> = {
  pending: {
    label: "Queued",
    detail: "Reserved. Waiting to reach the provider.",
  },
  processing: {
    label: "Processing",
    detail:
      "Contacting the provider. This updates as soon as they answer — if nothing arrives, support can resolve it.",
  },
  confirmed: {
    label: "Delivered",
    detail: "The provider confirmed it.",
  },
  reversed: {
    label: "Refunded",
    detail: "It did not go through and your points are back.",
  },
  unknown: {
    label: "Awaiting confirmation",
    detail:
      "We have not heard back from the provider. Your points are held and will be returned if it did not go through — please do not retry yet.",
  },
  unresolved: {
    label: "We're looking into this",
    detail:
      "Your points are held while our team confirms it with the provider. This page updates automatically — there is no need to retry, and you will not be charged twice.",
  },
};

/** Exported for tests that pin the six visible statuses and the `failed` gap. */
export const VTU_STATUS_COPY = STATUS_COPY;

/**
 * Copy for a raw status string, or `null` when there is nothing to show.
 *
 * Returns `null` for `failed` and for anything unrecognised, and callers render
 * NOTHING in that case. The alternative — falling back to the `pending` wording
 * — is the defect this replaces: it told a customer "Queued" while their
 * transaction was actually waiting on a human.
 */
export function vtuStatusCopy(status: string): VtuStatusCopy | null {
  const copy = (STATUS_COPY as Record<string, { label: string; detail: string } | undefined>)[
    status
  ];
  if (!copy) return null;
  return { status: status as VtuVisibleStatus, label: copy.label, detail: copy.detail };
}

/**
 * Why a refund happened, in the customer's terms.
 *
 * A reversal reason is a provenance record (`provider_failed` vs
 * `reconciliation` is OUR distinction about which code path heard the
 * verdict). A customer is owed the outcome, so these are phrased as outcomes
 * and the internal distinction never reaches the screen.
 */
export const VTU_REVERSAL_COPY: Record<VtuReversalReason, string> = {
  provider_failed: "The provider rejected it.",
  provider_cancelled: "The provider cancelled it after accepting.",
  admin_override: "Refunded by our support team.",
  reconciliation: "Confirmed failed when we checked with the provider.",
};

/** Why a top-up needed a human, in the customer's terms. */
export const VTU_UNRESOLVED_COPY: Record<VtuUnresolvedReason, string> = {
  max_attempts_exceeded: "The provider has not confirmed it after several attempts.",
  provider_unreachable: "We could not reach the provider to confirm it.",
  never_dispatched: "It never reached the provider.",
};

/**
 * The one-line reason beneath a terminal status, or `null` when there is none.
 *
 * Kept here rather than in either page so the purchase screen and the history
 * row cannot explain the same refund differently.
 */
export function vtuStatusReasonCopy(tx: {
  status: string;
  reversalReason?: string | null;
  unresolvedReason?: string | null;
}): string | null {
  if (tx.status === "reversed" && tx.reversalReason) {
    return VTU_REVERSAL_COPY[tx.reversalReason as VtuReversalReason] ?? null;
  }
  if (tx.status === "unresolved" && tx.unresolvedReason) {
    return VTU_UNRESOLVED_COPY[tx.unresolvedReason as VtuUnresolvedReason] ?? null;
  }
  return null;
}

// ─── Catalog copy ───────────────────────────────────────────────────

/**
 * What each service type is CALLED on screen.
 *
 * The catalog stores `"cable"`; a customer buys a television subscription.
 * Headings come from here rather than from the raw enum so the browse page
 * never shows a database value, and so the same four words appear everywhere
 * the catalog is described to a customer.
 */
export const VTU_SERVICE_TYPE_COPY: Record<
  string,
  { label: string; blurb: string }
> = {
  airtime: {
    label: "Airtime",
    blurb: "Top up any Nigerian number; you choose the amount.",
  },
  data: {
    label: "Data",
    blurb: "Mobile data bundles, sold by size and validity.",
  },
  cable: {
    label: "Cable TV",
    blurb: "Renew or upgrade a television subscription.",
  },
  electricity: {
    label: "Electricity",
    blurb: "Prepaid meter top-ups for any distribution company.",
  },
  exam: {
    label: "Exam pins",
    blurb: "Registration pins and result checkers.",
  },
  betting: {
    label: "Betting",
    blurb: "Fund a betting wallet from your points.",
  },
};

/** Label for a service type, falling back to the raw value for an unknown one. */
export function vtuServiceTypeLabel(serviceType: string): string {
  return VTU_SERVICE_TYPE_COPY[serviceType]?.label ?? serviceType;
}
