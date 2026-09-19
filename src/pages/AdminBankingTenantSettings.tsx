import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Globe, DollarSign, Landmark, ShieldCheck, Palette, Paintbrush, FileText, ArrowLeft } from "lucide-react";

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Icon className="h-4 w-4" /> {title}</div>
      {children}
    </div>
  );
}

export default function AdminBankingTenantSettings() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const id = tenantId as Id<"tenantSites">;
  const tenant = useQuery(api.bankingTenant.getTenantForAdmin, { tenantId: id });
  const fee = useQuery(api.bankingTenant.getBankingFeeConfig, { tenantId: id });
  const update = useMutation(api.bankingTenant.updateBankingTenant);
  const [busy, setBusy] = useState(false);

  const [general, setGeneral] = useState({ siteName: "", displayName: "", contactEmail: "", contactPhone: "", supportEmail: "", supportPhone: "", country: "", timezone: "", plan: "", currency: "" });
  const [branding, setBranding] = useState({ primaryColor: "", accentColor: "", logo: "" });
  const [fees, setFees] = useState({ transferFeeMinor: "", withdrawalFeeMinor: "", depositFeeMinor: "", perTransactionLimitMinor: "", dailyTransferLimitMinor: "", dailyWithdrawalLimitMinor: "", minTransactionMinor: "" });
  const [accountsInfo] = useState("Account numbers are generated securely per tenant. Double-entry posts are immutable; use lifecycle/status controls for holds. No frontend balance is authoritative.");

  useEffect(() => {
    if (!tenant) return;
    setGeneral({
      siteName: (tenant as any).siteName ?? "",
      displayName: (tenant as any).displayName ?? "",
      contactEmail: (tenant as any).contactEmail ?? "",
      contactPhone: (tenant as any).contactPhone ?? "",
      supportEmail: (tenant as any).supportEmail ?? "",
      supportPhone: (tenant as any).supportPhone ?? "",
      country: (tenant as any).country ?? "",
      timezone: (tenant as any).timezone ?? "",
      plan: (tenant as any).plan ?? "",
      currency: (tenant as any).currency ?? "USD",
    });
    const b = (tenant as any).branding ?? {};
    setBranding({ primaryColor: b.primaryColor ?? "", accentColor: b.accentColor ?? "", logo: b.logo ?? "" });
  }, [tenant]);

  useEffect(() => {
    if (!fee) return;
    setFees({
      transferFeeMinor: fee.transferFeeMinor != null ? String(fee.transferFeeMinor) : "",
      withdrawalFeeMinor: fee.withdrawalFeeMinor != null ? String(fee.withdrawalFeeMinor) : "",
      depositFeeMinor: (fee as any).depositFeeMinor != null ? String((fee as any).depositFeeMinor) : "",
      perTransactionLimitMinor: (fee as any).perTransactionLimitMinor != null ? String((fee as any).perTransactionLimitMinor) : "",
      dailyTransferLimitMinor: (fee as any).dailyTransferLimitMinor != null ? String((fee as any).dailyTransferLimitMinor) : "",
      dailyWithdrawalLimitMinor: (fee as any).dailyWithdrawalLimitMinor != null ? String((fee as any).dailyWithdrawalLimitMinor) : "",
      minTransactionMinor: (fee as any).minTransactionMinor != null ? String((fee as any).minTransactionMinor) : "",
    });
  }, [fee]);

  if (tenant === undefined) return <div className="p-8"><div className="animate-pulse text-slate-400">Loading…</div></div>;
  if (!tenant) return <div className="p-8 text-sm text-red-600">Tenant not found.</div>;

  const saveGeneral = async () => {
    setBusy(true);
    try {
      await update({ tenantId: id, siteName: general.siteName || undefined, displayName: general.displayName || undefined, contactEmail: general.contactEmail || undefined, contactPhone: general.contactPhone || undefined, supportEmail: general.supportEmail || undefined, supportPhone: general.supportPhone || undefined, country: general.country || undefined, timezone: general.timezone || undefined, plan: general.plan || undefined, currency: general.currency || undefined } as any);
      toast.success("General settings saved (audited)");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const saveBranding = async () => {
    setBusy(true);
    try {
      await update({ tenantId: id, branding: { logo: branding.logo || undefined, primaryColor: branding.primaryColor || undefined, accentColor: branding.accentColor || undefined } as any });
      toast.success("Branding saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const saveFees = async () => {
    setBusy(true);
    try {
      const pick = (s: string) => s.trim() === "" ? undefined : Number(s);
      await update({ tenantId: id, feeConfig: { transferFeeMinor: pick(fees.transferFeeMinor), withdrawalFeeMinor: pick(fees.withdrawalFeeMinor), depositFeeMinor: pick(fees.depositFeeMinor), perTransactionLimitMinor: pick(fees.perTransactionLimitMinor), dailyTransferLimitMinor: pick(fees.dailyTransferLimitMinor), dailyWithdrawalLimitMinor: pick(fees.dailyWithdrawalLimitMinor), minTransactionMinor: pick(fees.minTransactionMinor) } as any });
      toast.success("Fees & limits saved — snapshot stored per transaction; history remains explainable");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6" />
            <h1 className="text-xl font-bold tracking-tight">{(tenant as any).siteName} — Banking settings</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Route: <span className="font-mono text-xs">/admin/tenants/{String(id).slice(0, 8)}…/banking/settings</span> · Audited, tenant-scoped, Convex-owned.</p>
        </div>
        <Link to={`/admin/tenants/${id}/banking`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"><ArrowLeft className="h-4 w-4" /> Back to banking tenant</Link>
      </div>

      <Section title="1. General — bank name, currency, country, timezone, support" icon={Building2}>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-1.5 text-sm"><span className="font-medium">Bank name</span><input value={general.siteName} onChange={e => setGeneral({ ...general, siteName: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Display name</span><input value={general.displayName} onChange={e => setGeneral({ ...general, displayName: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Currency (ISO 413 code)</span><input value={general.currency} onChange={e => setGeneral({ ...general, currency: e.target.value.toUpperCase() })} placeholder="USD" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Country</span><input value={general.country} onChange={e => setGeneral({ ...general, country: e.target.value })} placeholder="United States" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Timezone</span><input value={general.timezone} onChange={e => setGeneral({ ...general, timezone: e.target.value })} placeholder="America/New_York" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Plan</span><select value={general.plan} onChange={e => setGeneral({ ...general, plan: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700"><option value="">(unchanged)</option>{["free","starter","pro","enterprise"].map(p=> <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Contact email</span><input type="email" value={general.contactEmail} onChange={e => setGeneral({ ...general, contactEmail: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Contact phone</span><input value={general.contactPhone} onChange={e => setGeneral({ ...general, contactPhone: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Support email</span><input value={general.supportEmail} onChange={e => setGeneral({ ...general, supportEmail: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Support phone</span><input value={general.supportPhone} onChange={e => setGeneral({ ...general, supportPhone: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
        </div>
        <button disabled={busy} onClick={saveGeneral} className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Save general</button>
      </Section>

      <Section title="2. Accounts — number config, types, status rules" icon={Globe}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{accountsInfo}</p>
        <div className="text-xs text-slate-400">Account types: checking / savings / credit. Status rules enforced server-side: pending/active/frozen/suspended/closed — frozen & closed block debits. Account numbers: 10-digit secure random with DB uniqueness check; routing numbers 9-digit.</div>
      </Section>

      <Section title="3. Transactions — transfer limits, withdrawal limits, deposit rules, fees" icon={DollarSign}>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-1.5 text-sm"><span className="font-medium">Transfer fee (minor)</span><input type="number" value={fees.transferFeeMinor} onChange={e => setFees({ ...fees, transferFeeMinor: e.target.value })} placeholder={fee ? String(fee.transferFeeMinor) : "0"} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Withdrawal fee (minor)</span><input type="number" value={fees.withdrawalFeeMinor} onChange={e => setFees({ ...fees, withdrawalFeeMinor: e.target.value })} placeholder={fee ? String(fee.withdrawalFeeMinor) : "0"} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Deposit fee (minor)</span><input type="number" value={fees.depositFeeMinor} onChange={e => setFees({ ...fees, depositFeeMinor: e.target.value })} placeholder={(fee as any)?.depositFeeMinor ?? ""} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Per-transaction limit (minor)</span><input type="number" value={fees.perTransactionLimitMinor} onChange={e => setFees({ ...fees, perTransactionLimitMinor: e.target.value })} placeholder={(fee as any)?.perTransactionLimitMinor ?? ""} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Daily transfer limit (minor)</span><input type="number" value={fees.dailyTransferLimitMinor} onChange={e => setFees({ ...fees, dailyTransferLimitMinor: e.target.value })} placeholder={(fee as any)?.dailyTransferLimitMinor ?? ""} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Daily withdrawal limit (minor)</span><input type="number" value={fees.dailyWithdrawalLimitMinor} onChange={e => setFees({ ...fees, dailyWithdrawalLimitMinor: e.target.value })} placeholder={(fee as any)?.dailyWithdrawalLimitMinor ?? ""} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Minimum transaction (minor)</span><input type="number" value={fees.minTransactionMinor} onChange={e => setFees({ ...fees, minTransactionMinor: e.target.value })} placeholder={(fee as any)?.minTransactionMinor ?? ""} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
        </div>
        <div className="text-xs text-slate-400">Fees snapshot is persisted per transfer/deposit/withdrawal; historical transactions stay explainable after changes. All changes are audited via bankingTenant:updateBankingTenant.</div>
        <button disabled={busy} onClick={saveFees} className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Save fees & limits</button>
      </Section>

      <Section title="4. Security — MFA/transaction verification, session & admin controls" icon={ShieldCheck}>
        <div className="text-sm text-slate-600 dark:text-slate-300">MFA/2FA is inherited from Cloudie auth (Convex Auth — OTP + password + device/session management). Transaction verification: every financial mutation re-resolves caller auth + tenant ownership + account ownership server-side; no balance from client input is trusted. Session: secure HTTP-only cookies, rate limiting, brute-force protection.</div>
        <div className="text-xs text-slate-400">Administrative controls: Super Admin role required for lifecycle/fee changes; all such ops write to auditLogs; IDOR prevented by ID-bound lookups.</div>
      </Section>

      <Section title="5. Compliance — KYC, customer approval, transaction review" icon={FileText}>
        <div className="text-sm text-slate-600 dark:text-slate-300">KYC states: submitted → under_review → approved/rejected/resubmission_required. Approval never auto-marked. Review: banks own adminOpenAccount/approve flows; Super Admin retains global KYC review via tenants:adminKycReview. Document uploads are stored via Convex storage with tenant-scoped authorization.</div>
      </Section>

      <Section title="6. Branding — logo, primary brand, login & customer portal" icon={Palette}>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="space-y-1.5 text-sm"><span className="font-medium">Primary color</span><input value={branding.primaryColor} onChange={e => setBranding({ ...branding, primaryColor: e.target.value })} placeholder="#0f172a" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Accent color</span><input value={branding.accentColor} onChange={e => setBranding({ ...branding, accentColor: e.target.value })} placeholder="#0ea5e9" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
          <label className="space-y-1.5 text-sm"><span className="font-medium">Logo URL</span><input value={branding.logo} onChange={e => setBranding({ ...branding, logo: e.target.value })} placeholder="https://…" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></label>
        </div>
        <button disabled={busy} onClick={saveBranding} className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"><Paintbrush className="inline h-4 w-4 mr-1" /> Save branding</button>
      </Section>
    </div>
  );
}
