import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Search, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, downloadCsv, fmtDate } from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";

type LedgerEntry = {
  _id: string;
  userId: string;
  amountNgn: number;
  balanceAfterNgn: number;
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
  const ledger = useQuery(api.wallet.getAdminLedger, { limit: 1000 }) as LedgerEntry[] | undefined;
  const users = useQuery(api.admin.listUsers, { limit: 1000 });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ledger?.find((l) => l._id === selectedId);
  const selectedUser = selected ? userMap.get(selected.userId) : undefined;
  const highValue = (amount: number) => Math.abs(amount) >= 100000;
  const riskFlags = selected ? [
    ...(highValue(selected.amountNgn) ? ["HIGH_VALUE"] : []),
    ...(selected.amountNgn < 0 ? ["DEBIT"] : []),
    ...(selected.type === "admin_adjustment" ? ["ADMIN_ADJUSTMENT"] : []),
    ...(selected.referenceId ? [] : ["NO_REFERENCE"]),
  ] : [];

  const userMap = useMemo(() => new Map<string, NonNullable<typeof users>[number]>((users ?? []).map((u) => [u._id as string, u])), [users]);

  const filtered = useMemo(() => {
    if (!ledger) return undefined;
    let list = [...ledger];
    if (typeFilter === "credit") list = list.filter((l) => l.amountNgn > 0);
    else if (typeFilter === "debit") list = list.filter((l) => l.amountNgn < 0);
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
          l.amountNgn,
          l.balanceAfterNgn,
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

      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Wallet className="h-3.5 w-3.5" />
        {filtered === undefined ? "Loading…" : `${filtered.length.toLocaleString()} entries`}
        {filtered && filtered.length > 0 && <span className="text-slate-300 dark:text-slate-600">·</span>}
        {filtered && filtered.length > 0 && <span>Page {page + 1} of {totalPages}</span>}
      </div>

      {filtered === undefined ? (
        <AdminSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No ledger entries match your filters." />
      ) : (
        <div className="space-y-3">
          {paged!.map((l) => {
            const u = userMap.get(l.userId);
            const isCredit = l.amountNgn > 0;
            return (
              <Card key={l._id} onClick={() => setSelectedId(l._id)} className="rounded-xl border-slate-200 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700">
                <CardContent className="p-4">
                  {/* Top: amount + badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isCredit ? "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"}`}>
                        {isCredit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className={`text-sm font-bold leading-none ${isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {isCredit ? "+" : ""}₦{l.amountNgn.toLocaleString("en-NG")}
                        </p>
                        
                      </div>
                    </div>
                    <StatusBadge status={l.type} />
                  </div>

                  {/* Middle: user + description */}
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="break-all text-xs font-medium text-slate-700 dark:text-slate-300">
                      {u?.email ?? u?.name ?? l.userId.slice(-12)}
                    </p>
                    {u?.name && u.email && (
                      <p className="mt-0.5 break-all text-[11px] text-slate-500">{u.name}</p>
                    )}
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{l.description}</p>
                    {l.referenceId && (
                      <p className="mt-1.5 break-all font-mono text-[10px] text-slate-400">Ref: {l.referenceId}</p>
                    )}
                  </div>

                  {/* Bottom: balance + date */}
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="text-[11px]">
                      <p className="font-medium text-slate-700 dark:text-slate-300">Balance ₦{l.balanceAfterNgn.toLocaleString("en-NG")}</p>
                      
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {fmtDate(l.createdAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Transaction details">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Transaction monitoring</p>
                <h2 className="mt-1 text-xl font-bold">Ledger transaction</h2>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{selected._id}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Close transaction details"><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Amount</p><p className="mt-1 text-2xl font-bold">₦{selected.amountNgn.toLocaleString("en-NG")}</p></div>
              <div className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Balance after</p><p className="mt-1 text-2xl font-bold">₦{selected.balanceAfterNgn.toLocaleString("en-NG")}</p></div>
            </div>
            <div className="mt-4 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={selected.type} /><Badge variant="outline">POSTED</Badge>{riskFlags.map((flag) => <Badge key={flag} variant="destructive">{flag}</Badge>)}</div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">User</dt><dd className="mt-1 break-all text-sm font-medium">{selectedUser?.email ?? selected.userId}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1 text-sm">{fmtDate(selected.createdAt)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Reference</dt><dd className="mt-1 break-all font-mono text-xs">{selected.referenceId ?? "None"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Idempotency key</dt><dd className="mt-1 break-all font-mono text-xs">{selected.idempotencyKey ?? "None"}</dd></div>
              </dl>
              <div className="mt-4 rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Description</p><p className="mt-1 text-sm">{selected.description}</p></div>
              {riskFlags.length > 0 && <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><div><p className="font-semibold">Risk review recommended</p><p className="mt-0.5 text-xs text-muted-foreground">This transaction matches one or more monitoring rules. Review the user, reference and ledger context before taking action.</p></div></div>}
            </div>
          </div>
        </div>
      )}

      {filtered && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <p className="text-sm text-slate-500">Page {page + 1} of {totalPages} · {filtered.length.toLocaleString()} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
