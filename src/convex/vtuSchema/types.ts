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
 * `AssertSameUnion` type at the bottom makes the two declarations impossible
 * to drift apart: adding a status to the array without adding it to the
 * validator is a compile error, not a runtime surprise.
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
 * Legal transitions, each owned by exactly ONE mutation (see
 * `vtuInternal.recordOutcome` for the enforcing guard):
 *
 *   (none)  -> pending        beginPurchase
 *   pending -> processing     markProcessing
 *   processing -> confirmed   recordOutcome   (provider response OR webhook)
 *   processing -> failed      recordOutcome
 *   processing -> unknown     recordOutcome
 *   unknown   -> confirmed    recordOutcome   (a late webhook resolves it)
 *   unknown   -> failed       recordOutcome
 *   failed    -> reversed     refundAndRelease
 *
 * Terminal: `confirmed`, `reversed`. `failed` exits ONLY via `reversed` — never
 * back to `confirmed`, and `confirmed` never moves to `failed`. `unknown` is
 * deliberately NOT releasable: refunding an unresolved transaction risks paying
 * a customer twice for a top-up that may have landed at the carrier.
 */
export const VTU_TRANSACTION_STATUSES = [
  "pending", // row + ledger debit exist; nothing dispatched yet
  "processing", // handed to the provider; outcome not yet known
  "confirmed", // provider confirmed delivery. TERMINAL.
  "failed", // provider definitively rejected; not yet refunded
  "unknown", // transport gave us nothing. Real state.
  "reversed", // points returned and the idempotency key released. TERMINAL.
] as const;
export type VtuTransactionStatus = (typeof VTU_TRANSACTION_STATUSES)[number];
export const vtuTransactionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("confirmed"),
  v.literal("failed"),
  v.literal("unknown"),
  v.literal("reversed"),
);

/**
 * Why a transaction was reversed.
 *
 * `admin_override` and `reconciliation` are reserved for later slices but are
 * typed NOW, so the schema does not need to move once rows start using them.
 *
 * `provider_cancelled` is distinct from `provider_failed` because at least one
 * aggregator distinguishes them (AidaPay reports `Cancelled` separately from
 * `Refund`), and collapsing them loses the ability to tell a customer whether
 * their money was rejected outright or pulled back after acceptance.
 */
export const VTU_REVERSAL_REASONS = [
  "provider_failed", // provider definitively rejected the purchase
  "provider_cancelled", // provider cancelled after accepting it
  "admin_override", // reserved: operator-initiated
  "reconciliation", // reserved: automatic catch-up for a stuck transaction
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
 * Neither branch ever runs; `Expect` resolves to `true` only when the two
 * types are mutually assignable. Add a member to `VTU_AUTH_SCHEMES` and
 * forget the validator, and this line fails to compile with a message naming
 * both types — at the point of the mistake, rather than as a `string` leaking
 * into a UI prop three files away.
 */
/**
 * A type that only compiles when the two arguments describe the same union.
 *
 * Written as a function type rather than `Expect<Equal<...>>` because a bare
 * `T extends true` constraint makes TypeScript resolve the conditional EAGERLY
 * at the definition, where `Array` and `ValidatorValue` are still unresolved
 * generics — and an unresolved conditional can never be proven `true`. The
 * tuple-rest form defers evaluation until each use site supplies concrete
 * types, which is what we want.
 */
type AssertSameUnion<Array, ValidatorValue> = (
  ...proof: [Array] extends [ValidatorValue]
    ? [ValidatorValue] extends [Array]
      ? [true]
      : [never]
    : [never]
) => void;

type _ServiceTypesMatch = AssertSameUnion<
  (typeof VTU_SERVICE_TYPES)[number],
  Infer<typeof vtuServiceTypeValidator>
>;
type _TransactionStatusesMatch = AssertSameUnion<
  (typeof VTU_TRANSACTION_STATUSES)[number],
  Infer<typeof vtuTransactionStatusValidator>
>;
type _ReversalReasonsMatch = AssertSameUnion<
  (typeof VTU_REVERSAL_REASONS)[number],
  Infer<typeof vtuReversalReasonValidator>
>;
type _AuthSchemesMatch = AssertSameUnion<
  (typeof VTU_AUTH_SCHEMES)[number],
  Infer<typeof vtuAuthSchemeValidator>
>;
type _ProviderStatusesMatch = AssertSameUnion<
  (typeof VTU_PROVIDER_STATUSES)[number],
  Infer<typeof vtuProviderStatusValidator>
>;

/** Re-exported so callers can infer a validator's value type the usual way. */
export type { Infer };
