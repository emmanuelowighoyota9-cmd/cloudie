import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useEffect } from "react";
import { extractSubdomain, getHost } from "@/lib/tenantHost";
import { TenantSuspendedPage } from "@/components/tenant/TenantGate";
import SiteBanking from "@/pages/site/SiteBanking";

/**
 * Wildcard entry: renders the banking portal for the current host's tenant.
 * Works for:
 *   - crestline-capitalfive.g0ki.com/banking  (wildcard host)
 *   - /t/:subdomain/banking                     (path fallback for preview/localhost)
 *   - /banking                                  (wildcard host bare /banking alias)
 */

function useResolvedSubdomain(): string | null {
  const { subdomain } = useParams<{ subdomain: string }>();
  return useMemo(() => {
    if (subdomain) return subdomain.toLowerCase();
    return extractSubdomain(getHost());
  }, [subdomain]);
}

export default function TenantBankingHost() {
  const sub = useResolvedSubdomain();
  const resolved = useQuery(
    api.tenantResolver.resolveBySubdomain as any,
    sub ? { subdomain: sub } : "skip"
  ) as any;

  // Redirect from path-hosted /t/:sub/banking to canonical /site/:id/banking when we have the id,
  // only if not on a wildcard host (on wildcard, keep the host-rooted URL).
  const host = typeof window !== "undefined" ? window.location.host.toLowerCase() : "";
  const isWildcard = host.endsWith(".g0ki.com");

  if (!sub) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="text-sm font-semibold">Banking tenant — no tenant context</div>
          <div className="text-xs text-slate-500 mt-2">Visit crestline-capitalfive.g0ki.com/banking or /t/crestline-capitalfive/banking.</div>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/admin/tenants/banking" className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">Banking tenants</Link>
            <Link to="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">Home</Link>
          </div>
        </div>
      </div>
    );
  }

  if (resolved === undefined) {
    return <div className="min-h-[40vh] flex items-center justify-center p-8"><div className="animate-pulse text-sm text-slate-400">Resolving {sub}.g0ki.com…</div></div>;
  }
  if (!resolved) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-md">
          <div className="text-sm font-semibold">Tenant not found</div>
          <div className="text-xs text-slate-500 mt-1">No tenant for {sub}.g0ki.com. Create it at /admin/tenants/new.</div>
          <Link to="/admin/tenants/new" className="mt-3 inline-flex rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">Create tenant</Link>
        </div>
      </div>
    );
  }

  const lifecycle: string = resolved.lifecycleStatus ?? (resolved.isActive ? "active" : "disabled");
  if (!resolved.isAvailable) {
    return <TenantSuspendedPage siteName={resolved.siteName} subdomain={resolved.subdomain} status={lifecycle} planTier={resolved.plan} />;
  }

  // On wildcard host, render the banking portal for this tenant's id.
  // On preview/localhost, render the same portal but keep the /t/:sub path for navigation.
  // We use location state to pass tenantId to SiteBanking without changing its API:
  // patch window history so SiteBanking can resolve via subdomain if needed.
  if (isWildcard) {
    // Provide tenant id via a data attribute so SiteBanking can pick it up if it reads route params
    // For now, redirect to the canonical site path with the real id.
    return <WildcardRedirect tenantId={resolved.tenantId ?? resolved._id} subdomain={sub} />;
  }

  return (
    <div className="space-y-3">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <div className="text-xs text-slate-400">
          Tenant context: <span className="font-mono text-slate-700">{sub}.g0ki.com</span> → <Link to={`/site/${resolved.tenantId ?? resolved._id}/banking`} className="underline">open canonical banking portal</Link>
        </div>
      </div>
      <WildcardRedirect tenantId={resolved.tenantId ?? resolved._id} subdomain={sub} />
    </div>
  );
}

function WildcardRedirect({ tenantId, subdomain }: { tenantId: string; subdomain: string }) {
  const nav = useNavigate();
  useEffect(() => {
    if (tenantId) nav(`/site/${tenantId}/banking`, { replace: true });
  }, [tenantId, nav]);
  if (!tenantId) return <div className="p-8 text-sm text-slate-500">Resolved tenant {subdomain} has no id.</div>;
  return <div className="p-8 text-sm text-slate-400 animate-pulse">Opening {subdomain}.g0ki.com…</div>;
}
