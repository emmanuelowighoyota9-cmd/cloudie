import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState } from "react";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, downloadCsv, fmtDate } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Download, ShieldCheck } from "lucide-react";

type AuditLog = { _id: string; actorEmail?: string; action: string; resource: string; resourceId?: string; reason?: string; before?: unknown; after?: unknown; createdAt: number };
const json = (value: unknown) => value === undefined ? "—" : JSON.stringify(value, null, 2);
const csvCell = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ");

export default function AdminAuditLogs() {
  const logs = useQuery(api.admin.getAuditLogs, { limit: 1000 }) as AuditLog[] | undefined;
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("all");
  const [target, setTarget] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const actions = useMemo(() => [...new Set((logs ?? []).map(l => l.action))].sort(), [logs]);
  const targets = useMemo(() => [...new Set((logs ?? []).map(l => l.resource))].sort(), [logs]);
  const filtered = useMemo(() => (logs ?? []).filter(l =>
    (!actor.trim() || (l.actorEmail ?? "system").toLowerCase().includes(actor.trim().toLowerCase())) &&
    (action === "all" || l.action === action) && (target === "all" || l.resource === target) &&
    (!from || l.createdAt >= new Date(from + "T00:00:00").getTime()) &&
    (!to || l.createdAt <= new Date(to + "T23:59:59.999").getTime())
  ), [logs, actor, action, target, from, to]);
  const exportCsv = () => downloadCsv(`cloudie-audit-${new Date().toISOString().slice(0,10)}.csv`, [
    ["Timestamp","Actor","Action","Target type","Target","Reason","Before JSON","After JSON"],
    ...filtered.map(l => [new Date(l.createdAt).toISOString(), l.actorEmail ?? "system", l.action, l.resource, l.resourceId ?? "", l.reason ?? "", json(l.before), json(l.after)].map(csvCell))
  ]);
  return <div className="space-y-4">
    <AdminPageHeader title="Audit trail" description="Privileged actions with attributable actors, reasons, and before/after snapshots." actions={<Button variant="outline" onClick={exportCsv} disabled={!filtered.length} className="gap-2"><Download className="size-4"/>Export CSV</Button>} />
    <Card className="rounded-lg shadow-none"><CardContent className="flex flex-wrap items-end gap-3 p-3">
      <div className="min-w-44 flex-1 space-y-1"><label className="text-xs text-muted-foreground">Actor</label><Input value={actor} onChange={e=>setActor(e.target.value)} placeholder="Email or system"/></div>
      <div className="min-w-40 space-y-1"><label className="text-xs text-muted-foreground">Action</label><select value={action} onChange={e=>setAction(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="all">All actions</option>{actions.map(a=><option key={a}>{a}</option>)}</select></div>
      <div className="min-w-40 space-y-1"><label className="text-xs text-muted-foreground">Target type</label><select value={target} onChange={e=>setTarget(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="all">All target types</option>{targets.map(t=><option key={t}>{t}</option>)}</select></div>
      <div className="space-y-1"><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-36"/></div>
      <div className="space-y-1"><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-36"/></div>
      <p className="w-full text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline size-3.5 text-emerald-600"/>{logs === undefined ? "Loading audit records…" : `${filtered.length.toLocaleString()} matching records`}</p>
    </CardContent></Card>
    {logs === undefined ? <AdminSkeleton rows={6}/> : !filtered.length ? <AdminEmpty message="No audit records match these filters."/> :
    <Card className="overflow-hidden rounded-lg shadow-none"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs">
      <thead className="border-b bg-muted/40 text-muted-foreground"><tr>{["","Timestamp","Actor","Action","Target","Reason"].map(h=><th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>{filtered.map(l=><><tr key={l._id} className="border-b last:border-0 hover:bg-muted/20">
        <td className="px-3 py-3"><button aria-label={expanded===l._id?"Collapse details":"Expand details"} onClick={()=>setExpanded(expanded===l._id?null:l._id)} className="rounded p-1 hover:bg-muted">{expanded===l._id?<ChevronDown className="size-4"/>:<ChevronRight className="size-4"/>}</button></td>
        <td className="whitespace-nowrap px-3 py-3 font-mono">{new Date(l.createdAt).toLocaleString()}</td><td className="px-3 py-3">{l.actorEmail ?? "system"}</td>
        <td className="px-3 py-3"><span className="rounded border px-2 py-1 font-mono">{l.action}</span></td><td className="px-3 py-3"><div>{l.resource}</div><div className="mt-0.5 font-mono text-muted-foreground">{l.resourceId ?? "—"}</div></td><td className="max-w-xs px-3 py-3 text-muted-foreground">{l.reason ?? "—"}</td>
      </tr>{expanded===l._id&&<tr key={l._id+"-detail"} className="border-b bg-muted/20"><td colSpan={6} className="p-3"><div className="grid gap-3 md:grid-cols-2"><section><h3 className="mb-2 text-xs font-semibold">Before</h3><pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px]">{json(l.before)}</pre></section><section><h3 className="mb-2 text-xs font-semibold">After</h3><pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px]">{json(l.after)}</pre></section></div></td></tr>}</>)}</tbody>
    </table></div></Card>}
  </div>;
}
