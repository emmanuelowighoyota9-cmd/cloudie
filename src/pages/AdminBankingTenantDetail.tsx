import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Activity, Users, CreditCard, Lock, Unlock, Pause, FileText, DollarSign, Landmark, Paintbrush, Palette, Check, MonitorSmartphone, LayoutDashboard, Sun, Moon, ExternalLink, UserCog, BadgeCheck, ScrollText, CircleSlash, FlaskConical, Radio } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/shared";

function Money({ minor, currency = "USD" }: { minor: number; currency?: string }) {
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency + " ";
  return <>{sym}{(minor / 100).toFixed(2)}</>;
}

function fmtDate(ms?: number) { return ms ? new Date(ms).toLocaleString() : "—"; }

/**
 * Declared at module scope on purpose.
 *
 * This used to be defined inside the page component, which makes React see a
 * brand-new component type on every render — each keystroke or refetch tore
 * the five tab buttons down and rebuilt them (losing focus along the way).
 * Hoisted here, the type is stable and the props carry what the closure used
 * to capture.
 */
function TenantNavItem({ active, onClick, label, icon: Icon }: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

export default function AdminBankingTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const id = tenantId as Id<"tenantSites">;
  const tenant = useQuery(api.bankingTenant.getTenantForAdmin, { tenantId: id });
  const fee = useQuery(api.bankingTenant.getBankingFeeConfig, { tenantId: id });
  const [history, setHistory] = useState<any>(null);
  const hist = useQuery(api.bankingCustomer.adminTenantHistory, tenantId ? { tenantId: id, limit: 50 } : "skip") as any;
  const [tab, setTab] = useState<"overview" | "customers" | "transfers" | "team" | "approvals" | "audit" | "design" | "settings">("overview");
  const viewer = useQuery(api.bankingAdmin.myTenantPermissions, tenantId ? { tenantId: id } : "skip");
  const can = (p: string) => !!viewer?.permissions?.includes(p as never);
  const [busy, setBusy] = useState(false);
  const setLifecycle = useMutation(api.bankingTenant.setTenantLifecycle);
  const update = useMutation(api.bankingTenant.updateBankingTenant);
  const [reason, setReason] = useState("");

  // Design kits: each template themes both surfaces this tenant gets — the
  // customer banking app and its admin console — so a rebrand is one action.
  const templates = useQuery(api.bankingTenant.listTemplates);
  const applyTemplate = useMutation(api.bankingTenant.applyBankingTemplateToTenant);
  const [applyDefaults, setApplyDefaults] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

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

  const activeKit: string = (tenant as any)?.branding?.templateSlug ?? "";
  const doApplyTemplate = async (slug: string) => {
    setBusy(true);
    setPendingSlug(slug);
    try {
      const r = await applyTemplate({ tenantId: id, templateSlug: slug, applyOperatingDefaults: applyDefaults });
      toast.success(`${r.template.name} kit applied to ${tenant.siteName}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setPendingSlug(null); }
  };

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
        <div className="flex items-center gap-2">
          <Link to={`/admin/tenants/${id}/banking/settings`} className="text-xs rounded-full bg-slate-900 text-white px-3 py-1.5 font-semibold">Banking settings</Link>
          <Link to="/admin/tenants/new" className="text-sm text-slate-500 hover:text-slate-900 underline">New banking tenant</Link>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TenantNavItem active={tab === "overview"} onClick={() => setTab("overview")} label="Overview" icon={Activity} />
        <TenantNavItem active={tab === "customers"} onClick={() => setTab("customers")} label="Customers & accounts" icon={Users} />
        <TenantNavItem active={tab === "transfers"} onClick={() => setTab("transfers")} label="Transactions" icon={CreditCard} />
        {can("staff.manage") && (
          <TenantNavItem active={tab === "team"} onClick={() => setTab("team")} label="Team & permissions" icon={UserCog} />
        )}
        {can("ledger.view") && (
          <TenantNavItem active={tab === "approvals"} onClick={() => setTab("approvals")} label="Approvals" icon={BadgeCheck} />
        )}
        {can("audit.view") && (
          <TenantNavItem active={tab === "audit"} onClick={() => setTab("audit")} label="Audit log" icon={ScrollText} />
        )}
        <TenantNavItem active={tab === "design"} onClick={() => setTab("design")} label="Design kit" icon={Palette} />
        <TenantNavItem active={tab === "settings"} onClick={() => setTab("settings")} label="Settings & fees" icon={Paintbrush} />
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

          <TenantSubscription tenantId={id} />
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

      {tab === "team" && (
        <TenantTeam tenantId={id} />
      )}

      {tab === "approvals" && (
        <TenantApprovals tenantId={id} />
      )}

      {tab === "audit" && (
        <TenantAudit tenantId={id} />
      )}

      {tab === "design" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2"><Palette className="h-4 w-4 text-sky-500" /> Banking design kit</div>
                <p className="text-xs text-slate-500 mt-1">
                  A kit themes both surfaces this tenant gets — the customer banking app and its admin console — and can pull the template's
                  operating defaults (plan, region, support contacts). Applied changes are audited.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/site/${id}/banking`} className="inline-flex items-center gap-1 text-xs rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <MonitorSmartphone className="h-3.5 w-3.5" /> Preview customer app
                </Link>
                <Link to={`/site/${id}/admin`} className="inline-flex items-center gap-1 text-xs rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <LayoutDashboard className="h-3.5 w-3.5" /> Preview console
                </Link>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={applyDefaults} onChange={e => setApplyDefaults(e.target.checked)} />
              Also apply the template's operating defaults (plan, country, timezone, support email)
            </label>
          </div>

          {templates === undefined ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 animate-pulse text-sm text-slate-400">Loading kits…</div>
          ) : templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
              No kits loaded yet — install them from <Link to="/admin/tenants/new" className="underline">New banking tenant</Link>.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((tpl: any) => {
                const applied = activeKit === tpl.slug;
                const isDark = tpl.themeMode === "dark";
                return (
                  <div key={tpl._id}
                    className={`rounded-2xl border p-4 space-y-3 ${applied ? "border-slate-900 dark:border-white" : "border-slate-200 dark:border-slate-800"} bg-white dark:bg-slate-900`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{tpl.name}</span>
                          {applied && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold"><Check className="h-3 w-3" /> Applied</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{tpl.description}</p>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
                        {isDark ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}{isDark ? "Dark" : "Light"}
                      </span>
                    </div>

                    <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                        <p className="font-semibold uppercase tracking-wider text-slate-400 text-[10px]">Customer app</p>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{tpl.customerAppStyle}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
                        <p className="font-semibold uppercase tracking-wider text-slate-400 text-[10px]">Admin console</p>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{tpl.adminConsoleStyle}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {[tpl.primaryColor, tpl.accentColor, tpl.surfaceColor].filter(Boolean).map((c: string, i: number) => (
                        <span key={i} className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                      ))}
                      <span className="text-[10px] text-slate-400">{tpl.currency} · radius {tpl.radius}</span>
                      <button
                        disabled={busy || applied}
                        onClick={() => doApplyTemplate(tpl.slug)}
                        className="ml-auto rounded-xl bg-slate-900 text-white px-3.5 py-2 text-xs font-semibold disabled:opacity-40 dark:bg-white dark:text-slate-900"
                      >
                        {pendingSlug === tpl.slug ? "Applying…" : applied ? "Applied" : "Apply kit"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-xs text-slate-400 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Applying a kit never deletes tenant data — it restyles both surfaces and is recorded in the audit log.
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="text-sm font-semibold"><DollarSign className="h-4 w-4 inline" /> Fees, limits & branding</div>
            <SettlementMode tenantId={id} mode={((tenant as any).bankingMode === "live" ? "live" : "sandbox")} />
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

/**
 * Sandbox / live settlement mode.
 *
 * A sandbox tenant's ledger is real but no provider is contacted, so its
 * surfaces must say so. Live mode is only meaningful once a settlement
 * integration exists — the API refuses payouts it cannot settle.
 */
function SettlementMode({ tenantId, mode }: { tenantId: Id<"tenantSites">; mode: "sandbox" | "live" }) {
  const viewer = useQuery(api.bankingAdmin.myTenantPermissions, { tenantId });
  const setMode = useMutation(api.bankingAdmin.setBankingSettlementMode);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = viewer?.role === "owner";

  const change = async (next: "sandbox" | "live") => {
    if (reason.trim().length < 5) { toast.error("Provide a reason (5+ characters) — it is written to the audit log"); return; }
    setBusy(true);
    try {
      await setMode({ tenantId, mode: next, reason: reason.trim() });
      toast.success(next === "live" ? "Tenant switched to live settlement" : "Tenant switched to sandbox");
      setReason("");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {mode === "sandbox" ? <FlaskConical className="h-4 w-4 text-amber-600" /> : <Radio className="h-4 w-4 text-emerald-600" />}
        <span className="font-medium">Settlement mode</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${mode === "sandbox" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>{mode}</span>
        <span className="text-xs text-slate-500">{mode === "sandbox" ? "Simulated — no provider is contacted, every receipt is labelled sandbox." : "External payouts require a verified settlement integration."}</span>
      </div>
      {isOwner ? (
        <div className="flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className="flex-1 min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
          <button disabled={busy || mode === "sandbox"} onClick={() => void change("sandbox")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">Use sandbox</button>
          <button disabled={busy || mode === "live"} onClick={() => void change("live")} className="rounded-xl bg-slate-900 text-white px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:bg-white dark:text-slate-900">Require live settlement</button>
        </div>
      ) : (
        <div className="text-xs text-slate-400">Only the tenant owner or a Cloudie super admin can change settlement mode.</div>
      )}
    </div>
  );
}

/**
 * Staff roster with role-based permissions. Revoking a membership removes
 * console access only — accounts, ledger history and audit rows stay with the
 * tenant, because they are financial records, not the person's profile.
 */
function TenantTeam({ tenantId }: { tenantId: Id<"tenantSites"> }) {
  const roster = useQuery(api.bankingAdmin.listTenantStaff, { tenantId });
  const addStaff = useMutation(api.bankingAdmin.addTenantStaff);
  const setStaffRole = useMutation(api.bankingAdmin.setTenantStaffRole);
  const removeStaff = useMutation(api.bankingAdmin.removeTenantStaff);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ membershipId: Id<"tenantUsers">; label: string } | null>(null);

  const grant = async () => {
    if (!email.trim()) { toast.error("Enter the staff member's account email"); return; }
    setBusy(true);
    try {
      const r = await addStaff({ tenantId, email: email.trim(), role });
      toast.success(r.updated ? "Role updated" : "Staff access granted");
      setEmail("");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const changeRole = async (membershipId: Id<"tenantUsers">, next: string) => {
    try {
      await setStaffRole({ tenantId, membershipId, role: next });
      toast.success("Role updated — audit record written");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  if (roster === undefined) return <div className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-400 animate-pulse dark:border-slate-800">Loading roster…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2"><UserCog className="h-4 w-4 text-sky-600" /> Tenant staff</div>
          <p className="text-xs text-slate-500 mt-1">Least privilege by role. A role can only grant what the granter already holds, so nobody can hand out more access than they have.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@their-bank.com" className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
            {roster.assignableRoles.map((r: any) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button disabled={busy} onClick={() => void grant()} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:bg-white dark:text-slate-900">Grant access</button>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {roster.owner && (
            <li className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{roster.owner.name ?? roster.owner.email}</span>
              <span className="text-slate-500">{roster.owner.email}</span>
              <span className="ml-auto rounded-full bg-slate-900 text-white px-2.5 py-0.5 text-xs font-semibold">Tenant owner</span>
            </li>
          )}
          {roster.staff.length === 0 && <li className="py-4 text-sm text-slate-400">No staff yet — the owner is the only console user.</li>}
          {roster.staff.map((m: any) => (
            <li key={m.membershipId} className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{m.name ?? m.email ?? String(m.userId).slice(0, 8)}</span>
              <span className="text-slate-500">{m.email}</span>
              <select
                value={m.role}
                onChange={(e) => void changeRole(m.membershipId, e.target.value)}
                className="ml-auto rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
              >
                {roster.assignableRoles.filter((r: any) => r.value !== "customer").map((r: any) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => setRemoving({ membershipId: m.membershipId, label: m.email ?? "this staff member" })} className="text-xs text-red-600 underline">Revoke</button>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (!removing) return;
          try {
            await removeStaff({ tenantId, membershipId: removing.membershipId, reason });
            toast.success("Console access revoked — financial records preserved");
          } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
        }}
        title="Revoke console access"
        description="This removes the staff member's access to the banking console. Accounts, ledger entries, transactions and audit history are kept."
        resource={removing?.label}
        actionLabel="Revoke access"
      />
    </div>
  );
}

/**
 * Dual-approval queue for ledger corrections.
 *
 * There is no "set balance" control anywhere in the console. A correction is a
 * request plus a second officer's decision, and approval posts a balanced
 * journal group so the ledger still explains every unit.
 */
function TenantApprovals({ tenantId }: { tenantId: Id<"tenantSites"> }) {
  const viewer = useQuery(api.bankingAdmin.myTenantPermissions, { tenantId });
  const rows = useQuery(api.bankingAdmin.listLedgerAdjustments, { tenantId, limit: 50 });
  const accounts = useQuery(api.bankingAdmin.adminListBalances, { tenantId, limit: 100 });
  const request = useMutation(api.bankingAdmin.requestLedgerAdjustment);
  const decide = useMutation(api.bankingAdmin.decideLedgerAdjustment);
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Id<"bankingApprovals"> | null>(null);

  const canRequest = !!viewer?.permissions?.includes("ledger.adjust.request" as never);
  const canApprove = !!viewer?.permissions?.includes("ledger.adjust.approve" as never);
  const pending = (rows ?? []).filter((r: any) => r.status === "pending");

  const submit = async () => {
    const minor = Math.round(Number(amount) * 100);
    if (!accountId) { toast.error("Choose the account to correct"); return; }
    if (!Number.isFinite(minor) || minor <= 0) { toast.error("Enter a positive amount"); return; }
    if (reason.trim().length < 10) { toast.error("Explain the correction (10+ characters)"); return; }
    setBusy(true);
    try {
      const r = await request({ tenantId, accountId: accountId as Id<"tenantAccounts">, direction, amountMinor: minor, reason: reason.trim() });
      toast.success(`${r.reference} submitted — a second officer must approve it`);
      setAmount(""); setReason("");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const approve = async (approvalId: Id<"bankingApprovals">) => {
    setBusy(true);
    try {
      const r = await decide({ tenantId, approvalId, approve: true, reason: "Approved in the tenant console" });
      toast.success(`Correction approved — journal group ${r.ledgerGroupId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {canRequest && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-sky-600" /> Request a ledger correction</div>
          <p className="text-xs text-slate-500">Requests never touch a balance directly. A different officer with approval rights must decide, and both actions are audited.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium text-xs">Account</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                <option value="">Select an account…</option>
                {(accounts ?? []).map((a: any) => (
                  <option key={a._id} value={a._id}>{a.name} · {a.accountNumber} · {a.userEmail ?? "customer"}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm"><span className="font-medium text-xs">Direction</span>
              <select value={direction} onChange={(e) => setDirection(e.target.value === "debit" ? "debit" : "credit")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                <option value="credit">Credit (add funds)</option>
                <option value="debit">Debit (remove funds)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm"><span className="font-medium text-xs">Amount (major units)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="125.00" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium text-xs">Reason (recorded in the audit log)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reversal of duplicate settlement fee" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
            </label>
          </div>
          <button disabled={busy} onClick={() => void submit()} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:bg-white dark:text-slate-900">Submit for approval</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4" /> Correction queue</div>
        {rows === undefined ? (
          <div className="text-sm text-slate-400 animate-pulse">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400">No corrections requested.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r: any) => (
              <li key={r._id} className="py-3 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{r.reference}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 border ${r.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : r.status === "rejected" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{r.status}</span>
                  <span className="font-semibold">{r.direction === "credit" ? "+" : "−"}<Money minor={r.amountMinor} currency={r.currency} /></span>
                  <span className="text-slate-500">{r.accountName ?? "account"} · {r.accountNumber}</span>
                  <span className="ml-auto text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
                </div>
                <div className="text-xs text-slate-500">Requested by {r.requestedByEmail ?? "—"}: {r.reason}</div>
                {r.status === "pending" && canApprove && r.requestedBy !== viewer?.userId && (
                  <div className="flex gap-2 pt-1">
                    <button disabled={busy} onClick={() => void approve(r._id)} className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Approve</button>
                    <button disabled={busy} onClick={() => setRejecting(r._id)} className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs font-semibold">Reject</button>
                  </div>
                )}
                {r.status === "pending" && r.requestedBy === viewer?.userId && (
                  <div className="text-xs text-slate-400">Awaiting a second officer — you cannot approve your own request.</div>
                )}
                {r.status !== "pending" && r.decidedByEmail && (
                  <div className="text-xs text-slate-400">Decided by {r.decidedByEmail} {r.decisionReason ? `— ${r.decisionReason}` : ""}</div>
                )}
              </li>
            ))}
          </ul>
        )}
        {pending.length > 0 && <div className="text-xs text-slate-400">{pending.length} awaiting a decision.</div>}
      </div>

      <ConfirmDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          if (!rejecting) return;
          try {
            await decide({ tenantId, approvalId: rejecting, approve: false, reason });
            toast.success("Correction rejected");
          } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
        }}
        title="Reject correction"
        description="The requester and the audit log both record your decision and reason."
        actionLabel="Reject correction"
      />
    </div>
  );
}

function TenantSubscription({ tenantId }: { tenantId: Id<"tenantSites"> }) {
  const sub = useQuery(api.bankingTenant.getTenantSubscription, { tenantId });
  const renew = useMutation(api.bankingTenant.renewTenantSubscription);
  const [months, setMonths] = useState("12");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const doRenew = async () => {
    if (reason.trim().length < 5) { toast.error("Provide a reason for the renewal (audited)"); return; }
    setBusy(true);
    try {
      const r = await renew({ tenantId, months: Number(months), reason: reason.trim() });
      toast.success(`Subscription extended to ${new Date(r.renewalDate).toLocaleDateString()}`);
      setReason("");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-sky-600" /> Subscription</div>
      {sub === undefined ? <div className="text-sm text-slate-400 animate-pulse">Loading…</div> : (
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-xs text-slate-500">Plan</div>
            <div className="font-semibold capitalize">{sub.plan ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-xs text-slate-500">Renews</div>
            <div className="font-semibold">{sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString() : "—"}</div>
            <div className={`text-xs ${sub.expired ? "text-red-600" : "text-slate-500"}`}>
              {sub.expired ? "Expired — new operations refused" : sub.daysRemaining !== null ? `${sub.daysRemaining} days remaining` : ""}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-xs text-slate-500">Lifecycle</div>
            <div className="font-semibold capitalize">{sub.lifecycleStatus}</div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select value={months} onChange={(e) => setMonths(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
          {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Renewal reason (audited)" className="flex-1 min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
        <button disabled={busy} onClick={() => void doRenew()} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:bg-white dark:text-slate-900">Renew</button>
      </div>
      <div className="text-xs text-slate-400">Renewing extends from the later of today and the current renewal date. It never deletes history and never replays old transactions.</div>
    </div>
  );
}

function TenantAudit({ tenantId }: { tenantId: Id<"tenantSites"> }) {
  const logs = useQuery(api.bankingAdmin.adminAuditLog, { tenantId, limit: 100 });
  if (logs === undefined) return <div className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-400 animate-pulse dark:border-slate-800">Loading audit trail…</div>;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2"><ScrollText className="h-4 w-4" /> Tenant audit trail (latest 100)</div>
      {logs.length === 0 ? <div className="text-sm text-slate-400">No audit entries yet.</div> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map((l: any) => (
            <li key={l._id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-[11px] rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{l.action}</span>
              <span className="text-slate-500 text-xs">{l.resource}{l.resourceId ? ` · ${String(l.resourceId).slice(0, 10)}` : ""}</span>
              {l.reason && <span className="text-xs text-slate-400">{l.reason}</span>}
              <span className="ml-auto text-xs text-slate-400">{l.actorEmail ?? "system"} · {fmtDate(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
