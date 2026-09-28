/**
 * Provider status classification — shared by every adapter.
 *
 * This file holds the ONE rule that turns an aggregator's status word into a
 * ledger-meaningful verdict, and deliberately holds no provider knowledge: the
 * words come in as a `ProviderStatusVocabulary` argument, per adapter.
 *
 * It was extracted out of `vtuPairgate.ts` when the second adapter landed.
 * Leaving it there would have forced AidaPay to import from Pairgate, which
 * makes one adapter depend on another — precisely the coupling the registry
 * exists to avoid, and it would have meant the shared classifier was only
 * reachable on a path that also dragged in the Pairgate vendor quirks.
 *
 * No `"use node"` marker: nothing here touches `node:crypto` or the network, so
 * this stays importable from a V8 module. Only the adapters that HMAC-sign
 * need Node.
 */

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
