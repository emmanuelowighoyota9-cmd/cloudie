import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";

export default function AdminMaintenance() {
  const current = useQuery(api.adminApi.getMaintenanceMode, {});
  const save = useMutation(api.adminApi.setMaintenanceMode);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = enabled ?? Boolean(current?.enabled);
  const currentTitle = title || current?.title || "Cloudie is under maintenance";
  const currentMessage = message || current?.message || "We’re making improvements. Please check back shortly.";

  async function submit() {
    setBusy(true);
    try {
      await save({ enabled: active, title: currentTitle, message: currentMessage, readOnly, scheduledStartAt: undefined, scheduledEndAt: undefined });
      toast.success(active ? "Maintenance mode enabled" : "Maintenance mode disabled");
      setTitle(""); setMessage(""); setEnabled(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update maintenance mode");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Platform Control</p><h1 className="mt-2 text-2xl font-bold">Maintenance Mode</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Temporarily take the customer platform offline while keeping privileged administration available.</p></div>
          <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${active ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{active ? "MAINTENANCE ACTIVE" : "PLATFORM ONLINE"}</div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
          <label className="flex items-center justify-between rounded-2xl border border-border p-4"><span><span className="block font-semibold">Enable maintenance mode</span><span className="text-xs text-muted-foreground">Customer routes can be guarded with this global state.</span></span><input type="checkbox" checked={active} onChange={e => setEnabled(e.target.checked)} className="h-5 w-5" /></label>
          <label className="block"><span className="text-sm font-semibold">Maintenance title</span><input value={currentTitle} onChange={e=>setTitle(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-primary" /></label>
          <label className="block"><span className="text-sm font-semibold">Customer message</span><textarea value={currentMessage} onChange={e=>setMessage(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-primary" /></label>
          <label className="flex items-center justify-between rounded-2xl border border-border p-4"><span><span className="block font-semibold">Read-only mode</span><span className="text-xs text-muted-foreground">Use this when customers may browse but financial actions should be paused.</span></span><input type="checkbox" checked={readOnly} onChange={e=>setReadOnly(e.target.checked)} className="h-5 w-5" /></label>
          <button disabled={busy} onClick={submit} className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save platform state"}</button>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3"><Wrench className="h-5 w-5 text-primary" /></div><div><h2 className="font-bold">Emergency control</h2><p className="text-xs text-muted-foreground">Master administrators retain access.</p></div></div><div className="mt-6 rounded-2xl bg-muted/60 p-4 text-sm"><ShieldCheck className="mb-2 h-5 w-5 text-primary" />Every maintenance change is written to the admin audit trail.</div></div>
      </div>
    </div>
  );
}
