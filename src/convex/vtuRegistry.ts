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
 * Marked "use node" because every adapter is Node-only (they use
 * `node:crypto` and make outbound HTTP calls). Without the marker Convex
 * treats this as a V8 module, and the bundler cannot resolve `node:crypto`
 * through it. Only actions ever call `getAdapter`, so the Node runtime is also
 * the correct place for it to live.
 */

import { aidapayAdapter } from "./providers/aidapay";
import { pairgateAdapter } from "./vtuPairgate";
import type { VtuProviderAdapter } from "./vtuShared";

const REGISTRY: Record<string, VtuProviderAdapter> = {
  [pairgateAdapter.name]: pairgateAdapter,
  [aidapayAdapter.name]: aidapayAdapter,
};

/** Resolve an adapter by name, or null when the name is unknown. */
export function getAdapter(name: string): VtuProviderAdapter | null {
  return REGISTRY[name] ?? null;
}

/**
 * Add an adapter at runtime.
 *
 * Exists so the two-provider test can register a stub WITHOUT editing this
 * file — which is the entire claim slice 2 makes: that resolution is a lookup
 * against a set, not a hard-coded branch. Slice 4 will use the same path when
 * it adds a real second adapter.
 */
export function registerAdapter(adapter: VtuProviderAdapter): void {
  REGISTRY[adapter.name] = adapter;
}

/** Names the registry can serve. Used by admin UIs and tests. */
export function listAdapterNames(): string[] {
  return Object.keys(REGISTRY);
}
