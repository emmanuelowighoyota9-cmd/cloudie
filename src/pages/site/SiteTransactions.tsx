import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ArrowDownLeft, ArrowUpRight, Activity, Search } from "lucide-react";
import { useState } from "react";
import { bankTheme, bankTone } from "@/lib/tenantBankTheme";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SiteTransactions() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const txns = useQuery(api.tenants.myTransactions, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const [search, setSearch] = useState("");

  // Design kit from the banking template applied at tenancy creation.
  const theme = bankTheme(site?.branding);
  const { panel, border, text, muted, radius, inputBg, divider } = theme;
  const ok = bankTone(theme, "success");
  const bad = bankTone(theme, "danger");

  const filtered = txns?.filter((t) =>
    !search || t.description.toLowerCase().includes(search.toLowerCase()) || t.type.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const totalIn = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  if (site === undefined || txns === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }

  return (
    <SiteLayout active="transactions" authenticated>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transaction History</h1>
          <p className="mt-1 text-sm" style={{ color: muted }}>All deposits, withdrawals, and transfers.</p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total Transactions", value: String(filtered.length), color: text },
            { label: "Total Deposits", value: `+${fmtCurrency(totalIn)}`, color: ok.fg },
            { label: "Total Withdrawals", value: `-${fmtCurrency(totalOut)}`, color: bad.fg },
          ].map((k) => (
            <div key={k.label} className="p-5" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
              <p className="text-xs font-medium" style={{ color: muted }}>{k.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight" style={{ color: k.color }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full py-3 pl-10 pr-4 text-sm outline-none"
            style={{ backgroundColor: inputBg, border: `1px solid ${border}`, borderRadius: radius, color: text }}
          />
        </div>

        {/* Transaction List */}
        <div className="overflow-hidden" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm" style={{ color: muted }}>
              <Activity className="mx-auto mb-3 h-10 w-10" style={{ color: muted }} />
              <p className="font-medium">No transactions found</p>
              <p className="mt-1 text-xs">Your transaction history will appear here.</p>
            </div>
          ) : (
            <div>
              {filtered.map((t) => (
                <div key={t._id} className="flex items-center gap-4 px-5 py-4 transition-colors" style={{ borderTop: `1px solid ${divider}` }}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: t.amount >= 0 ? ok.bg : bad.bg, color: t.amount >= 0 ? ok.fg : bad.fg }}>
                    {t.amount >= 0 ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t.description}</p>
                    <p className="mt-0.5 text-xs capitalize" style={{ color: muted }}>{t.type.replace(/_/g, " ")} · {fmtDate(t.createdAt)}</p>
                  </div>
                  <span className="text-base font-bold" style={{ color: t.amount >= 0 ? ok.fg : bad.fg }}>
                    {t.amount >= 0 ? "+" : ""}{fmtCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
