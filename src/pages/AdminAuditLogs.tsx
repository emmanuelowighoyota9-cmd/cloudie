import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, downloadCsv, fmtDate } from "@/components/admin/shared";

type AuditLog = {
  _id: string;
  actorEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  createdAt: number;
};

const PAGE_SIZE = 25;

const ACTION_FILTERS = [
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_TERMINATED",
  "POINTS_CREDITED",
  "POINTS_DEDUCTED",
  "VENDOR_APPROVED",
  "VENDOR_REJECTED",
  "VENDOR_SUSPENDED",
  "ORDER_REFUNDED",
  "ESCROW_RELEASED",
  "DISPUTE_UNDER_REVIEW",
  "DISPUTE_REJECTED",
  "TENANT_LOCKED",
  "TENANT_UNLOCKED",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "PRICING_CHANGED",
  "PRICING_CREATED",
  "SETTING_CHANGED",
  "NOTIFICATION_SENT",
] as const;

export default function AdminAuditLogs() {
  const logs = useQuery(api.admin.getAuditLogs, { limit: 1000 }) as AuditLog[] | undefined;

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!logs) return undefined;
    let list = [...logs];
    if (actionFilter !== "all") list = list.filter((l) => l.action === actionFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.action.toLowerCase().includes(s) ||
          l.resource.toLowerCase().includes(s) ||
          (l.resourceId ?? "").toLowerCase().includes(s) ||
          (l.reason ?? "").toLowerCase().includes(s) ||
          (l.actorEmail ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [logs, search, actionFilter]);

  const paged = filtered?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil((filtered?.length ?? 0) / PAGE_SIZE));

  const exportCsv = () => {
    if (!filtered?.length) return;
    downloadCsv(`cloudie-audit-${new Date().toISOString().split("T")[0]}.csv`, [
      ["Timestamp", "Actor", "Action", "Resource", "Resource ID", "Reason"],
      ...filtered.map((l) => [fmtDate(l.createdAt), l.actorEmail ?? "system", l.action, l.resource, l.resourceId ?? "", l.reason ?? ""]),
    ]);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit Logs"
        description="Append-only record of every privileged action. Records cannot be edited or deleted."
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
            placeholder="Search action, resource, actor, reason…"
            className="pl-9"
            aria-label="Search audit logs"
          />
        </div>
        <select
          aria-label="Filter by action"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
        >
          <option value="all">All actions</option>
          {ACTION_FILTERS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            {filtered === undefined ? "Loading…" : `${filtered.length.toLocaleString()} records`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered === undefined ? (
            <div className="p-4"><AdminSkeleton rows={8} /></div>
          ) : filtered.length === 0 ? (
            <div className="p-4"><AdminEmpty message="No audit records match your filters." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Resource</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {paged!.map((log) => (
                    <tr key={log._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtDate(log.createdAt)}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{log.actorEmail ?? "system"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] font-mono">{log.action}</Badge>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="truncate text-xs text-slate-600 dark:text-slate-400">{log.resource}</p>
                        {log.resourceId && <p className="truncate font-mono text-[10px] text-slate-400">{log.resourceId}</p>}
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate text-xs text-slate-600 dark:text-slate-400">{log.reason ?? "—"}</p>
                      </td>
                    </tr>
                  ))}
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
