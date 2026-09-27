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
 * Marked "use node" because every adapter is Node-only (they use
 * `node:crypto` and make outbound HTTP calls). Without the marker Convex
 * treats this as a V8 module, and the bundler cannot resolve `node:crypto`
 * through it. Only actions ever call `getAdapter`, so the Node runtime is also
 * the correct place for it to live.
 */

import { pairgateAdapter } from "./vtuPairgate";
import type { VtuProviderAdapter } from "./vtuShared";

const REGISTRY: Record<string, VtuProviderAdapter> = {
  [pairgateAdapter.name]: pairgateAdapter,
};

/** Resolve an adapter by name, or null when the name is unknown. */
export function getAdapter(name: string): VtuProviderAdapter | null {
  return REGISTRY[name] ?? null;
}

/** Names the registry can serve. Used by admin UIs and tests. */
export function listAdapterNames(): string[] {
  return Object.keys(REGISTRY);
}
