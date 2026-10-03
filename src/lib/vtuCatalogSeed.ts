/**
 * Starter airtime catalog.
 *
 * Why this file exists at all: the catalog is DATA, so nothing is sellable
 * until an operator has written a row. That is correct design and a bad first
 * run — a fresh deployment shows the customer an empty shop, and the only
 * existing seed refuses to write anything unless a `pairgate` provider row
 * already exists. On an AidaPay-only deployment it therefore always returned
 * `blocked` and the shop stayed empty forever.
 *
 * So the starter catalog is derived rather than hand-typed, and it is derived
 * from the providers that ACTUALLY have a row: a route pointing at a provider
 * that was never configured can never be chosen, so seeding one would only
 * hide the real problem behind a product that fails with NO_ROUTE_AVAILABLE.
 *
 * IDIOPOTENT and NON-DESTRUCTIVE by construction — this file only describes
 * what a MISSING row should look like. It never describes an edit, so an
 * operator who re-points `airtime-mtn` at a different provider keeps their
 * change across re-runs.
 *
 * AIRTIME ONLY, deliberately. A data plan, a bouquet and a meter top-up each
 * need a provider's own ids (`package_api_code`, `provider_code`) and a real
 * price, so seeding them from here would mean inventing ids that 404 on the
 * first live purchase. Those products are added by hand at
 * `/admin/vtu/catalog` — see `docs/vtu-slice-7.md` §6.
 */

import { AIRTIME_NETWORK_LABELS } from "./vtu";

/** A row the seed would like `vtuServiceCatalog` to contain. */
export interface SeedProduct {
  serviceType: "airtime";
  productCode: string;
  displayName: string;
  customerIdentifierLabel: string;
  requiresAmount: true;
  requiresPackageCode: false;
  /** Exactly the bounds `parseServiceCode` already enforced in code, so moving
   *  them into data widens nothing that was previously buyable. */
  minAmount: number;
  maxAmount: number;
  active: true;
}

/** A row the seed would like `vtuServiceRouting` to contain. */
export interface SeedRoute {
  productCode: string;
  provider: string;
  providerProductCode: string;
  priority: number;
  active: true;
}

/** The four Nigerian networks, in the order the customer should see them. */
export const AIRTIME_SEED_NETWORKS = ["mtn", "airtel", "glo", "9mobile"] as const;

/**
 * The provider ids this seed knows how to write a route for.
 *
 * Keyed by the registry name, NOT the display name, because the registry name
 * is what `vtuServiceRouting.provider` joins on.
 *
 * Each entry answers one question: "what string does THIS aggregator expect in
 * `providerProductCode`?" The two conventions are genuinely different, and
 * getting it wrong is a 400 on a live purchase:
 *
 *   - `pairgate` encodes the size INTO the code, so it carries the `{amount}`
 *     token and the amount composes into `airtime.mtn.1000`.
 *   - `aidapay` names the network and sends the size as its own numeric field,
 *     so its `provider_code` is the bare network slug. See
 *     `providerCodeOf` in `src/convex/providers/aidapay.ts`, which derives
 *     exactly this from the parsed service code.
 */
export const AIRTIME_SEED_PROVIDER_CODES: Record<string, (network: string) => string> = {
  pairgate: (network) => `airtime.${network}.{amount}`,
  aidapay: (network) => network,
};

/** The canonical product rows, independent of which providers exist. */
export function airtimeSeedProducts(): SeedProduct[] {
  return AIRTIME_SEED_NETWORKS.map((network) => ({
    serviceType: "airtime",
    productCode: `airtime-${network}`,
    displayName: `${AIRTIME_NETWORK_LABELS[network] ?? network} Airtime`,
    customerIdentifierLabel: "Phone number",
    requiresAmount: true,
    requiresPackageCode: false,
    minAmount: 100,
    maxAmount: 100_000,
    active: true,
  }));
}

/**
 * The routes for a set of CONFIGURED provider names.
 *
 * A provider with no known code convention is skipped rather than guessed at:
 * a wrong `providerProductCode` fails only once a customer has been charged, so
 * the safe move is to leave the product unrouted, which the admin screen already
 * surfaces as a "no active route" warning next to a one-field fix.
 */
export function airtimeSeedRoutes(providerNames: string[]): SeedRoute[] {
  const routes: SeedRoute[] = [];
  for (const provider of providerNames) {
    const codeFor = AIRTIME_SEED_PROVIDER_CODES[provider];
    if (!codeFor) continue;
    // Priority is per-PRODUCT in the routing table, so the same provider
    // ordering applies to every network. AidaPay sits above Pairgate because it
    // is the live integration; Pairgate stays the fallback for any product that
    // has no AidaPay route.
    const priority = provider === "aidapay" ? 10 : 20;
    for (const product of airtimeSeedProducts()) {
      const network = product.productCode.slice("airtime-".length);
      routes.push({
        productCode: product.productCode,
        provider,
        providerProductCode: codeFor(network),
        priority,
        active: true,
      });
    }
  }
  return routes;
}
