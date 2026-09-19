import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { extractSubdomain, getHost } from "@/lib/tenantHost";
import { Link } from "react-router";
import { Landmark, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

export function TenantSuspendedPage({
  siteName,
  subdomain,
  status,
  planTier,
}: {
  siteName: string;
  subdomain: string;
  status: string;
  planTier?: string | null;
}) {
  const isPaused = status === "paused" || status === "suspended";
  const isDisabled = status === "disabled" || status === "archived";
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-10">
      <div className="max-w-2xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">{siteName}</div>
            <div className="text-xs text-slate-500">{subdomain}.g0ki.com · {(planTier ?? "Free Plan").toString()} · {status}</div>
          </div>
          <span className={`ml-auto rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${isPaused ? "bg-amber-50 text-amber-700 border-amber-200" : isDisabled ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100"}`}>
            {status === "suspended" ? "PAUSED / DISABLED" : status.toUpperCase()}
          </span>
        </div>
        <div className="p-6 sm:p-8 space-y-4">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-5 w-5 text-slate-700" />
            {isPaused ? "This banking tenant is temporarily suspended" : isDisabled ? "This banking tenant is disabled" : "Tenant unavailable"}
          </h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {isPaused
              ? "Frontend routes for this tenant are temporarily suspended from public traffic. Backend API processing and automated background tasks are paused. All database schemas, user state, and ledger history remain preserved for full restoration upon plan renewal."
              : isDisabled
                ? "This tenant has been disabled. Customer transactions are blocked and background processing is stopped. Ledger history and audit logs are preserved and can be restored by a Super Admin."
                : "This tenant cannot serve traffic at the moment."}
          </p>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 text-xs leading-5 text-slate-600 dark:text-slate-400">
            <div className="font-semibold text-slate-700 dark:text-slate-200">What remains preserved</div>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>All tenant database schemas, user state, and KYC records</li>
              <li>Double-entry ledger history and account balances (authoritative)</li>
              <li>Audit logs and security events</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link to="/" className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800">Back to Cloudie</Link>
            <Link to="/auth" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Wildcard host gate: ONLY gates when the current host is *.g0ki.com.
 * On preview (*.vly.sh), localhost, convex hosts, and regular Cloudie routes
 * it is a no-op so the app never blocks in development/preview.
 *
 * When on *.g0ki.com it resolves the tenant from the subdomain and either
 * renders children, the suspended/paused fallback, or a "tenant not found"
 * page — matching the PAUSED / DISABLED spec screenshot.
 */
export function TenantGate({ children }: { children: React.ReactNode }) {
  const host = useMemo(() => getHost(), []);
  const isWildcardHost = useMemo(() => host.endsWith(".g0ki.com"), [host]);
  const sub = useMemo(() => (isWildcardHost ? extractSubdomain(host) : null), [host, isWildcardHost]);
  const resolved = useQuery(
    api.tenantResolver.resolveByHost as any,
    isWildcardHost && sub ? { host } : "skip"
  ) as any;

  // Not a wildcard tenant host — no gate. Path-based /site/:id routes work normally.
  if (!isWildcardHost || !sub) return <>{children}</>;

  if (resolved === undefined) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-8">
        <div className="animate-pulse text-sm text-slate-400">Resolving tenant {sub}.g0ki.com…</div>
      </div>
    );
  }
  if (!resolved?.tenant) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-md">
          <div className="text-sm font-semibold">Tenant not found</div>
          <div className="text-xs text-slate-500 mt-1">No tenant is provisioned for {sub}.g0ki.com. Ask a Super Admin to provision it at /admin/tenants/new.</div>
          <Link to="/admin/tenants/new" className="mt-3 inline-flex rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">Provision tenant</Link>
        </div>
      </div>
    );
  }
  const t = resolved.tenant;
  if (!t.isAvailable) {
    return <TenantSuspendedPage siteName={t.siteName} subdomain={t.subdomain} status={t.lifecycleStatus} planTier={t.plan} />;
  }
  return <>{children}</>;
}

/** Hook: current wildcard tenant if any. Only active on *.g0ki.com. */
export function useWildcardTenant() {
  const host = useMemo(() => getHost(), []);
  const isWildcardHost = useMemo(() => host.endsWith(".g0ki.com"), [host]);
  const sub = useMemo(() => (isWildcardHost ? extractSubdomain(host) : null), [host, isWildcardHost]);
  const resolved = useQuery(api.tenantResolver.resolveByHost as any, isWildcardHost && sub ? { host } : "skip") as any;
  return { subdomain: sub, host, resolved, tenant: resolved?.tenant ?? null, isWildcard: isWildcardHost && !!sub };
}
