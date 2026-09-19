import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Landmark, Plus, Search } from "lucide-react";

export default function AdminBankingTenants() {
  const [lifecycle, setLifecycle] = useState<string>("");
  const [search, setSearch] = useState("");
  const rows = useQuery(api.bankingTenant.listBankingTenants, { limit: 200, lifecycle: lifecycle || undefined, search: search || undefined });
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Landmark className="h-5 w-5" /> Banking tenants</h1>
        <Link to="/admin/tenants/new" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold"><Plus className="h-4 w-4" /> New banking tenant</Link>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or subdomain…" className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm dark:bg-slate-900 dark:border-slate-700" />
        </div>
        <select value={lifecycle} onChange={e => setLifecycle(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-900 dark:border-slate-700">
          <option value="">All lifecycles</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="disabled">Disabled</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {rows === undefined ? <div className="p-6 text-sm text-slate-400 animate-pulse">Loading…</div> : rows.length === 0 ? <div className="p-6 text-sm text-slate-500">No banking tenants yet. Create the first (e.g. Crestline Capital).</div> : rows.map((r: any) => (
          <Link key={r._id} to={`/admin/tenants/${r._id}/banking`} className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <Landmark className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm flex items-center gap-2">{r.siteName} <span className={`text-[11px] rounded-full px-2 py-0.5 border ${r.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600"}`}>{(r as any).lifecycleStatus ?? (r.isActive ? "active" : "disabled")}</span><span className="text-xs text-slate-400">{(r as any).currency ?? "USD"}</span></div>
              <div className="text-xs text-slate-500">{r.subdomain}.g0ki.com · {(r as any).displayName ?? ""} · {(r as any).plan ?? ""}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
