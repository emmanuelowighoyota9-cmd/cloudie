import { useParams, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  Landmark, PiggyBank, CreditCard, ArrowDownLeft, ArrowUpRight,
  ShieldCheck, Bell, Wallet, Activity, Clock, CheckCircle, XCircle,
} from "lucide-react";
import { bankTheme } from "@/lib/tenantBankTheme";
const ACCOUNT_ICONS: Record<string, typeof Landmark> = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function maskAccount(n: string) {
  return `••••${n.slice(-4)}`;
}

export default function SiteDashboard() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const accounts = useQuery(api.tenants.myAccounts, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const transactions = useQuery(api.tenants.myTransactions, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const notifications = useQuery(api.tenants.myNotifications, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const kyc = useQuery(api.tenants.myKyc, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");

  // Design kit from the banking template applied at tenancy creation.
  const theme = bankTheme(site?.branding);
  const { primary, accent, text, muted, panel, border, radius, isDark } = theme;
  // Account faces follow the tenant palette instead of a fixed house gradient;
  // credit stays a deliberately distinct red so it is never mistaken for cash.
  const accountGradient = (type: string) =>
    type === "checking"
      ? `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`
      : type === "savings"
        ? `linear-gradient(135deg, ${accent} 0%, ${primary} 115%)`
        : "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)";
  const totalBalance = accounts?.filter((a) => a.isActive).reduce((s, a) => s + a.balance, 0) ?? 0;
  const latestKyc = kyc?.[0] ?? null;

  if (site === undefined || accounts === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }

  return (
    <SiteLayout active="dashboard" authenticated>
      {/* ── Welcome Hero ── */}
      <div
        className="text-white"
        style={{
          backgroundColor: primary,
          // Dark templates get a soft top-right sheen so the hero does not read flat.
          backgroundImage: isDark ? "radial-gradient(120% 130% at 100% 0%, rgba(255,255,255,0.12) 0%, transparent 58%)" : undefined,
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
          <p className="text-sm text-white/60 font-medium uppercase tracking-wider">Welcome back</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">
            {fmtCurrency(totalBalance)}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {accounts?.filter((a) => a.isActive).length ?? 0} active account{(accounts?.filter((a) => a.isActive).length ?? 0) !== 1 ? "s" : ""}
          </p>

          {/* Quick Actions */}
          <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
            {[
              { icon: ArrowDownLeft, label: "Deposit", color: "bg-emerald-500" },
              { icon: ArrowUpRight, label: "Transfer", color: "bg-blue-400" },
              { icon: ShieldCheck, label: "Verify ID", color: "bg-amber-500" },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.label === "Verify ID" ? `/site/${siteId}/kyc` : "#"}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${a.color}`}>
                  <a.icon className="h-4 w-4 text-white" />
                </div>
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
        {/* Status Banner */}
        {latestKyc && latestKyc.status !== "approved" && (
          <div className={`flex items-center gap-3 rounded-xl border p-4 ${
            latestKyc.status === "submitted" || latestKyc.status === "under_review"
              ? "bg-amber-50 border-amber-200"
              : latestKyc.status === "rejected"
                ? "bg-red-50 border-red-200"
                : "bg-orange-50 border-orange-200"
          }`}>
            <ShieldCheck className={`h-5 w-5 ${
              latestKyc.status === "rejected" ? "text-red-500" : "text-amber-500"
            }`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Identity verification: {latestKyc.status.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {latestKyc.status === "resubmission_required"
                  ? "Please resubmit your identity documents."
                  : "Your verification is being reviewed."}
              </p>
            </div>
            <Link to={`/site/${siteId}/kyc`} className="text-xs font-bold hover:underline" style={{ color: primary }}>
              View →
            </Link>
          </div>
        )}

        {/* Accounts Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: text }}>My Accounts</h2>
            <Link to={`/site/${siteId}/accounts`} className="text-sm font-medium hover:underline" style={{ color: accent }}>
              View All →
            </Link>
          </div>
          {(!accounts || accounts.length === 0) ? (
            <div className="p-12 text-center" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
              <Landmark className="mx-auto h-12 w-12" style={{ color: muted }} />
              <p className="mt-3 text-sm font-medium" style={{ color: text }}>No accounts yet</p>
              <p className="mt-1 text-xs" style={{ color: muted }}>Open your first account to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.filter((a) => a.isActive).map((acct) => {
                const Icon = ACCOUNT_ICONS[acct.accountType] || Landmark;
                return (
                  <div
                    key={acct._id}
                    className="relative overflow-hidden p-5 text-white shadow-lg"
                    style={{ backgroundImage: accountGradient(acct.accountType), borderRadius: radius }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-medium bg-white/15 rounded-full px-2 py-0.5 capitalize">{acct.accountType}</span>
                    </div>
                    <p className="mt-4 text-sm text-white/80">{acct.name}</p>
                    <p className="mt-1 text-2xl font-bold">{fmtCurrency(acct.balance)}</p>
                    <p className="mt-2 font-mono text-[11px] text-white/50">{maskAccount(acct.accountNumber)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Recent Transactions */}
          <div>
            <h2 className="text-lg font-bold mb-4" style={{ color: text }}>Recent Transactions</h2>
            <div className="overflow-hidden" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
              {!transactions || transactions.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: muted }}>
                  <Activity className="mx-auto mb-2 h-8 w-8" style={{ color: muted }} />
                  No transactions yet
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {transactions.slice(0, 10).map((t) => (
                    <div
                      key={t._id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors"
                      style={{ borderColor: border }}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        t.amount >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}>
                        {t.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: text }}>{t.description}</p>
                        <p className="text-[11px]" style={{ color: muted }}>{fmtDate(t.createdAt)}</p>
                      </div>
                      <span className={`text-sm font-semibold ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {t.amount >= 0 ? "+" : ""}{fmtCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: text }}>Notifications</h2>
              <Link to={`/site/${siteId}/notifications`} className="text-sm font-medium hover:underline" style={{ color: accent }}>
                View All →
              </Link>
            </div>
            <div className="overflow-hidden" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
              {!notifications || notifications.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: muted }}>
                  <Bell className="mx-auto mb-2 h-8 w-8" style={{ color: muted }} />
                  No new notifications
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.slice(0, 8).map((n) => (
                    <div key={n._id} className="px-4 py-3 transition-colors" style={{ borderColor: border }}>
                      <p className="text-sm font-medium" style={{ color: text }}>{n.title}</p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: muted }}>{n.message}</p>
                      <p className="text-[10px] mt-1" style={{ color: muted }}>
                        <Clock className="inline h-3 w-3 mr-0.5" />{fmtDate(n.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
