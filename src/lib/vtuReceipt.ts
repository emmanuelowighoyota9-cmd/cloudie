/**
 * Receipt values: the one place a VTU transaction becomes a printable record.
 *
 * Deliberately FREE OF CONVEX IMPORTS so the mapping can be exercised directly
 * in a test, with no database and no deployment — the same reason `./vtu.ts` is
 * kept Convex-free. Everything here is pure: given a transaction-shaped object
 * and a few already-resolved facts, it produces the exact field values the
 * receipt templates validate against.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: every money figure comes from the
 * TRANSACTION'S SNAPSHOT — `nairaPrice`, `ngnPerPoint`, `pointsDebited` as they
 * were frozen when the debit was taken — and never from current pricing. A
 * receipt that re-derives its numbers from today's rate is not a record of
 * anything: it changes when the platform changes, which is precisely what a
 * receipt must not do.
 */

import type { DocumentValues } from "./docTemplateEngine";
import type { VtuReversalReason } from "../convex/vtuSchema/types";
import { VTU_REVERSAL_COPY, maskIdentifier, vtuStatusCopy } from "./vtu";

/** Prefix on every receipt number, so one is recognisable out of context. */
export const VTU_RECEIPT_NUMBER_PREFIX = "RCPT";

/**
 * Line width the receipt slips are laid out for.
 *
 * The renderer breaks text on `\n` and does NOT word-wrap, so a sentence handed
 * to it unwrapped runs off its panel rather than reflowing. Every multi-line
 * field is therefore wrapped here, once, at the width the template was drawn
 * for — and the templates' `maxChars` are set from the same number, so the two
 * cannot drift into silent truncation.
 */
export const RECEIPT_LINE_WIDTH = 68;

/**
 * The transaction facts a receipt draws on.
 *
 * Structurally typed rather than `Doc<"vtuTransactions">` so a test can build
 * one literally, and so this module cannot accidentally reach for a field the
 * receipt has no business printing.
 */
export interface ReceiptSource {
  /** Used only to build a stable receipt number and a last-resort QR payload. */
  transactionId: string;
  customerIdentifier: string;
  nairaPrice: number;
  ngnPerPoint: number;
  pointsDebited: number;
  status: string;
  providerReference?: string | null;
  reversalReason?: string | null;
  /** When the transaction reached a terminal status, if it has. */
  resolvedAt?: number | null;
}

export interface ReceiptContext {
  /** The platform's own name, read from `platformConfig` — not the customer's. */
  issuer: string;
  /** Catalog display name, or the label derived from the service code. */
  serviceName: string;
  /** The instant the document is generated, in epoch milliseconds. */
  issuedAt: number;
  /** Fixed before the build so a retry of the same attempt reuses it. */
  receiptNumber: string;
  /** Amended receipts only: the receipt number this one supersedes. */
  amendsReceiptNumber?: string;
}

export type ReceiptBuild =
  | { ok: true; values: DocumentValues }
  | { ok: false; error: string };

/**
 * The receipt number for a transaction.
 *
 * DERIVED FROM THE TRANSACTION ID, not from a counter or a timestamp, and that
 * is the property that matters: the number is the same on every attempt, so a
 * generation that fails halfway and is retried produces the receipt it would
 * have produced the first time rather than a second number for the same
 * purchase. The tail of a Convex id carries the entropy, so the last twelve
 * characters are taken rather than the first twelve, which are shared by ids
 * minted close together.
 */
export function receiptNumberFor(transactionId: string): string {
  const tail = transactionId.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase();
  return `${VTU_RECEIPT_NUMBER_PREFIX}-${tail}`;
}

/**
 * The receipt number for the AMENDMENT of a receipt.
 *
 * Distinct from the original so the two documents can be told apart on sight
 * and in a support conversation, which is the whole reason the amended receipt
 * exists. Suffixed rather than re-derived: an amendment that carried the same
 * number as the receipt it supersedes would be indistinguishable from it in the
 * one place people quote these — a support ticket.
 */
export function amendedReceiptNumberFor(transactionId: string): string {
  return `${receiptNumberFor(transactionId)}/A1`;
}

/**
 * Wrap text to the receipt's line width.
 *
 * Words are never split, so a single word longer than the width overflows its
 * line instead of being hyphenated into something wrong. The longest word
 * anywhere in the status copy is "automatically", so this does not arise in
 * practice — it is written this way because silently mangling a word is worse
 * than visibly overflowing one.
 */
export function wrapReceiptText(text: string, width = RECEIPT_LINE_WIDTH): string {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (line.length + 1 + word.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** The sentence under "This receipt replaces" on an amended receipt. */
const NEUTRAL_AMENDMENT =
  "The transaction was reversed and your points are back.";

/**
 * What changed, in the customer's terms.
 *
 * Reuses `VTU_REVERSAL_COPY` so the amended receipt explains the refund in the
 * same words the history page used — an operator reading a shared PDF and the
 * customer reading their history should not be reading two accounts of one
 * event. An unrecognised reason falls back to a sentence that is true of every
 * reversal rather than borrowing a cause that may not be the real one.
 */
export function amendmentNoteFor(reason: string | null): string {
  const key = reason as VtuReversalReason | null;
  // An unrecognised reason falls through to the neutral sentence rather than
  // borrowing a cause, which is also why this is a lookup and not a switch.
  const copy = key && key in VTU_REVERSAL_COPY ? VTU_REVERSAL_COPY[key] : undefined;
  return `Refunded. ${copy ?? NEUTRAL_AMENDMENT} The receipt it replaces is superseded, not edited.`;
}

/**
 * Naira per point, as the receipt prints it.
 *
 * Rounded to two places because the stored rate can be a repeating decimal, and
 * a receipt that prints `16.666666666666668` looks like a malfunction. Rounded
 * for DISPLAY only: the debited total beside it is the snapshot, so the two
 * cannot disagree about what was charged.
 */
function formatRate(ngnPerPoint: number): string {
  return String(Math.round(ngnPerPoint * 100) / 100);
}

/**
 * Build the field values for one receipt.
 *
 * Returns a failure rather than a value map when the transaction has no status a
 * customer can be shown — which in practice cannot happen, because the only
 * status without customer-facing words is `failed`, and `failed` is never a
 * resting state (the verdict and the reversal that follows it commit inside one
 * mutation). Refusing is still the right shape: inventing a label for a state
 * nobody can observe would put a sentence on a document that nothing else in
 * the product agrees with.
 */
export function buildReceiptValues(
  source: ReceiptSource,
  context: ReceiptContext,
): ReceiptBuild {
  const copy = vtuStatusCopy(source.status);
  if (!copy) {
    return {
      ok: false,
      error: "This transaction has no status a receipt can describe.",
    };
  }

  const values: DocumentValues = {
    issuer: context.issuer,
    receiptNumber: context.receiptNumber,
    // ISO-8601 WITH an offset, which the template requires: the renderer
    // formats through `new Date`, so an offsetless string would be read as the
    // viewer's local time and one receipt would show two different clocks.
    issuedOn: new Date(context.issuedAt).toISOString(),
    serviceName: context.serviceName,
    // Masked here as well as at storage, so no future caller can pass the raw
    // value by mistake and find the template happy to print it.
    destination: maskIdentifier(source.customerIdentifier),
    ngnPerPoint: formatRate(source.ngnPerPoint),
    // The label the customer was shown, not the internal enum. A receipt is a
    // record of what the customer was TOLD, pinned at generation.
    status: copy.label,
    // Blank rather than omitted when the provider has not issued one yet: the
    // template binds an optional field, and an empty value renders nothing.
    providerReference: source.providerReference ?? "",
    settledAt: source.resolvedAt ? new Date(source.resolvedAt).toISOString() : "",
    statusDetail: wrapReceiptText(copy.detail),
    amountPaid: source.nairaPrice.toFixed(2),
    pointsDebited: String(source.pointsDebited),
    // What support needs to find this purchase: the receipt number to search
    // by, and the provider's own reference when there is one. Not a URL —
    // nothing on this deployment can serve a receipt to an unauthenticated
    // scanner, and a QR that promises a lookup it cannot perform is worse than
    // one that carries the identifiers a person can type.
    qrValue: `${context.receiptNumber} / ${
      source.providerReference ?? source.transactionId.slice(-10)
    }`,
  };

  if (context.amendsReceiptNumber) {
    values.amendsReceiptNumber = context.amendsReceiptNumber;
    values.amendmentNote = wrapReceiptText(amendmentNoteFor(source.reversalReason ?? null));
  }

  return { ok: true, values };
}
