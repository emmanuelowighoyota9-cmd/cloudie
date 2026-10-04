"use node";

/**
 * Catalog sync — pull a provider's own published catalog and turn it into rows.
 *
 * This is the action half of a pair. It does the network I/O and NOTHING else;
 * every decision about what a valid product is lives in
 * `src/lib/vtuCatalogSync.ts` as pure functions, which is what makes the risky
 * part (whether a plan read off the wire can be addressed at all) testable
 * without a token.
 *
 * ── Why a sync and not more seeding ──────────────────────────────────
 *
 * `seedAirtimeCatalog` covers the four airtime networks, and it can, because
 * an airtime plan has no id: the customer picks an amount and the provider is
 * told the network. Data plans, bouquets, meter tokens and exam PINs are the
 * opposite — each plan has a provider-owned `package_api_code` and a price.
 * Inventing those would produce a catalog that looks full and 400s on the first
 * live purchase, so the only honest source is the provider's own list.
 *
 * ── Cost discipline ─────────────────────────────────────────────────
 *
 * One call per biller, per service type, and no polling. AidaPay documents
 * "fair per-account limits … with purchases counted separately from
 * look-ups", so a sync that ran on a schedule would be spending a metered
 * budget for data that changes rarely. This is therefore a BUTTON, and the UI
 * says so.
 *
 * Only `GET`, and only read-only endpoints. This file cannot reach the purchase
 * path even by accident: it never imports the registry's `purchase`, and the
 * credential it opens is the API key, never the account PIN.
 */

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { tryDecrypt } from "./lib/encryption";
import { composeAuthHeader } from "./vtuShared";
import {
  SYNCABLE_SERVICES,
  buildDrafts,
  parsePackageResponse,
  parseServiceResponse,
  type CatalogDraft,
  type SkippedPlan,
} from "../lib/vtuCatalogSync";

const DEFAULT_TIMEOUT_MS = 20_000;

/** The provider this action knows how to enumerate. */
const PROVIDER = "aidapay";

/** AidaPay's API base. Its own `baseUrl` row is used when set — the preset
 *  value is only a fallback for a row that predates the preset. */
const AIDAPAY_API_BASE = "https://aidapay.ng/api/v1";

export type SyncOutcome = {
  ok: boolean;
  error?: string;
  /** A human-readable reason a service type could not be read, by slug. */
  serviceErrors: Record<string, string>;
  productsCreated: number;
  productsUpdated: number;
  routesCreated: number;
  routesUpdated: number;
  /** Plans read from the provider but deliberately not written. */
  skipped: SkippedPlan[];
  /** Plans dropped because the provider returned nothing addressable. */
  plansRead: number;
  truncated: number;
};

export const syncAidaPayCatalog = action({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<SyncOutcome> => {
    const empty: SyncOutcome = {
      ok: false,
      serviceErrors: {},
      productsCreated: 0,
      productsUpdated: 0,
      routesCreated: 0,
      routesUpdated: 0,
      skipped: [],
      plansRead: 0,
      truncated: 0,
    };

    // Admin-gated server-side, exactly as the connection test is. The UI check
    // is a convenience layer, not the boundary.
    const userId = await getAuthUserId(ctx as any);
    if (!userId) return { ...empty, error: "ADMIN_REQUIRED" };
    const isAdmin = await ctx.runQuery(internal.vtuProviderAdmin.isAdmin, { userId });
    if (!isAdmin) return { ...empty, error: "ADMIN_REQUIRED" };

    const row: any = await ctx.runQuery(internal.vtuProviderAdmin.getForTest, {
      name: PROVIDER,
    });
    if (!row) return { ...empty, error: "PROVIDER_NOT_CONFIGURED" };
    if (!row.encryptedApiKey) return { ...empty, error: "CREDENTIAL_MISSING" };

    // ═══ PLAINTEXT CREDENTIAL LIFETIME — BEGINS ═══════════════════
    const opened = await tryDecrypt(row.encryptedApiKey);
    // ═══ PLAINTEXT CREDENTIAL LIFETIME — ENDS ═════════════════════
    if (!opened.ok) return { ...empty, error: "CREDENTIAL_CORRUPT" };

    // Composed by the same rule the adapters use, so a provider configured for
    // `Authorization: Bearer` is called exactly the way it will be called for a
    // real purchase. Hand-building the header here would read as "your token is
    // broken" for a provider that is in fact working.
    const authHeaders = composeAuthHeader({
      authHeader: row.authHeader ?? undefined,
      authScheme: row.authScheme ?? undefined,
      apiKey: opened.value,
    });

    const base = `${String(row.baseUrl || AIDAPAY_API_BASE).replace(/\/+$/, "")}`;

    const getJson = async (path: string): Promise<{ ok: true; body: unknown } | { ok: false; code: string }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      try {
        const response = await fetch(`${base}${path}`, {
          method: "GET",
          headers: { accept: "application/json", ...authHeaders },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) return { ok: false, code: "CREDENTIALS_REJECTED" };
        if (!response.ok) return { ok: false, code: `HTTP_${response.status}` };
        return { ok: true, body: await response.json() };
      } catch {
        // A timeout or a DNS failure is reported as its own code rather than
        // being folded into a generic error, because they have different fixes.
        return { ok: false, code: "NETWORK_ERROR" };
      } finally {
        clearTimeout(timer);
      }
    };

    const drafts: CatalogDraft[] = [];
    const skipped: SkippedPlan[] = [];
    const serviceErrors: Record<string, string> = {};
    let plansRead = 0;

    for (const service of SYNCABLE_SERVICES) {
      const servicesResult = await getJson(`/service/${service.slug}`);
      if (!servicesResult.ok) {
        // One unreachable service type does not abort the others: data being
        // unavailable is a partial result, not a failed sync.
        serviceErrors[service.serviceType] = servicesResult.code;
        continue;
      }

      const providers = parseServiceResponse(servicesResult.body);
      for (const provider of providers) {
        const packagesResult = await getJson(
          `/packages/${encodeURIComponent(provider.providerCode)}`,
        );
        if (!packagesResult.ok) {
          serviceErrors[`${service.serviceType}:${provider.providerCode}`] = packagesResult.code;
          continue;
        }
        const packages = parsePackageResponse(packagesResult.body);
        plansRead += packages.length;

        const built = buildDrafts(
          service.serviceType,
          service.label,
          [{ ...provider, packages }],
          PROVIDER,
        );
        drafts.push(...built.drafts);
        skipped.push(...built.skipped);
      }
    }

    if (args.dryRun) {
      // Reports what WOULD be written without writing it, so an operator can
      // see the shape of the catalog before committing to it.
      return {
        ok: true,
        serviceErrors,
        productsCreated: 0,
        productsUpdated: drafts.length,
        routesCreated: 0,
        routesUpdated: drafts.length,
        skipped,
        plansRead,
        truncated: 0,
      };
    }

    const applied: any = await ctx.runMutation(internal.vtuServiceAdmin.applyCatalogSync, {
      drafts,
      provider: PROVIDER,
    });

    return {
      ok: true,
      serviceErrors,
      productsCreated: applied.productsCreated,
      productsUpdated: applied.productsUpdated,
      routesCreated: applied.routesCreated,
      routesUpdated: applied.routesUpdated,
      skipped,
      plansRead,
      truncated: applied.truncated,
    };
  },
});
