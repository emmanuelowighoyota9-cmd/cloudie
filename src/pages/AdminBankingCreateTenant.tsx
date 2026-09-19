import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Building2, Landmark, ShieldCheck, Globe, Settings2, DollarSign, Check, Paintbrush, AlertTriangle } from "lucide-react";

function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}{required && " *"} </div>
      {children}
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const PLAN_OPTIONS = ["free", "starter", "pro", "enterprise"] as const;
const STATUS_OPTIONS = ["draft", "active", "suspended", "disabled", "archived"] as const;
const CURRENCY_OPTIONS = ["USD", "GBP", "EUR", "NGN", "JPY", "CAD", "AUD"] as const;

export default function AdminBankingCreateTenant() {
  const nav = useNavigate();
  const templates = useQuery(api.bankingTenant.listTemplates);
  const create = useMutation(api.bankingTenant.createBankingTenant);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    templateSlug: "crestline-capital",
    bankName: "Crestline Capital",
    displayName: "Crestline Capital",
    slug: "crestline-capital",
    subdomain: "crestline-capitalfive",
    currency: "USD" as string,
    country: "United States",
    timezone: "America/New_York",
    contactEmail: "admin@crestline-capital.example.com",
    contactPhone: "",
    supportEmail: "support@crestline-capital.g0ki.com",
    supportPhone: "+1 (800) 000-0000",
    plan: "enterprise" as string,
    lifecycleStatus: "active" as string,
    primaryColor: "#0f172a",
    accentColor: "#0ea5e9",
    bankingFeatureTogglesNote: true,
  });

  // sync from selected template
  useEffect(() => {
    if (!templates) return;
    const tpl: any = templates.find((t: any) => (t.slug ?? "") === f.templateSlug);
    if (!tpl) return;
    setF(prev => ({
      ...prev,
      currency: tpl.currency ?? prev.currency,
      country: tpl.country ?? prev.country,
      timezone: tpl.timezone ?? prev.timezone,
      supportEmail: tpl.supportEmail ?? prev.supportEmail,
      supportPhone: tpl.supportPhone ?? prev.supportPhone,
      plan: (tpl.plan ?? prev.plan) as string,
      primaryColor: tpl.primaryColor ?? prev.primaryColor,
      accentColor: tpl.accentColor ?? prev.accentColor,
    }));
  }, [templates?.length, f.templateSlug]);

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v } as any));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await create({
        bankName: f.bankName,
        displayName: f.displayName || undefined,
        slug: f.slug || undefined,
        subdomain: f.subdomain,
        currency: f.currency,
        country: f.country || undefined,
        timezone: f.timezone || undefined,
        contactEmail: f.contactEmail,
        contactPhone: f.contactPhone || undefined,
        supportEmail: f.supportEmail || undefined,
        supportPhone: f.supportPhone || undefined,
        plan: f.plan || undefined,
        lifecycleStatus: f.lifecycleStatus || undefined,
        primaryColor: f.primaryColor || undefined,
        accentColor: f.accentColor || undefined,
        templateSlug: f.templateSlug || undefined,
      });
      toast.success(`Tenant created: ${f.bankName} (${r.subdomain})`);
      nav(`/admin/tenants/${r.id}/banking`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"><Landmark className="h-6 w-6" /> New Banking Tenant</h1>
        <p className="text-sm text-slate-500">Create and provision a new banking tenant such as Crestline Capital. Banking template is configurable before provisioning.</p>
      </div>

      {!templates ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 animate-pulse text-sm text-slate-400">Loading templates…</div>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
        {/* Template selector */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Paintbrush className="h-4 w-4 text-sky-500" /> Template & core</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Template" required>
              <select value={f.templateSlug} onChange={e => set(e.target.value as any, "templateSlug")} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                {(templates ?? []).map((t: any) => <option key={t._id} value={t.slug ?? t.name}>{t.name}</option>)}
                {!templates?.length && <option value="crestline-capital">Crestline Capital Banking Template</option>}
              </select>
            </Field>
            <Field label="Tenant Status" required>
              <select value={f.lifecycleStatus} onChange={e => set(e.target.value, "lifecycleStatus")} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                {STATUS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div className="text-xs text-slate-500"><Check className="inline h-3 w-3 text-emerald-500" /> Default template: Crestline Capital Banking Template — tenant isolation, ledger-backed balances, double-entry accounting enabled by construction.</div>
        </div>

        {/* Naming + domain */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Building2 className="h-4 w-4 text-slate-400" /> Naming & public domain</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Bank / tenant name" required><input required value={f.bankName} onChange={e => set("bankName", e.target.value)} placeholder="Crestline Capital" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Display name" hint="Customer-facing brand name. Defaults to bank name."><input value={f.displayName} onChange={e => set("displayName", e.target.value)} placeholder="Crestline Capital" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Tenant slug" hint="Lowercase, hyphens only. Unique within banking type."><input value={f.slug} onChange={e => set("slug", e.target.value.toLowerCase())} placeholder="crestline-capital" pattern="[a-z0-9-]+" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Public subdomain" required hint="e.g. crestline-capitalfive.g0ki.com — validated server-side; duplicates rejected."><div className="flex items-stretch gap-2"><input required value={f.subdomain} onChange={e => set("subdomain", e.target.value.toLowerCase())} placeholder="crestline-capitalfive" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /><span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono dark:bg-slate-800">.g0ki.com</span></div></Field>
          </div>
        </div>

        {/* Banking config */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><DollarSign className="h-4 w-4 text-emerald-600" /> Banking configuration</div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Default currency" required><select value={f.currency} onChange={e => set("currency", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700"><option value="">Select currency</option>{CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field label="Country / Region"><input value={f.country} onChange={e => set("country", e.target.value)} placeholder="United States" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Timezone"><input value={f.timezone} onChange={e => set("timezone", e.target.value)} placeholder="America/New_York" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Plan" required><select value={f.plan} onChange={e => set("plan", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">{PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            <div />
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"><ShieldCheck className="h-4 w-4" /> Banking features (customer portal, accounts, transfers, deposits, withdrawals, KYC, statements, notifications, audit, realtime) are enabled via template — configurable per tenant by adjusting template/tenant config.</div>
        </div>

        {/* Contacts */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Globe className="h-4 w-4 text-sky-600" /> Contacts & support</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Contact email" required><input required type="email" value={f.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="admin@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Contact phone"><input value={f.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="+1 (…)" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Support email"><input value={f.supportEmail} onChange={e => set("supportEmail", e.target.value)} placeholder="support@… " className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Support phone"><input value={f.supportPhone} onChange={e => set("supportPhone", e.target.value)} placeholder="+1 (800) …" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
          </div>
        </div>

        {/* Branding */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Settings2 className="h-4 w-4 text-slate-400" /> Branding</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Primary color"><input value={f.primaryColor} onChange={e => set("primaryColor", e.target.value)} placeholder="#0f172a" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
            <Field label="Accent color"><input value={f.accentColor} onChange={e => set("accentColor", e.target.value)} placeholder="#0ea5e9" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Duplicate slugs, subdomains, account numbers, and references are rejected server-side.</div>
          <button disabled={busy} type="submit" className="rounded-xl bg-slate-900 text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50 shadow-sm hover:bg-slate-800">
            {busy ? "Creating…" : "Create banking tenant"}
          </button>
        </div>
      </form>
    </div>
  );
}
