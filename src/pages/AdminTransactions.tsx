import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, downloadCsv, fmtDate } from "@/components/admin/shared";
import { usePricing, formatNgn } from "@/lib/pricing";

type LedgerEntry = {
  _id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  description: string;
  type: string;
  referenceId?: string;
  idempotencyKey?: string;
  createdAt: number;
};

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "credit", label: "Credits" },
  { value: "debit", label: "Debits" },
  { value: "refund", label: "Refunds" },
  { value: "purchase", label: "Purchases" },
  { value: "service_charge", label: "Service charges" },
  { value: "referral_reward", label: "Referrals" },
  { value: "admin_adjustment", label: "Admin adjustments" },
  { value: "vendor_transaction", label: "Vendor payouts" },
] as const;

const PAGE_SIZE = 25;

export default function AdminTransactions() {
  const { ngnPerPoint } = usePricing();
  const ledger = useQuery(api.points.getAdminLedger, { limit: 1000 }) as LedgerEntry[] | undefined;
  const users = useQuery(api.admin.listUsers, { limit: 1000 });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [page, setPage] = useState(0);

  const userMap = useMemo(() => new Map<string, NonNullable<typeof users>[number]>((users ?? []).map((u) => [u._id as string, u])), [users]);

  const filtered = useMemo(() => {
    if (!ledger) return undefined;
    let list = [...ledger];
    if (typeFilter === "credit") list = list.filter((l) => l.amount > 0);
    else if (typeFilter === "debit") list = list.filter((l) => l.amount < 0);
    else if (typeFilter !== "all") list = list.filter((l) => l.type === typeFilter);
    if (userFilter !== "all") list = list.filter((l) => l.userId === userFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.description.toLowerCase().includes(s) ||
          l.type.toLowerCase().includes(s) ||
          (l.referenceId ?? "").toLowerCase().includes(s) ||
          (userMap.get(l.userId)?.email ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [ledger, typeFilter, userFilter, search, userMap]);

  const paged = filtered?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil((filtered?.length ?? 0) / PAGE_SIZE));

  const exportCsv = async () => {
    try {
      const rows = (await (async () => ledger)()) ?? [];
      if (!rows.length) return;
      downloadCsv(`cloudie-ledger-${new Date().toISOString().split("T")[0]}.csv`, [
        ["ID", "User", "Email", "Amount", "Balance After", "Type", "Description", "Reference", "Created"],
        ...rows.map((l) => [
          l._id,
          l.userId,
          userMap.get(l.userId)?.email ?? "",
          l.amount,
          l.balanceAfter,
          l.type,
          l.description,
          l.referenceId ?? "",
          fmtDate(l.createdAt),
        ]),
      ]);
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Wallet & Ledger"
        description="Immutable point ledger across all users. Entries cannot be created, edited, or deleted from this view."
        actions={
          <Button variant="outline" onClick={exportCsv} className="gap-1.5" disabled={!filtered?.length}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search description, reference, user email…"
            className="pl-9"
            aria-label="Search ledger"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="sm:w-44" aria-label="Transaction type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
          <SelectTrigger className="sm:w-52" aria-label="Filter by user"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {(users ?? []).map((u) => (
              <SelectItem key={u._id} value={u._id}>{u.email ?? u._id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            {filtered === undefined ? "Loading…" : `${filtered.length.toLocaleString()} entries`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered === undefined ? (
            <div className="p-4"><AdminSkeleton rows={8} /></div>
          ) : filtered.length === 0 ? (
            <div className="p-4"><AdminEmpty message="No ledger entries match your filters." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
                    <th className="px-4 py-3 font-medium">Amount (pts / ₦)</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Balance after</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paged!.map((l) => {
                    const u = userMap.get(l.userId);
                    return (
                      <tr key={l._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 font-bold ${l.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {l.amount > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {l.amount > 0 ? "+" : ""}{l.amount.toLocaleString()}
                          </span>
                          <p className="text-[11px] text-slate-400">{formatNgn(l.amount * ngnPerPoint)}</p>
                        </td>
                        <td className="max-w-[180px] px-4 py-3">
                          <p className="truncate text-xs text-slate-700 dark:text-slate-300">{u?.email ?? l.userId.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={l.type} /></td>
                        <td className="max-w-[260px] px-4 py-3">
                          <p className="truncate text-xs text-slate-600 dark:text-slate-400">{l.description}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {l.balanceAfter.toLocaleString()}
                          <span className="ml-1 text-slate-400">· {formatNgn(l.balanceAfter * ngnPerPoint)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(l.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {filtered && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
