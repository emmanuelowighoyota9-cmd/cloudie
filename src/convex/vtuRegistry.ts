"use node";

/**
 * Provider registry.
 *
 * The ONLY place a call site resolves a provider. Nothing above this file
 * imports a concrete adapter: consumers do `getAdapter("pairgate")` and then
 * know only `VtuProviderAdapter`.
 *
 * This is a deliberate five-line investment. Slice 2 turns the literal table
 * below into a lookup against `vtuProviders` rows keyed by `adapter.name`;
 * slice 4 adds an entry. Neither requires touching `beginPurchase`, the
 * webhook handler, or the purchase page.
 *
 * Two adapters are registered as of slice 4. That the list is still two LINES
 * and nothing else moved is the point of the whole design: `beginPurchase`
 * routes to a provider by name, the credential layer opens its row, and the
 * ledger reads a three-state result. Adding AidaPay changed the routing table
 * and this list, and no money-handling code at all.
 *
 * ── Registration is where a broken adapter is caught ────────────────
 *
 * TypeScript's claim that an object satisfies `VtuProviderAdapter` is erased
 * at runtime: a factory that spreads defaults, a stub registered by a test, a
 * hand-rolled object cast through `as VtuProviderAdapter`, or a renamed method
 * all produce something missing a method, and the failure then surfaces at
 * whatever call site happens to touch it last — a purchase that throws after
 * the debit, a webhook that 500s and is retried forever, a poll that burns a
 * rate-limited call to discover the method is not there.
 *
 * Validating here converts all of that into a registration-time failure with a
 * list of exactly what is missing, which is where it belongs: it happens at
 * boot, before any money moves, and it names the defect instead of producing a
 * symptom somewhere else.
 *
 * The call sites keep their own guards anyway (see `vtuProviderCall` and
 * `vtuHttp`). Two layers is not duplication here: this one stops the adapter
 * from entering the registry, and that one stops a defect that arrived by any
 * other route from becoming a 500 or a stranded debit.
 *
 * Marked "use node" because every adapter is Node-only (they use
 * `node:crypto` and make outbound HTTP calls). Without the marker Convex
 * treats this as a V8 module, and the bundler cannot resolve `node:crypto`
 * through it. Only actions ever call `getAdapter`, so the Node runtime is also
 * the correct place for it to live.
 */

import { aidapayAdapter } from "./providers/aidapay";
import { pairgateAdapter } from "./vtuPairgate";
import type { VtuProviderAdapter } from "./vtuShared";

/**
 * The callable methods the interface promises, and therefore the only things
 * that can be missing at runtime — `name` and `displayName` are data, and a
 * wrong one fails loudly on the first lookup rather than silently at a call
 * site.
 */
const REQUIRED_METHODS = ["purchase", "verifyAndParseCallback", "verify"] as const;

/**
 * Registration refused because the object does not do what the interface says.
 *
 * A distinct class rather than a bare `Error` so a caller (or a test) can
 * assert on the failure without string-matching a message that is free to
 * change.
 */
export class IncompleteAdapterError extends Error {
  readonly code = "ADAPTER_INCOMPLETE";
  readonly adapterName: string;
  readonly missing: readonly string[];

  constructor(adapterName: string, missing: readonly string[]) {
    super(
      `Adapter "${adapterName}" does not implement: ${missing.join(", ")}. ` +
        `Every VtuProviderAdapter method must exist before the adapter is registered.`,
    );
    this.name = "IncompleteAdapterError";
    this.adapterName = adapterName;
    this.missing = missing;
  }
}

/**
 * Throw unless `adapter` implements every method the interface declares.
 *
 * Exported because the credential layer re-checks at the point of use: an
 * object can satisfy this at registration and still be missing a method by the
 * time it is called (a test that mutates the stub, a future hot-reload path).
 */
export function assertCompleteAdapter(adapter: VtuProviderAdapter | null | undefined): void {
  const missing = REQUIRED_METHODS.filter(
    (method) => typeof (adapter as any)?.[method] !== "function",
  );
  if (missing.length > 0) {
    throw new IncompleteAdapterError(adapter?.name ?? "<unnamed>", missing);
  }
}

const REGISTRY: Record<string, VtuProviderAdapter> = {};

// Registered through the validated path, not a literal, so the two adapters
// this ships with are held to the same standard as any future one. A method
// dropped from either file fails here, at import, instead of on the first
// purchase that reaches it.
registerAdapter(pairgateAdapter);
registerAdapter(aidapayAdapter);

/** Resolve an adapter by name, or null when the name is unknown. */
export function getAdapter(name: string): VtuProviderAdapter | null {
  return REGISTRY[name] ?? null;
}

/**
 * Add an adapter at runtime, after checking it does what it claims.
 *
 * Exists so the two-provider test can register a stub WITHOUT editing this
 * file — which is the entire claim slice 2 makes: that resolution is a lookup
 * against a set, not a hard-coded branch. Slice 4 used the same path when it
 * added a real second adapter.
 *
 * Validation runs FIRST, so a refused registration leaves the previous adapter
 * for that name intact: the failure mode of a bad registration is a thrown
 * error, never a silently degraded provider that stops working mid-slice.
 */
export function registerAdapter(adapter: VtuProviderAdapter): void {
  assertCompleteAdapter(adapter);
  REGISTRY[adapter.name] = adapter;
}

/** Names the registry can serve. Used by admin UIs and tests. */
export function listAdapterNames(): string[] {
  return Object.keys(REGISTRY);
}
