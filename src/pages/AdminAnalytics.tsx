import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { AdminPageHeader, AdminSkeleton } from "@/components/admin/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, BarChart3, Gauge, Radio, Timer, Workflow } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";

const RANGES = [{ key: "1h", label: "1h", days: 1 }, { key: "24h", label: "24h", days: 1 }, { key: "7d", label: "7d", days: 7 }, { key: "30d", label: "30d", days: 30 }] as const;
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
function Unavailable({ title, detail }: {title:string;detail:string}) { return <Card className="rounded-lg shadow-none"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Activity className="size-4 text-muted-foreground"/>{title}</CardTitle></CardHeader><CardContent><div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed p-4 text-center"><span className="font-mono text-2xl text-muted-foreground">—</span><p className="mt-2 text-xs font-medium">Telemetry unavailable</p><p className="mt-1 max-w-xs text-[11px] text-muted-foreground">{detail}</p></div></CardContent></Card> }
export default function AdminAnalytics() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("24h");
  const selected = RANGES.find(r=>r.key===range)!;
  const data = useQuery(api.adminApi.getAnalyticsRange, { days: selected.days });
  const buckets = data?.buckets ?? [];
  const points = buckets.map(b=>({...b, minted:Number(b.minted??0), burned:Number(b.burned??0)}));
  const maxPoint = Math.max(1,...points.map(p=>Math.max(p.minted,p.burned)));
  const velocity = points.map(p=>({label:p.label, minted:p.minted, burned:p.burned}));
  const workspaceSpend = [] as {workspace:string;spend:number}[];
  const rangeLabel = range === "1h" ? "Last hour" : range === "24h" ? "Last 24 hours" : range === "7d" ? "Last 7 days" : "Last 30 days";
  return <div className="space-y-4">
    <AdminPageHeader title="Platform analytics" description="Usage and reliability signals. Metrics are labeled when backend instrumentation is not yet available." actions={<div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Time range">{RANGES.map(r=><button key={r.key} onClick={()=>setRange(r.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${range===r.key?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{r.label}</button>)}</div>}/>
    {data===undefined?<AdminSkeleton rows={6}/>:<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-lg shadow-none"><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Points minted</span><BarChart3 className="size-4 text-emerald-600"/></div><p className="mt-2 font-mono text-2xl font-semibold">{fmt(data.totals.minted)}</p><p className="mt-1 text-[11px] text-muted-foreground">{rangeLabel} · ledger aggregate</p></CardContent></Card>
        <Card className="rounded-lg shadow-none"><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Points burned</span><BarChart3 className="size-4 text-destructive"/></div><p className="mt-2 font-mono text-2xl font-semibold">{fmt(data.totals.burned)}</p><p className="mt-1 text-[11px] text-muted-foreground">{rangeLabel} · ledger aggregate</p></CardContent></Card>
        <Card className="rounded-lg shadow-none"><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Active workspaces</span><Activity className="size-4 text-primary"/></div><p className="mt-2 font-mono text-2xl font-semibold">{fmt(data.totals.activeTenants)}</p><p className="mt-1 text-[11px] text-muted-foreground">Tenant-site activity proxy</p></CardContent></Card>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="rounded-lg shadow-none"><CardHeader className="pb-0"><CardTitle className="text-sm">Points velocity · points</CardTitle><p className="text-[11px] text-muted-foreground">Minted and burned totals by available time bucket. Hover for exact values.</p></CardHeader><CardContent className="h-72 p-3"><ResponsiveContainer width="100%" height="100%"><LineChart data={velocity} margin={{top:10,right:12,bottom:8,left:0}}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/><XAxis dataKey="label" tick={{fontSize:10,fill:"hsl(var(--muted-foreground))"}}/><YAxis unit=" pts" width={55} tick={{fontSize:10,fill:"hsl(var(--muted-foreground))"}} domain={[0,maxPoint]}/><Tooltip formatter={(v)=>[fmt(Number(v))+" points"]} contentStyle={{background:"hsl(var(--popover))",borderColor:"hsl(var(--border))",borderRadius:8,fontSize:12}}/><Line dataKey="minted" name="Minted" type="monotone" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false}/><Line dataKey="burned" name="Burned" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></CardContent></Card>
        {workspaceSpend.length ? <Card className="rounded-lg shadow-none"><CardHeader><CardTitle className="text-sm">Spend per workspace · NGN</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={workspaceSpend} layout="vertical" margin={{left:10,right:16}}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/><XAxis type="number" tickFormatter={fmt} unit=" ₦"/><YAxis type="category" dataKey="workspace" width={110}/><Tooltip formatter={(v)=>["₦"+fmt(Number(v)),"Spend"]}/><Bar dataKey="spend" fill="hsl(var(--chart-1))" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></CardContent></Card> : <Unavailable title="Spend per workspace" detail="Workspace-level spend aggregation is not exposed by the current analytics query; no estimates are shown."/>}
        <Unavailable title="WebSocket subscribers" detail="A live connection gauge requires server-side connection instrumentation; this app currently does not expose that signal."/>
        <Unavailable title="Queue depth" detail="No live queue-depth endpoint is available. The admin overview's bounded pending-record count is not a broker queue depth."/>
        <Unavailable title="p95 API latency · ms" detail="Request-duration histograms are not instrumented in the current backend, so p95 cannot be calculated accurately."/>
        <Unavailable title="Error rate · %" detail="A request-level error counter is not available. Delivery failure ratios are not equivalent to API error rate."/>
      </div>
      <p className="text-[11px] text-muted-foreground">Selected range: {rangeLabel}. The current backend analytics buckets are day-based, so the 1h and 24h views share the available one-day aggregation; finer-grained telemetry is not inferred.</p>
    </>}
  </div>;
}
