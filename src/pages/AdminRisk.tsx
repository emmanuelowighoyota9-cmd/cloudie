import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Search, ShieldAlert, UserRound, X } from "lucide-react";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const severityTone: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  high: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300",
  medium: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export default function AdminRisk() {
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const cases = useQuery(api.adminApi.getRiskCases, {
    status: status === "all" ? undefined : status,
    severity: severity === "all" ? undefined : severity,
    limit: 100,
  });
  const live = useQuery(api.adminApi.getFinancialRisk, { hours: 24, limit: 50 });
  const admins = useQuery(api.admin.listAdministrators, { limit: 100 });
  const ledger = useQuery(api.wallet.getAdminLedger, { limit: 1000 });

  const openCase = useMutation(api.adminApi.openRiskCase);
  const assignCase = useMutation(api.adminApi.assignRiskCase);
  const addNote = useMutation(api.adminApi.addRiskCaseNote);
  const transition = useMutation(api.adminApi.transitionRiskCase);

  const selected = cases?.find((c) => String(c._id) === selectedId);
  const userTransactions = useMemo(
    () => selected && ledger ? ledger.filter((l) => String(l.userId) === String(selected.userId)).slice(0, 30) : [],
    [selected, ledger],
  );

  const filteredCases = useMemo(() => {
    if (!cases) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) =>
      (c.user?.email ?? "").toLowerCase().includes(q) ||
      (c.user?.name ?? "").toLowerCase().includes(q) ||
      c.reasons.some((r) => r.toLowerCase().includes(q)),
    );
  }, [cases, search]);

  const counts = useMemo(() => ({
    critical: cases?.filter((c) => c.severity === "critical" && c.status !== "resolved" && c.status !== "dismissed").length ?? 0,
    high: cases?.filter((c) => c.severity === "high" && c.status !== "resolved" && c.status !== "dismissed").length ?? 0,
    reviewing: cases?.filter((c) => c.status === "reviewing").length ?? 0,
    open: cases?.filter((c) => c.status === "open").length ?? 0,
  }), [cases]);

  const createFromAlert = async (alert: NonNullable<typeof live>["alerts"][number]) => {
    try {
      const result = await openCase({ userId: alert.userId as never, score: alert.score, severity: alert.severity, reasons: alert.reasons, transactionCount: alert.transactionCount, debitTotal: alert.debitTotal, largestDebit: alert.largestDebit });
      toast.success(result.existing ? "Existing risk case opened" : "Risk case created");
      if (!result.existing) setSelectedId(String(result.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open case");
    }
  };

  const changeStatus = async (next: string) => {
    if (!selected) return;
    const reason = window.prompt(`Reason for changing case to ${next}:`);
    if (!reason?.trim()) return;
    try {
      await transition({ caseId: selected._id, status: next, reason });
      toast.success("Risk case updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const saveNote = async () => {
    if (!selected || !note.trim()) return;
    try {
      await addNote({ caseId: selected._id, body: note.trim() });
      setNote("");
      toast.success("Case note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add note");
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Risk Operations Center"
        description="Investigate elevated wallet activity, assign cases, document findings, and close reviewed cases."
        actions={<Button variant="outline" onClick={() => window.location.reload()} className="gap-2"><ShieldAlert className="h-4 w-4" /> Refresh</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Critical", counts.critical, "critical"],
          ["High", counts.high, "high"],
          ["Reviewing", counts.reviewing, "reviewing"],
          ["Open", counts.open, "open"],
        ].map(([label, value, key]) => (
          <button key={String(key)} onClick={() => key === "reviewing" || key === "open" ? setStatus(String(key)) : setSeverity(String(key))} className="rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </button>
        ))}
      </div>

      <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user, email, or risk reason…" />
          </div>
          <Select value={severity} onValueChange={setSeverity}><SelectTrigger className="lg:w-44"><SelectValue placeholder="Severity" /></SelectTrigger><SelectContent><SelectItem value="all">All severity</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="lg:w-44"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="reviewing">Reviewing</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="dismissed">Dismissed</SelectItem></SelectContent></Select>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">Live risk queue</h2><p className="text-xs text-muted-foreground">24-hour deterministic wallet monitoring</p></div>
          <Badge variant="outline">{live?.alerts.length ?? 0} alerts</Badge>
        </div>
        {!live ? <AdminSkeleton rows={3} /> : live.alerts.length === 0 ? <AdminEmpty message="No elevated wallet risk detected in the current 24-hour window." /> : (
          <div className="mt-4 space-y-3">
            {live.alerts.map((alert) => (
              <div key={alert.userId} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><Badge className={severityTone[alert.severity]}>{alert.severity.toUpperCase()}</Badge><span className="text-sm font-bold">Risk score {alert.score}/100</span><span className="text-xs text-muted-foreground">{alert.transactionCount} transactions</span></div>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{alert.userId}</p>
                    <p className="mt-1 text-sm">Debit volume <b>{naira(alert.debitTotal)}</b> · largest <b>{naira(alert.largestDebit)}</b></p>
                    <p className="mt-1 text-xs text-muted-foreground">{alert.reasons.join(" · ")}</p>
                  </div>
                  <Button onClick={() => createFromAlert(alert)} className="shrink-0">Open case</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Persistent case queue</h2><p className="text-xs text-muted-foreground">Audited investigation records</p></div><Badge variant="outline">{filteredCases?.length ?? 0} cases</Badge></div>
        {!filteredCases ? <AdminSkeleton rows={5} /> : filteredCases.length === 0 ? <AdminEmpty message="No risk cases match the current filters." /> : (
          <div className="mt-4 grid gap-3">
            {filteredCases.map((c) => (
              <button key={c._id} onClick={() => setSelectedId(String(c._id))} className="rounded-2xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/30">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className={severityTone[c.severity] ?? ""}>{c.severity.toUpperCase()}</Badge><Badge variant="outline">{c.status}</Badge><span className="text-xs text-muted-foreground">Score {c.score}</span></div><p className="mt-2 truncate text-sm font-semibold">{c.user?.email ?? c.userId}</p><p className="mt-1 text-xs text-muted-foreground">{c.reasons[0] ?? "Risk review"} · updated {fmtDate(c.updatedAt)}</p></div>
                  <div className="text-right text-xs"><p className="font-semibold">{naira(c.debitTotal)}</p><p className="text-muted-foreground">debit volume</p></div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-5" role="dialog" aria-modal="true">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Risk case</p><h2 className="mt-1 text-xl font-bold">{selected.user?.email ?? selected.userId}</h2><p className="text-xs text-muted-foreground">{selected._id}</p></div><Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></Button></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">{[["Score", String(selected.score)],["Debit volume",naira(selected.debitTotal)],["Largest debit",naira(selected.largestDebit)],["Transactions",String(selected.transactionCount)]].map(([a,b])=><div key={a} className="rounded-2xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{a}</p><p className="mt-1 text-lg font-bold">{b}</p></div>)}</div>
            <div className="mt-4 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h3 className="font-semibold">Reasons</h3></div><ul className="mt-3 space-y-2 text-sm">{selected.reasons.map((r) => <li key={r} className="rounded-xl bg-muted/40 p-2.5">{r}</li>)}</ul></div>
                <div className="rounded-2xl border p-4"><h3 className="font-semibold">Recent wallet activity</h3><div className="mt-3 space-y-2">{userTransactions.length === 0 ? <p className="text-sm text-muted-foreground">No matching ledger activity loaded.</p> : userTransactions.map((t) => <div key={t._id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 p-3 text-xs"><span className="min-w-0 truncate">{t.description}</span><span className={t.amountNgn < 0 ? "font-bold text-red-600" : "font-bold text-green-600"}>{t.amountNgn < 0 ? "" : "+"}{naira(t.amountNgn)}</span></div>)}</div></div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border p-4"><h3 className="font-semibold">Case controls</h3><div className="mt-3 flex flex-wrap gap-2">{selected.status === "open" && <Button onClick={() => changeStatus("reviewing")}><Clock3 className="mr-2 h-4 w-4" /> Start review</Button>}{selected.status === "reviewing" && <><Button onClick={() => changeStatus("resolved")}><CheckCircle2 className="mr-2 h-4 w-4" /> Resolve</Button><Button variant="outline" onClick={() => changeStatus("dismissed")}>Dismiss</Button></>}{(selected.status === "resolved" || selected.status === "dismissed") && <Button variant="outline" onClick={() => changeStatus("reviewing")}>Reopen for review</Button>}</div><div className="mt-4"><label className="text-xs font-semibold">Assign investigator</label><Select value={selected.assignedTo ? String(selected.assignedTo) : "unassigned"} onValueChange={async (v) => { try { await assignCase({ caseId: selected._id, adminUserId: v === "unassigned" ? undefined : v as never }); toast.success("Case assignment updated"); } catch (e) { toast.error(e instanceof Error ? e.message : "Assignment failed"); } }}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{(admins ?? []).map((a) => <SelectItem key={a._id} value={String(a._id)}>{a.email ?? a.name ?? String(a._id)}</SelectItem>)}</SelectContent></Select></div></div>
                <div className="rounded-2xl border p-4"><h3 className="font-semibold">Case notes</h3><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Document findings, verification steps, or disposition…" className="mt-3 min-h-24 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /><Button className="mt-2 w-full" onClick={saveNote} disabled={!note.trim()}>Add note</Button><div className="mt-4 space-y-2">{(selected.notes ?? []).slice().reverse().map((n) => <div key={String(n.createdAt)+n.body} className="rounded-xl bg-muted/40 p-3"><p className="text-sm">{n.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{n.authorEmail ?? "Admin"} · {fmtDate(n.createdAt)}</p></div>)}</div></div>
                <div className="rounded-2xl border p-4 text-xs text-muted-foreground"><div className="flex items-center gap-2"><UserRound className="h-4 w-4" /><span>{selected.user?.name ?? "Customer"}</span></div><p className="mt-2">Account status: {selected.user?.isTerminated ? "terminated" : selected.user?.isSuspended ? "suspended" : "active"}</p><p className="mt-1">Opened {fmtDate(selected.createdAt)} · updated {fmtDate(selected.updatedAt)}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
