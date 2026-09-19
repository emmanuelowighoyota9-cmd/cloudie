import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ArrowDownLeft, ArrowUpRight, Activity, Search } from "lucide-react";
import { useState } from "react";

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
  const primary = site?.branding?.primaryColor || "#003087";

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
          <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
          <p className="mt-1 text-sm text-gray-500">All deposits, withdrawals, and transfers.</p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-400 font-medium">Total Transactions</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{filtered.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-400 font-medium">Total Deposits</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">+{fmtCurrency(totalIn)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-400 font-medium">Total Withdrawals</p>
            <p className="mt-1 text-2xl font-bold text-red-600">-{fmtCurrency(totalOut)}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>

        {/* Transaction List */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              <Activity className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="font-medium">No transactions found</p>
              <p className="mt-1 text-xs">Your transaction history will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((t) => (
                <div key={t._id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    t.amount >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  }`}>
                    {t.amount >= 0 ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{t.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">{t.type.replace(/_/g, " ")} · {fmtDate(t.createdAt)}</p>
                  </div>
                  <span className={`text-base font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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
