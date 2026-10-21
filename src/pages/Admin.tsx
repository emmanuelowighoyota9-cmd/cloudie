import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader, AdminSkeleton } from "@/components/admin/shared";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Clock3, Coins, ShieldAlert, Users, Workflow } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: number; minted: number; burned: number };

function Sparkline({ values, tone = "red" }: { values: number[]; tone?: "red" | "green" | "amber" }) {
  if (values.length < 2) return <span className="text-[10px] text-muted-foreground">Trend unavailable</span>;
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${26 - (v / max) * 22}`).join(" ");
  const stroke = tone === "green" ? "#16a34a" : tone === "amber" ? "#d97706" : "#dc2626";
  return <svg viewBox="0 0 100 28" className="h-7 w-24" role="img" aria-label="Seven-day trend"><polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function MetricCard({ title, value, note, icon: Icon, tone, trend }: {
  title: string; value: string; note: string; icon: typeof Coins; tone: "red" | "green" | "amber"; trend?: number[];
}) {
  const color = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-red-600";
  return <Card className="rounded-lg shadow-none"><CardContent className="p-3.5">
    <div className="flex items-start justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p><Icon className={`size-4 ${color}`} /></div>
    <div className="mt-2 flex items-end justify-between gap-2"><p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>{trend && <Sparkline values={trend} tone={tone} />}</div>
    <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>
  </CardContent></Card>;
}

export default function Admin() {
  const data = useQuery(api.adminOverview.overview);
  if (data === undefined) return <div className="space-y-4"><AdminPageHeader title="Operations overview" description="Loading privileged platform telemetry…" /><AdminSkeleton rows={5} /></div>;
  if (data === null) return <Card><CardContent className="flex items-center gap-4 p-6"><ShieldAlert className="size-6 text-red-600" /><div><h2 className="font-semibold">Admin access required</h2><p className="text-sm text-muted-foreground">Use an active administrator account.</p></div><Link className="ml-auto" to="/dashboard"><Button variant="outline">Back to app</Button></Link></CardContent></Card>;

  const series: Point[] = data.series;
  const mintedTrend = series.map((row) => row.minted);
  const burnedTrend = series.map((row) => row.burned);
  const maxJobs = Math.max(1, data.jobs.pending, data.jobs.failed, data.jobs.dlq);
  const money = (n: number) => n.toLocaleString("en-NG");
  const dayLabel = (value: number) => new Date(value).toLocaleDateString(undefined, { weekday: "short" });

  return <div className="space-y-4">
    <AdminPageHeader title="Operations overview" description="Points movement, queue health, privileged actions, and platform alerts." actions={<Badge variant="outline" className="gap-1 border-red-500/30 text-red-600"><Activity className="size-3" /> Live query</Badge>} />

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Points minted · 24h" value={money(data.minted24h)} note="Positive ledger entries in the last 24 hours" icon={Coins} tone="green" trend={mintedTrend} />
      <MetricCard title="Points burned · 24h" value={money(data.burned24h)} note="Negative ledger entries in the last 24 hours" icon={Coins} tone="red" trend={burnedTrend} />
      <MetricCard title="WebSocket subscribers" value="—" note="Realtime connection telemetry is not instrumented" icon={Users} tone="amber" />
      <MetricCard title="Queued jobs" value={money(data.queuedJobs)} note="Pending email deliveries and unsettled deposits" icon={Workflow} tone="amber" />
    </section>

    <section className="grid gap-3 xl:grid-cols-2">
      <Card className="rounded-lg shadow-none">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4 pb-1"><div><CardTitle className="text-sm">Points velocity (7d)</CardTitle><p className="mt-1 text-[10px] text-muted-foreground">Daily minted vs burned points, based on the latest 2,000 ledger rows.</p></div><div className="flex gap-3 text-[10px]"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-emerald-600" />Minted</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-red-600" />Burned</span></div></CardHeader>
        <CardContent className="h-64 px-2 pb-3 pt-3">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} /><XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip labelFormatter={(value) => new Date(Number(value)).toLocaleDateString()} formatter={(value) => [money(Number(value)), "Points"]} /><Line type="monotone" dataKey="minted" name="Minted" stroke="#16a34a" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="burned" name="Burned" stroke="#dc2626" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-none">
        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Job health</CardTitle><p className="mt-1 text-[10px] text-muted-foreground">Bounded recent window across email deliveries and banking settlements.</p></CardHeader>
        <CardContent className="space-y-5 p-4 pt-2">
          {([{ label: "Pending", count: data.jobs.pending, color: "bg-amber-500" }, { label: "Failed", count: data.jobs.failed, color: "bg-red-600" }, { label: "Dead-letter queue", count: data.jobs.dlq, color: "bg-purple-600" }] as const).map((item) => <div key={item.label} className="space-y-1.5"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{item.label}</span><span className="font-mono font-semibold tabular-nums">{money(item.count)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.max(item.count > 0 ? 2 : 0, (item.count / maxJobs) * 100)}%` }} /></div></div>)}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground"><Clock3 className="size-4 shrink-0" /> Queue counts are based on recent records, not a full queue broker scan.</div>
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-3 xl:grid-cols-2">
      <Card className="rounded-lg shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2"><CardTitle className="text-sm">Recent admin actions</CardTitle><Link to="/admin/audit" className="text-xs text-red-600 hover:underline">Open audit <ArrowRight className="ml-1 inline size-3" /></Link></CardHeader>
        <CardContent className="p-0">
          {data.actions.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No recent privileged actions.</p> : <div className="divide-y divide-border">{data.actions.map((action) => <div key={action._id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{action.action}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{action.actor}{action.reason ? ` · ${action.reason}` : " · No reason recorded"}</p></div><span className="whitespace-nowrap text-[10px] text-muted-foreground">{relativeTime(action.at)}</span></div>)}</div>}
        </CardContent>
      </Card>
      <Card className="rounded-lg shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2"><CardTitle className="text-sm">Alerts</CardTitle><span className="text-[10px] text-muted-foreground">{data.alerts.length} signal(s)</span></CardHeader>
        <CardContent className="space-y-2 p-3">
          {data.alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className="flex items-start gap-2.5 rounded-md border border-border p-3"><span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${alert.level === "error" ? "bg-red-500/10 text-red-600" : alert.level === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>{alert.level === "info" ? <CheckCircle2 className="size-3.5" /> : alert.level === "warning" ? <CircleAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />}</span><div className="min-w-0"><p className="text-xs font-semibold">{alert.title}</p><p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{alert.detail}</p></div></div>)}
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <Link to="/admin/users" className="rounded-lg border border-border bg-card p-3 transition hover:border-red-500/40"><div className="flex items-center gap-2 text-xs font-semibold"><Users className="size-4 text-red-600" /> User administration</div><p className="mt-1 text-[11px] text-muted-foreground">{money(data.users)} users in the recent bounded scan</p></Link>
      <Link to="/admin/system-health" className="rounded-lg border border-border bg-card p-3 transition hover:border-red-500/40"><div className="flex items-center gap-2 text-xs font-semibold"><Activity className="size-4 text-red-600" /> System health</div><p className="mt-1 text-[11px] text-muted-foreground">Inspect infrastructure and provider health</p></Link>
      <Link to="/admin/audit" className="rounded-lg border border-border bg-card p-3 transition hover:border-red-500/40"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldAlert className="size-4 text-red-600" /> Audit trail</div><p className="mt-1 text-[11px] text-muted-foreground">Review privileged actions and recorded reasons</p></Link>
    </section>
  </div>;
}
