import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Activity, Users, CreditCard, ArrowDownLeft, ArrowUpRight, Lock, Unlock, Pause, FileText, DollarSign, Landmark, AlertTriangle, Paintbrush } from "lucide-react";

function Money({ minor, currency = "USD" }: { minor: number; currency?: string }) {
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency + " ";
  return <>{sym}{(minor / 100).toFixed(2)}</>;
}

function fmtDate(ms?: number) { return ms ? new Date(ms).toLocaleString() : "—"; }

export default function AdminBankingTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const id = tenantId as Id<"tenantSites">;
  const tenant = useQuery(api.bankingTenant.getTenantForAdmin, { tenantId: id });
  const fee = useQuery(api.bankingTenant.getBankingFeeConfig, { tenantId: id });
  const [history, setHistory] = useState<any>(null);
  const hist = useQuery(api.bankingCustomer.adminTenantHistory, tenantId ? { tenantId: id, limit: 50 } : "skip") as any;
  const [tab, setTab] = useState<"overview" | "customers" | "transfers" | "settings">("overview");
  const [busy, setBusy] = useState(false);
  const setLifecycle = useMutation(api.bankingTenant.setTenantLifecycle);
  const update = useMutation(api.bankingTenant.updateBankingTenant);
  const [reason, setReason] = useState("");

  const [feeForm, setFeeForm] = useState({ transferFeeMinor: "", withdrawalFeeMinor: "", perTransactionLimitMinor: "", dailyTransferLimitMinor: "", dailyWithdrawalLimitMinor: "", minTransactionMinor: "" });

  if (tenant === undefined) return <div className="p-8"><div className="animate-pulse text-slate-400">Loading…</div></div>;
  if (!tenant) return <div className="p-8 text-sm text-red-600">Tenant not found.</div>;

  const lifecycle = (tenant as any).lifecycleStatus ?? (tenant.isActive ? "active" : "disabled");
  const currency = (tenant as any).currency ?? "USD";

  const transferList: any[] = hist?.transfers ?? [];
  const depositList: any[] = hist?.deposits ?? [];
  const withdrawList: any[] = hist?.withdrawals ?? [];

  const lifecycleBtn: Record<string, { label: string; next: string; hint: string; icon: any; variant: "primary" | "danger" | "muted" }> = {
    active: { label: "Active", next: "suspended", hint: "Suspend — prevent transactions; preserve history", icon: Pause, variant: "primary" },
    suspended: { label: "Suspended", next: "active", hint: "Restore — re-enable transactions on the preserved ledger", icon: Unlock, variant: "primary" },
    disabled: { label: "Disabled", next: "active", hint: "Re-enable the tenant", icon: Unlock, variant: "primary" },
    draft: { label: "Draft", next: "active", hint: "Activate tenant", icon: Unlock, variant: "primary" },
    archived: { label: "Archived", next: "active", hint: "Restore from archive", icon: Unlock, variant: "muted" },
  };
  const lc = lifecycleBtn[lifecycle] ?? lifecycleBtn.active;

  const doLifecycle = async () => {
    if (!reason.trim()) { toast.error("Provide a reason"); return; }
    setBusy(true);
    try {
      await setLifecycle({ tenantId: id, status: lc.next, reason: reason.trim() });
      toast.success(`${tenant.siteName}: ${lifecycle} → ${lc.next}`);
      setReason("");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const saveFees = async () => {
    setBusy(true);
    try {
      const pick = (s: string, fallback?: number) => s.trim() === "" ? undefined : Number(s);
      await update({
        tenantId: id,
        feeConfig: {
          transferFeeMinor: pick(feeForm.transferFeeMinor),
          withdrawalFeeMinor: pick(feeForm.withdrawalFeeMinor),
          perTransactionLimitMinor: pick(feeForm.perTransactionLimitMinor),
          dailyTransferLimitMinor: pick(feeForm.dailyTransferLimitMinor),
          dailyWithdrawalLimitMinor: pick(feeForm.dailyWithdrawalLimitMinor),
          minTransactionMinor: pick(feeForm.minTransactionMinor),
        } as any,
      });
      toast.success("Fees & limits saved (audited; snapshotted per transaction)");
      setFeeForm({ transferFeeMinor: "", withdrawalFeeMinor: "", perTransactionLimitMinor: "", dailyTransferLimitMinor: "", dailyWithdrawalLimitMinor: "", minTransactionMinor: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const NavItem = ({ v, label, icon: Icon }: any) => (
    <button onClick={() => setTab(v)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-slate-900" />
            <h1 className="text-xl font-bold tracking-tight">{tenant.siteName}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tenant.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {lifecycle} {currency && <span className="text-slate-400">· {currency}</span>}
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-1">{(tenant as any).displayName ?? tenant.siteName} · {(tenant as any).subdomain}.g0ki.com · {(tenant as any).country} {(tenant as any).plan ? `· ${ (tenant as any).plan}` : ""}</div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-2"><DollarSign className="h-3 w-3" /> Fee config snapshot is stored per transaction; historical transactions remain explainable after fee changes.</div>
        </div>
        <Link to="/admin/tenants/new" className="text-sm text-slate-500 hover:text-slate-900 underline">New banking tenant</Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        <NavItem v="overview" label="Overview" icon={Activity} />
        <NavItem v="customers" label="Customers & accounts" icon={Users} />
        <NavItem v="transfers" label="Transactions" icon={CreditCard} />
        <NavItem v="settings" label="Settings & fees" icon={Paintbrush} />
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Tenant health</div>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs text-slate-500">Status</div>
                <div className="font-semibold">{lifecycle} {tenant.isActive ? "✓ active" : "✗ locked"}</div>
                <div className="text-xs text-slate-500 mt-1">{(tenant as any).lifecycleStatus ? `lifecycleStatus=${lifecycle}` : null} · {(tenant as any).bankingEnabled ? "bankingEnabled" : null}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs text-slate-500">Recent transfers/deposits/withdrawals</div>
                <div className="font-mono text-sm mt-1">{transferList.length} / {depositList.length} / {withdrawList.length}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs text-slate-500">Fee config</div>
                <div className="text-xs mt-1">{fee ? `${fee.transferFeeMinor}c transfer · ${fee.withdrawalFeeMinor}c withdrawal · perTx ${(fee as any).perTransactionLimitMinor ?? "—"}` : "default (0)"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> Lifecycle controls</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">When disabled/suspended: transactions are blocked; ledger & audit history are preserved; existing data is never deleted. Restoration is safe. History remains browseable here.</div>
            <div className="flex flex-wrap gap-2 items-center">
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" className="flex-1 min-w-[180px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" />
              <button disabled={busy} onClick={doLifecycle} className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${lifecycle === "active" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"} disabled:opacity-50`}>
                <lc.icon className="h-4 w-4" /> {lifecycle === "active" ? "Suspend tenant" : lifecycle === "suspended" ? "Restore tenant" : `Set ${lc.next}`}
              </button>
            </div>
            <div className="text-xs text-slate-500">Next: {lc.next} — {lc.hint}</div>
          </div>
        </div>
      )}

      {tab === "customers" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Members (first 50)</div>
            <TenantMembers tenantId={id} />
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> KYC (last 50)</div>
            <TenantKyc tenantId={id} />
          </div>
        </div>
      )}

      {tab === "transfers" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Deposits · Transfers · Withdrawals (last 50)</div>
          {!hist ? <div className="text-sm text-slate-400 animate-pulse">Loading…</div> : <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Transfers</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {transferList.length === 0 ? <div className="py-6 text-center text-sm text-slate-400">No transfers yet</div> : transferList.map((t: any) => (
                  <div key={t._id} className="py-3 flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1">{t.reference}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${t.status === "completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : t.status === "failed" ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-100 text-slate-600"}`}>{t.status}</span>
                    <span className="flex-1"><Money minor={t.amountMinor} currency={t.currency} /> {t.feeMinor ? <span className="text-xs text-slate-400">+ fee <Money minor={t.feeMinor} currency={t.currency} /></span> : null}</span>
                    <span className="text-xs text-slate-500 hidden sm:block">{fmtDate(t.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold">Deposits</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {depositList.length === 0 ? <div className="py-6 text-center text-slate-400">—</div> : depositList.map((d: any) => (
                    <div key={d._id} className="py-2 font-mono text-xs flex items-center gap-2"><span>{d.reference}</span><span className={`rounded-full px-2 py-0.5 ${d.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100"}`}>{d.status}</span><span className="ml-auto"><Money minor={d.amountMinor} currency={d.currency} /></span></div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold">Withdrawals</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {withdrawList.length === 0 ? <div className="py-6 text-center text-slate-400">—</div> : withdrawList.map((w: any) => (
                    <div key={w._id} className="py-2 font-mono text-xs flex items-center gap-2"><span>{w.reference}</span><span className={`rounded-full px-2 py-0.5 ${w.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100"}`}>{w.status}</span><span className="ml-auto"><Money minor={w.amountMinor} currency={w.currency} />{w.feeMinor ? <> + <Money minor={w.feeMinor} currency={w.currency} /></> : null}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>}
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="text-sm font-semibold"><DollarSign className="h-4 w-4 inline" /> Fees, limits & branding</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="space-y-1.5 text-sm"><span className="font-medium">Transfer fee (cents/minor)</span><input type="number" value={feeForm.transferFeeMinor} onChange={e => setFeeForm({ ...feeForm, transferFeeMinor: e.target.value })} placeholder={fee ? String(fee.transferFeeMinor) : "0"} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
              <label className="space-y-1.5 text-sm"><span className="font-medium">Withdrawal fee (minor)</span><input type="number" value={feeForm.withdrawalFeeMinor} onChange={e => setFeeForm({ ...feeForm, withdrawalFeeMinor: e.target.value })} placeholder={fee ? String(fee.withdrawalFeeMinor) : "0"} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
              <label className="space-y-1.5 text-sm"><span className="font-medium">Per-transaction max (minor)</span><input type="number" value={feeForm.perTransactionLimitMinor} onChange={e => setFeeForm({ ...feeForm, perTransactionLimitMinor: e.target.value })} placeholder={(fee as any)?.perTransactionLimitMinor ?? ""} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
              <label className="space-y-1.5 text-sm"><span className="font-medium">Min transaction (minor)</span><input type="number" value={feeForm.minTransactionMinor} onChange={e => setFeeForm({ ...feeForm, minTransactionMinor: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
              <label className="space-y-1.5 text-sm"><span className="font-medium">Daily transfer limit (minor)</span><input type="number" value={feeForm.dailyTransferLimitMinor} onChange={e => setFeeForm({ ...feeForm, dailyTransferLimitMinor: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
              <label className="space-y-1.5 text-sm"><span className="font-medium">Daily withdrawal limit (minor)</span><input type="number" value={feeForm.dailyWithdrawalLimitMinor} onChange={e => setFeeForm({ ...feeForm, dailyWithdrawalLimitMinor: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
            </div>
            <button disabled={busy} onClick={saveFees} className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Save fees & limits (audited)</button>
            <div className="text-xs text-slate-400">Current: transfer {fee?.transferFeeMinor ?? 0}c · withdrawal {fee?.withdrawalFeeMinor ?? 0}c · perTx {(fee as any)?.perTransactionLimitMinor ?? "∅"} · dailyTx {(fee as any)?.dailyTransferLimitMinor ?? "∅"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function TenantMembers({ tenantId }: { tenantId: Id<"tenantSites"> }) {
  const members = useQuery(api.tenants.listTenantUsers, { tenantId });
  if (members === undefined) return <div className="text-sm text-slate-400 animate-pulse">Loading…</div>;
  if (!members?.length) return <div className="text-sm text-slate-400">No members yet.</div>;
  return <ul className="divide-y divide-slate-100 dark:divide-slate-800">
    {members.slice(0, 50).map((m: any) => (
      <li key={m._id} className="py-2 flex items-center gap-3 text-sm"><span className="font-medium">{m.name ?? m.email ?? m.userId.slice(0, 8)}</span><span className="text-slate-500">{m.email}</span><span className="ml-auto text-xs rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{m.role}</span></li>
    ))}
  </ul>;
}

function TenantKyc({ tenantId }: { tenantId: Id<"tenantSites"> }) {
  const rows = useQuery(api.tenants.listKyc, { tenantId });
  if (rows === undefined) return <div className="text-sm text-slate-400 animate-pulse">Loading…</div>;
  if (!rows?.length) return <div className="text-sm text-slate-400">No KYC submissions.</div>;
  return <ul className="divide-y divide-slate-100 dark:divide-slate-800">
    {rows.slice(0, 50).map((r: any) => (
      <li key={r._id} className="py-2 flex items-center gap-3 text-sm"><span className="font-medium">{r.fullName}</span><span className={`text-xs rounded-full px-2 py-0.5 ${r.status === "approved" ? "bg-emerald-50 text-emerald-700" : r.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{r.status}</span><span className="ml-auto text-xs text-slate-500">{fmtDate(r.createdAt)}</span></li>
    ))}
  </ul>;
}
