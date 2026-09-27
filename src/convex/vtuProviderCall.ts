"use node";

/**
 * Provider credential opening and the outbound call.
 *
 * This is the ONLY place a provider credential is ever decrypted, and the
 * only place an outbound provider HTTP call is made.
 *
 * It is a "use node" module for two independent reasons: it uses `node:crypto`
 * to open a sealed value, and it performs `fetch`. Convex forbids a V8 function
 * from importing it, which is a useful structural guarantee — a query could
 * not decrypt a credential even by accident.
 */

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { tryDecrypt, isSecretError } from "./lib/encryption";
import { getAdapter } from "./vtuRegistry";
import type { ProviderCallOptions, VtuProviderAdapter } from "./vtuShared";

const DEFAULT_TIMEOUT_MS = 20_000;

export type ProviderCallErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_DISABLED"
  | "CREDENTIAL_MISSING"
  | "CREDENTIAL_CORRUPT"
  | "ADAPTER_UNKNOWN"
  | "ADMIN_REQUIRED";

/**
 * A provider-side failure, as a typed code.
 *
 * Carries no credential material in the message, because these errors reach an
 * admin UI and an audit log.
 */
export class VtuProviderError extends Error {
  readonly code: ProviderCallErrorCode;

  constructor(code: ProviderCallErrorCode) {
    super(`Provider error: ${code}`);
    this.name = "VtuProviderError";
    this.code = code;
  }
}

export type ResolvedCall =
  | {
      ok: true;
      adapter: VtuProviderAdapter;
      opts: ProviderCallOptions;
      /** Admin-configured signature header name, for webhook aliasing. */
      signatureHeader?: string;
    }
  | { ok: false; code: ProviderCallErrorCode };

/**
 * Resolve a provider and open its credential, for one outbound call.
 *
 * The returned `opts` holds a PLAINTEXT key. It is a local, it is never
 * persisted, never returned from a query, and never logged — including at
 * debug level and including truncated. See the lifetime markers below.
 */
async function resolveCall(
  ctx: any,
  name: string,
  mode: "purchase" | "verification",
): Promise<ResolvedCall> {
  const resolution: any = await ctx.runQuery(
    mode === "purchase"
      ? internal.vtuProviderConfig.resolveForPurchase
      : internal.vtuProviderConfig.resolveForVerification,
    { name },
  );

  if (!resolution?.ok) {
    return { ok: false, code: (resolution?.code ?? "PROVIDER_NOT_FOUND") as ProviderCallErrorCode };
  }

  // A row can exist for a provider whose adapter has not been written yet —
  // slice 3 will make that reachable through the admin UI. Fail closed.
  const adapter = getAdapter(name);
  if (!adapter) return { ok: false, code: "ADAPTER_UNKNOWN" };

  const sealed =
    mode === "purchase" ? resolution.provider.encryptedApiKey : resolution.provider.encryptedWebhookSecret;
  if (!sealed) return { ok: false, code: "CREDENTIAL_MISSING" };

  // ═══ PLAINTEXT CREDENTIAL LIFETIME — BEGINS ═══════════════════
  // `opened` is a local. It must never be assigned to a query result, an
  // audit row, a notification, or a log. It goes out of scope when this
  // function returns and the caller uses only `opts` thereafter.
  const opened = await tryDecrypt(sealed);
  // ═══ PLAINTEXT CREDENTIAL LIFETIME — ENDS ═════════════════════

  if (!opened.ok) {
    // A truncated payload, a wrong master key, and a tampered row all land
    // here. Reported as a typed code rather than rethrown, so a corrupt
    // credential produces a clean provider error instead of an unhandled
    // crypto exception reaching the client.
    return { ok: false, code: "CREDENTIAL_CORRUPT" };
  }

  return {
    ok: true,
    adapter,
    opts: {
      baseUrl: resolution.provider.baseUrl,
      apiKey: opened.value,
      timeoutMs: resolution.provider.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: fetch,
    },
    signatureHeader: resolution.provider.callbackSignatureHeader,
  };
}

/**
 * Open a provider credential for a purchase.
 *
 * Throws {@link VtuProviderError} on any resolution failure. Callers surface
 * the code; they must not attempt an env fallback, because none exists.
 */
export async function openForPurchase(ctx: any, name: string): Promise<ResolvedCall> {
  return resolveCall(ctx, name, "purchase");
}

/** Open a provider's webhook secret for callback verification. */
export async function openForVerification(ctx: any, name: string): Promise<ResolvedCall> {
  return resolveCall(ctx, name, "verification");
}

// ─── Test connection ────────────────────────────────────────────────

export interface TestConnectionResult {
  ok: boolean;
  provider: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Probe a provider's read-only health or balance endpoint.
 *
 * HARD CONSTRAINT: this only ever issues a `GET` to the row's configured
 * `healthPath`. It never calls `purchase`, because a test button wired to a
 * spending path is a foot-gun holding a production key. The "no transaction
 * created" assertion in the test suite is what keeps that honest.
 */
export const testProviderConnection = action({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<TestConnectionResult> => {
    // Admin-gated server-side; the UI check is convenience only.
    const userId = await getAuthUserId(ctx as any);
    if (!userId) return { ok: false, provider: args.name, error: "ADMIN_REQUIRED" };
    const isAdmin = await ctx.runQuery(internal.vtuProviderAdmin.isAdmin, { userId });
    if (!isAdmin) return { ok: false, provider: args.name, error: "ADMIN_REQUIRED" };

    // A disabled provider may still be tested — an operator diagnosing an
    // outage needs to probe it, and probing does not route any money.
    const row: any = await ctx.runQuery(internal.vtuProviderAdmin.getForTest, {
      name: args.name,
    });
    if (!row) {
      return { ok: false, provider: args.name, error: "PROVIDER_NOT_FOUND" };
    }
    if (!row.healthPath) {
      return { ok: false, provider: args.name, error: "HEALTH_PATH_NOT_CONFIGURED" };
    }

    const sealed = row.encryptedApiKey;
    if (!sealed) {
      return { ok: false, provider: args.name, error: "CREDENTIAL_MISSING" };
    }

    // ═══ PLAINTEXT CREDENTIAL LIFETIME — BEGINS ═══════════════════
    const opened = await tryDecrypt(sealed);
    // ═══ PLAINTEXT CREDENTIAL LIFETIME — ENDS ═════════════════════
    if (!opened.ok) {
      await recordTest(ctx, args.name, false, "CREDENTIAL_CORRUPT");
      return { ok: false, provider: args.name, error: "CREDENTIAL_CORRUPT" };
    }

    const url = `${String(row.baseUrl).replace(/\/+$/, "")}${row.healthPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const started = Date.now();

    try {
      const response = await fetch(url, {
        // GET only. Never POST here.
        method: "GET",
        headers: {
          accept: "application/json",
          ...(row.authHeader ? { [row.authHeader]: opened.value } : {}),
        },
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;

      // A 401/403 means the credential is wrong, which is the case an admin
      // most needs told apart from a network problem.
      if (response.status === 401 || response.status === 403) {
        await recordTest(ctx, args.name, false, "CREDENTIALS_REJECTED");
        return { ok: false, provider: args.name, latencyMs, error: "CREDENTIALS_REJECTED" };
      }
      if (!response.ok) {
        const message = `HTTP_${response.status}`;
        await recordTest(ctx, args.name, false, message);
        return { ok: false, provider: args.name, latencyMs, error: message };
      }

      await recordTest(ctx, args.name, true);
      return { ok: true, provider: args.name, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof Error ? error.message : "NETWORK_ERROR";
      // Recorded as a short message. Never derived from the credential.
      await recordTest(ctx, args.name, false, "NETWORK_ERROR");
      return { ok: false, provider: args.name, latencyMs, error: message.slice(0, 120) };
    } finally {
      clearTimeout(timer);
    }
  },
});

async function recordTest(
  ctx: any,
  name: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  await ctx.runMutation(internal.vtuProviderAdmin.recordTestResult, {
    name,
    ok,
    error,
  });
}

/** Guard used by callers that prefer a thrown typed error. */
export function requireCall(resolved: ResolvedCall): ResolvedCall & { ok: true } {
  if (!resolved.ok) throw new VtuProviderError(resolved.code);
  return resolved;
}

export { isSecretError };
