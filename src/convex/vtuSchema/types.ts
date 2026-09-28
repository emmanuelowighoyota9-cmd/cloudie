/**
 * VTU enums and validators, in one place so the three table modules can share
 * them without importing `schema.ts` back.
 *
 * They live here rather than in the table modules because they are used
 * ACROSS those modules: the provider table needs the auth scheme and the
 * provider status, the transaction table needs the transaction status and the
 * reversal reasons, and the catalog needs the service type. Putting each enum
 * beside the one table that happens to use it most would make the other two
 * import across module boundaries, and putting them in `schema.ts` would make
 * the table modules import the file that imports them.
 *
 * `schema.ts` re-exports all of these, so every existing
 * `import { VTU_AUTH_SCHEMES } from "./schema"` keeps working unchanged.
 *
 * WHY THE VALIDATORS ARE WRITTEN OUT BY HAND
 *
 * The obvious version of this file is
 * `v.union(...VALUES.map((x) => v.literal(x)))`. It is wrong, and subtly so:
 * the `.map` widens each member to `string`, so the validator infers as
 * `VUnion<VLiteral<string>>` and every `Doc<"vtuTransactions">["status"]`
 * degrades from the six-member union to `string`. That does not break the
 * schema — Convex validates at runtime either way — it quietly deletes the
 * type-level guarantee at every call site that reads the field, and it did
 * exactly that here. Spelling the members out preserves the literals, and the
 * `Expect<Equal<>>` assertions at the bottom make the two declarations
 * impossible to drift apart: adding a status to the array without adding it to
 * the validator is a compile error, not a runtime surprise.
 *
 * (Those assertions were a no-op until slice 5 — see the note at the bottom
 * for the failure mode, which is subtle enough to be worth recording.)
 */

import { v } from "convex/values";
import type { Infer } from "convex/values";

export const VTU_SERVICE_TYPES = [
  "airtime",
  "data",
  "cable",
  "electricity",
  "exam",
  "betting",
] as const;
export type VtuServiceType = (typeof VTU_SERVICE_TYPES)[number];
export const vtuServiceTypeValidator = v.union(
  v.literal("airtime"),
  v.literal("data"),
  v.literal("cable"),
  v.literal("electricity"),
  v.literal("exam"),
  v.literal("betting"),
);

/**
 * VTU transaction lifecycle.
 *
 * `unknown` is a REAL status, not a placeholder for `pending`. "We asked and
 * the transport gave us nothing" is a different fact from "we have not asked
 * yet", and collapsing the two destroys the one measurement that decides
 * whether a reconciliation poller is worth building. It is never coerced to
 * `pending` or `failed`.
 *
 * Legal transitions, each owned by exactly ONE mutation
 * (`vtuInternal.settleTransaction` — the single writer of every terminal
 * status — for everything from `processing` onward):
 *
 *   (none)     -> pending        beginPurchase
 *   pending    -> processing     markProcessing
 *   processing -> confirmed      settleTransaction   (response, webhook, or sweep)
 *   processing -> failed         settleTransaction
 *   processing -> unknown        recordOutcome       (transport gave us nothing)
 *   unknown    -> confirmed      settleTransaction   (late webhook, or a sweep)
 *   unknown    -> failed         settleTransaction
 *   failed     -> reversed       settleTransaction   (same mutation, see below)
 *   *          -> unresolved     settleTransaction   (escalation to a human)
 *   unresolved -> confirmed      settleTransaction   (admin: confirm delivered)
 *   unresolved -> reversed       settleTransaction   (admin: refund customer)
 *
 * POLLING. Only `processing` and `unknown` are ever polled by the
 * reconciliation sweep. Everything else is either decided (`failed`), done
 * (`confirmed`, `reversed`), or waiting on a person (`unresolved`).
 *
 * Terminal: `confirmed`, `reversed`, `unresolved`.
 *
 * `failed` is DECIDED BUT NOT RESTING — read this before writing any query
 * that filters on it. A `failed` verdict is always followed, inside the SAME
 * atomic mutation, by the `reversed` transition that credits the points back.
 * The intermediate `failed` write is an implementation detail of one Convex
 * transaction and is never observable to a client: by the time the mutation
 * commits, the row reads `reversed`.
 *
 * Concretely, a "list failed transactions" view will be permanently empty, and
 * that is correct rather than a bug. The status is kept in this enum because a
 * failed-but-not-yet-refunded row is a state the ledger logic reasons about
 * mid-mutation, not because it is ever a resting place for a row.
 *
 * `unknown` is deliberately NOT releasable without a verdict: refunding an
 * unresolved transaction risks paying a customer twice for a top-up that may
 * have landed at the carrier. That is why `unresolved` exists as its own
 * terminal state instead of being coerced into `reversed`.
 */
export const VTU_TRANSACTION_STATUSES = [
  "pending", // row + ledger debit exist; nothing dispatched yet
  "processing", // handed to the provider; outcome not yet known
  "confirmed", // provider confirmed delivery. TERMINAL.
  "failed", // rejected; NOT RESTING — always commits with `reversed` below
  "unknown", // transport gave us nothing. Real state.
  "reversed", // points returned and the idempotency key released. TERMINAL.
  "unresolved", // max attempts exhausted; a human must decide. TERMINAL.
] as const;
export type VtuTransactionStatus = (typeof VTU_TRANSACTION_STATUSES)[number];
export const vtuTransactionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("confirmed"),
  v.literal("failed"),
  v.literal("unknown"),
  v.literal("reversed"),
  v.literal("unresolved"),
);

/**
 * Why a transaction could not be resolved automatically.
 *
 * `never_dispatched` is the one that reflects a CODE DEFECT rather than a
 * provider problem: a row stuck in `pending` past its dispatch window means
 * the purchase action died between inserting the transaction and making the
 * HTTP call. Nothing was ever sent, so the money is provably refundable — but
 * auto-reversing it would silently clean up the symptom while leaving the
 * cause in place, and the cause is a bug in our own code. Escalating it makes
 * the pattern visible.
 *
 * `provider_unreachable` would be a LIE for that case — the provider was never
 * contacted, so it cannot be unreachable. An operator paged for a nonexistent
 * provider outage is worse off than one shown no reason at all, which is why
 * these are separate values rather than one vague "failed to reconcile".
 */
export const VTU_UNRESOLVED_REASONS = [
  "max_attempts_exceeded", // polled N times, still no terminal verdict
  "provider_unreachable", // no adapter, no credentials, or the probe threw
  "never_dispatched", // left `pending`: our code failed before the HTTP call
] as const;
export type VtuUnresolvedReason = (typeof VTU_UNRESOLVED_REASONS)[number];
export const vtuUnresolvedReasonValidator = v.union(
  v.literal("max_attempts_exceeded"),
  v.literal("provider_unreachable"),
  v.literal("never_dispatched"),
);

/**
 * Why a transaction was reversed.
 *
 * `admin_override` is an operator deciding to refund a transaction the system
 * could not settle. `reconciliation` is the sweep writing a verdict the
 * PROVIDER supplied, after a webhook never arrived.
 *
 * `reconciliation` vs `provider_failed` is a PROVENANCE distinction, not an
 * outcome distinction. Both end with the customer's points returned and the
 * same naira back in their pocket; the only difference is which of our code
 * paths asked the provider and heard "it failed" — the webhook handler, or the
 * reconciliation sweep's `verify()` call. It is recorded separately because
 * "the provider told us and then never called back" and "the provider told us
 * when we asked" are different operational signals about the aggregator, and
 * collapsing them would erase the one piece of evidence that says an
 * aggregator's webhook delivery is unreliable.
 *
 * `provider_cancelled` is distinct from `provider_failed` because at least one
 * aggregator distinguishes them (AidaPay reports `Cancelled` separately from
 * `Refund`), and collapsing them loses the ability to tell a customer whether
 * their money was rejected outright or pulled back after acceptance.
 */
export const VTU_REVERSAL_REASONS = [
  "provider_failed", // provider definitively rejected the purchase
  "provider_cancelled", // provider cancelled after accepting it
  "admin_override", // an operator decided to refund
  "reconciliation", // the sweep asked the provider and it confirmed failure
] as const;
export type VtuReversalReason = (typeof VTU_REVERSAL_REASONS)[number];
export const vtuReversalReasonValidator = v.union(
  v.literal("provider_failed"),
  v.literal("provider_cancelled"),
  v.literal("admin_override"),
  v.literal("reconciliation"),
);

/**
 * How a provider authenticates.
 *
 * A CLOSED enum, not a free string. `Authorization: Bearer <token>` and
 * `x-api-key: <token>` are the shapes we support; a free string invites a typo
 * that silently produces a malformed header and a provider that mysteriously
 * rejects every call. Extending later is a union addition, which Convex
 * handles cleanly.
 */
export const VTU_AUTH_SCHEMES = ["", "bearer", "basic"] as const;
export type VtuAuthScheme = (typeof VTU_AUTH_SCHEMES)[number];
export const vtuAuthSchemeValidator = v.union(
  v.literal(""),
  v.literal("bearer"),
  v.literal("basic"),
);

/**
 * Provider lifecycle.
 *
 * `sandbox` exists because the live Pairgate integration is a sandbox
 * integration. A boolean `active` cannot distinguish a test key from a real
 * one, which is precisely the distinction an operator must be able to make
 * before pointing real money at a provider.
 *
 * `active` is derived as `status === "active"` wherever routing needs a yes/no.
 * Disabling gates the RESOLVE step only, so it stops new purchases while
 * leaving in-flight transactions to complete against the snapshot they
 * already carry.
 */
export const VTU_PROVIDER_STATUSES = ["active", "sandbox", "disabled"] as const;
export type VtuProviderStatus = (typeof VTU_PROVIDER_STATUSES)[number];
export const vtuProviderStatusValidator = v.union(
  v.literal("active"),
  v.literal("sandbox"),
  v.literal("disabled"),
);

// ─── The array and the validator may never disagree ────────────────

/**
 * Compile-time proof that each exported array and its validator describe the
 * same set of strings.
 *
 * Add a member to `VTU_AUTH_SCHEMES` and forget the validator, and these
 * lines fail to compile — at the point of the mistake, rather than as a
 * `string` leaking into a UI prop three files away.
 *
 * ── Why this is `Expect<Equal<>>` and not a function type ─────────────
 *
 * This guard previously read `type _Check = AssertSameUnion<A, B>` where
 * `AssertSameUnion` produced `(...proof: [never]) => void` on mismatch. That
 * form is INERT: an unused type alias cannot fail a build, so the "proof"
 * never actually proved anything. It was caught when a deliberate extra member
 * added to `VTU_UNRESOLVED_REASONS` compiled clean. (The slice-3 auth-scheme
 * case appeared to work only because `composeAuthHeader`'s exhaustive switch
 * is a real tripwire in that particular enum — the assertion was riding on a
 * different guard's coat-tails.)
 *
 * `Expect<T extends true>` puts the constraint at a USE site, which is what
 * makes a `false` a hard error. `Equal<>` is the invariant-variance trick:
 * `<T>() => T extends A ? 1 : 2>` is only assignable to the `B` version when
 * A and B are the SAME type, so it catches a one-way assignability that a
 * plain `extends` check would wave through.
 */
type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

type _ServiceTypesMatch = Expect<
  Equal<(typeof VTU_SERVICE_TYPES)[number], Infer<typeof vtuServiceTypeValidator>>
>;
type _TransactionStatusesMatch = Expect<
  Equal<
    (typeof VTU_TRANSACTION_STATUSES)[number],
    Infer<typeof vtuTransactionStatusValidator>
  >
>;
type _ReversalReasonsMatch = Expect<
  Equal<(typeof VTU_REVERSAL_REASONS)[number], Infer<typeof vtuReversalReasonValidator>>
>;
type _UnresolvedReasonsMatch = Expect<
  Equal<(typeof VTU_UNRESOLVED_REASONS)[number], Infer<typeof vtuUnresolvedReasonValidator>>
>;
type _AuthSchemesMatch = Expect<
  Equal<(typeof VTU_AUTH_SCHEMES)[number], Infer<typeof vtuAuthSchemeValidator>>
>;
type _ProviderStatusesMatch = Expect<
  Equal<(typeof VTU_PROVIDER_STATUSES)[number], Infer<typeof vtuProviderStatusValidator>>
>;


/** Re-exported so callers can infer a validator's value type the usual way. */
export type { Infer };
