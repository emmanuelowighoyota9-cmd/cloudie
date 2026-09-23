import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Building2, Landmark, ShieldCheck, Globe, Settings2, DollarSign,
  Check, Paintbrush, AlertTriangle, Truck, Ticket, Briefcase, Wrench, ChevronDown,
  Sparkles, RefreshCw, Moon, Sun,
} from "lucide-react";
import { TemplateSurfaces } from "@/components/admin/BankingTemplatePreview";

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
type TenantKind = "bank" | "logistics" | "ticketing" | "business" | "services";

const TYPE_META: Record<TenantKind, { label: string; desc: string; icon: React.ComponentType<{ className?: string }> }>= {
  logistics: { label: "Logistics", desc: "Shipments, tracking, facilities", icon: Truck },
  ticketing: { label: "Ticketing", desc: "Documents & reservations", icon: Ticket },
  business: { label: "Business Suite", desc: "White-label tenant sites", icon: Briefcase },
  services: { label: "Services", desc: "Email campaigns, rendering", icon: Wrench },
  bank: { label: "Banking", desc: "Ledger, accounts, transfers, KYC", icon: Landmark },
};

type BankingTemplate = {
  _id: string;
  name: string;
  slug?: string;
  displayName?: string;
  currency: string;
  country?: string;
  timezone?: string;
  supportEmail?: string;
  supportPhone?: string;
  plan?: string;
  primaryColor?: string;
  accentColor?: string;
  themeMode?: string;
  surfaceColor?: string;
  radius?: string;
  tagline?: string;
  heroHeadline?: string;
  customerAppStyle?: string;
  adminConsoleStyle?: string;
  description?: string;
  features?: Record<string, boolean>;
};

const FEATURE_LABELS: Record<string, string> = {
  customerPortal: "Customer portal",
  accounts: "Accounts",
  transfers: "Transfers",
  deposits: "Deposits",
  withdrawals: "Withdrawals",
  kyc: "KYC",
  statements: "Statements",
  notifications: "Notifications",
  auditLogging: "Audit logging",
  realtime: "Realtime",
};

export default function AdminBankingCreateTenant() {
  const nav = useNavigate();
  const templates = useQuery(api.bankingTenant.listTemplates);
  const createBanking = useMutation(api.bankingTenant.createBankingTenant);
  const createAny = useMutation(api.bankingTenant.createAdminTenant);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<TenantKind>("bank");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Banking defaults (Crestline preset, configurable before provisioning)
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
    themeMode: "light" as string,
    surfaceColor: "#f8fafc",
    radius: "0.75rem",
    features: {
      customerPortal: true, accounts: true, transfers: true, deposits: true,
      withdrawals: true, kyc: true, statements: true, notifications: true,
      auditLogging: true, realtime: true,
    } as Record<string, boolean>,
  });

  // Non-banking quick fields
  const [simple, setSimple] = useState({
    tenantName: "", subdomain: "", slug: "", plan: "starter" as string,
    contactEmail: "", lifecycleStatus: "active" as string,
  });

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v } as any));
  const isBanking = kind === "bank";
  const catalog: BankingTemplate[] = (templates ?? []) as BankingTemplate[];
  const selectedTemplate = catalog.find((t) => (t.slug ?? "") === f.templateSlug) ?? null;

  /**
   * Apply a full template kit: identity, region/plan defaults, the design kit
   * (palette + theme mode + radius), and the feature set. Everything stays
   * editable afterwards — the template is a starting point, not a lock-in.
   */
  const applyTemplate = (tpl: BankingTemplate) => {
    const slug = tpl.slug ?? (tpl.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setF(prev => ({
      ...prev,
      templateSlug: tpl.slug ?? slug,
      bankName: tpl.displayName ?? tpl.name,
      displayName: tpl.displayName ?? tpl.name,
      slug,
      subdomain: slug,
      currency: tpl.currency ?? prev.currency,
      country: tpl.country ?? prev.country,
      timezone: tpl.timezone ?? prev.timezone,
      supportEmail: tpl.supportEmail ?? prev.supportEmail,
      supportPhone: tpl.supportPhone ?? prev.supportPhone,
      plan: (tpl.plan ?? prev.plan) as string,
      primaryColor: tpl.primaryColor ?? prev.primaryColor,
      accentColor: tpl.accentColor ?? prev.accentColor,
      themeMode: tpl.themeMode ?? prev.themeMode,
      surfaceColor: tpl.surfaceColor ?? prev.surfaceColor,
      radius: tpl.radius ?? prev.radius,
      features: tpl.features ? { ...prev.features, ...tpl.features } : prev.features,
    }));
    toast.success(`${tpl.name} kit applied — review the details below`);
  };

  const seedTemplates = useMutation(api.bankingTenant.seedModernBankingTemplates);
  const handleSeedTemplates = async () => {
    setBusy(true);
    try {
      const r = await seedTemplates({});
      toast.success(r.created > 0 ? `${r.created} modern template(s) loaded` : "Modern templates already loaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isBanking) {
        const r = await createBanking({
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
          themeMode: f.themeMode || undefined,
          surfaceColor: f.surfaceColor || undefined,
          radius: f.radius || undefined,
        });
        toast.success(`Banking tenant created: ${f.bankName} (${r.subdomain})`);
        nav(`/admin/tenants/${r.id}/banking`);
      } else {
        const name = simple.tenantName.trim();
        const sub = simple.subdomain.trim().toLowerCase();
        if (!name) { toast.error("Provide a tenant name"); return; }
        if (!sub) { toast.error("Provide a subdomain"); return; }
        const r: any = await createAny({
          siteType: kind,
          tenantName: name,
          slug: simple.slug || undefined,
          subdomain: sub,
          currency: "USD",
          contactEmail: simple.contactEmail || f.contactEmail,
          plan: simple.plan || undefined,
          lifecycleStatus: simple.lifecycleStatus || undefined,
        } as any);
        toast.success(`${TYPE_META[kind].label} tenant created: ${name} (${r.subdomain})`);
        nav(r?.suffix ? `/admin/tenants/${r.id}${r.suffix}` : "/admin/tenants");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"><Landmark className="h-6 w-6" /> New Tenant</h1>
        <p className="text-sm text-slate-500">Create and provision a tenant — select type first, then configure it. Banking (Crestline Capital) defaults to USD and is fully configurable before provisioning.</p>
      </div>

      {!templates ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 animate-pulse text-sm text-slate-400">Loading templates…</div>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
        {/* Tenant type selector — required by spec */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="h-4 w-4" /> Tenant type</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(["logistics", "ticketing", "business", "services", "bank"] as TenantKind[]).map(k => {
              const meta = TYPE_META[k];
              const active = kind === k;
              const Icon = meta.icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-xl border p-3 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700"}`}
                >
                  <Icon className="h-4 w-4" />
                  <div className="text-sm font-semibold mt-1">{meta.label}</div>
                  <div className={`text-[11px] ${active ? "opacity-80" : "text-slate-500"}`}>{meta.desc}</div>
                </button>
              );
            })}
          </div>
          {isBanking && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2"><Check className="h-4 w-4" /> Banking enables ledger-backed balances, double-entry accounting, account lifecycle, fee snapshot, idempotency, and tenant isolation by construction.</div>}
        </div>

        {isBanking ? (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Sparkles className="h-4 w-4 text-sky-500" /> Banking app + admin console templates</div>
                <button
                  type="button"
                  onClick={handleSeedTemplates}
                  disabled={busy}
                  className="text-[11px] inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Load modern templates
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Each kit themes both surfaces this tenant gets — the customer banking app and its admin console — and sets region, plan,
                currency and feature defaults. Everything stays editable below.
              </p>

              {catalog.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No templates loaded yet — use “Load modern templates” to install the Aurora, Meridian, Northwind and Crestline kits.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalog.map((tpl) => {
                    const slug = tpl.slug ?? tpl.name;
                    const active = f.templateSlug === slug;
                    const isDark = tpl.themeMode === "dark";
                    const enabledCount = Object.values(tpl.features ?? {}).filter(Boolean).length;
                    return (
                      <button
                        key={tpl._id}
                        type="button"
                        onClick={() => applyTemplate(tpl)}
                        className={`group rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? "border-slate-900 bg-slate-50 shadow-sm dark:border-white dark:bg-slate-800"
                            : "border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
                        }`}
                        aria-pressed={active}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{tpl.name}</span>
                              {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{tpl.tagline ?? tpl.description ?? "Modern banking kit"}</p>
                          </div>
                          <span
                            className="shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium dark:border-slate-600"
                            style={{ color: tpl.accentColor ?? undefined }}
                          >
                            {isDark ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                            {isDark ? "Dark" : "Light"}
                          </span>
                        </div>

                        <TemplateSurfaces kit={tpl} className="mt-3" />

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tpl.currency}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tpl.plan ?? "starter"}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{enabledCount}/10 features</span>
                          {tpl.radius && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">radius {tpl.radius}</span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          {[tpl.primaryColor, tpl.accentColor, tpl.surfaceColor].filter(Boolean).map((c, i) => (
                            <span key={i} className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c as string }} />
                          ))}
                          <span className="text-[10px] text-slate-400">palette</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Selected template" required>
                  <select value={f.templateSlug} onChange={e => setF(p => ({ ...p, templateSlug: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                    {catalog.map((t: BankingTemplate) => <option key={t._id} value={t.slug ?? t.name}>{t.name}</option>)}
                    {!catalog.length && <option value="crestline-capital">Crestline Capital</option>}
                  </select>
                </Field>
                <Field label="Tenant Status" required>
                  <select value={f.lifecycleStatus} onChange={e => set("lifecycleStatus", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                    {STATUS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>

              {selectedTemplate && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-semibold"><Paintbrush className="h-3.5 w-3.5" /> {selectedTemplate.name} kit</div>
                  <p><span className="font-medium">Customer app:</span> {selectedTemplate.customerAppStyle ?? "Template palette + surfaces"}</p>
                  <p><span className="font-medium">Admin console:</span> {selectedTemplate.adminConsoleStyle ?? "Template palette + console shell"}</p>
                  <p className="opacity-80">
                    {selectedTemplate.themeMode === "dark" ? "Dark" : "Light"} mode · {selectedTemplate.currency} · radius {selectedTemplate.radius ?? "0.75rem"}
                    {selectedTemplate.country ? ` · ${selectedTemplate.country}` : ""}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Building2 className="h-4 w-4 text-slate-400" /> Naming & public domain</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bank / tenant name" required><input required value={f.bankName} onChange={e => set("bankName", e.target.value)} placeholder="Crestline Capital" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Display name" hint="Customer-facing brand. Defaults to bank name."><input value={f.displayName} onChange={e => set("displayName", e.target.value)} placeholder="Crestline Capital" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Tenant slug" hint="Lowercase, hyphens only. Unique within banking type."><input value={f.slug} onChange={e => set("slug", e.target.value.toLowerCase())} placeholder="crestline-capital" pattern="[a-z0-9-]+" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Public subdomain" required hint="e.g. crestline-capitalfive.g0ki.com — validated server-side; duplicates rejected."><div className="flex items-stretch gap-2"><input required value={f.subdomain} onChange={e => set("subdomain", e.target.value.toLowerCase())} placeholder="crestline-capitalfive" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /><span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono dark:bg-slate-800">.g0ki.com</span></div></Field>
              </div>
            </div>

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
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"><ShieldCheck className="h-4 w-4" /> Banking features are enabled via template — configurable per tenant before or after provisioning (see banking/settings).</div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Globe className="h-4 w-4 text-sky-600" /> Contacts & support</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Contact email" required><input required type="email" value={f.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="admin@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Contact phone"><input value={f.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="+1 (…)" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Support email"><input value={f.supportEmail} onChange={e => set("supportEmail", e.target.value)} placeholder="support@… " className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Support phone"><input value={f.supportPhone} onChange={e => set("supportPhone", e.target.value)} placeholder="+1 (800) …" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Settings2 className="h-4 w-4 text-slate-400" /> Branding & design kit</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Primary color"><input value={f.primaryColor} onChange={e => set("primaryColor", e.target.value)} placeholder="#0f172a" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Accent color"><input value={f.accentColor} onChange={e => set("accentColor", e.target.value)} placeholder="#0ea5e9" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
                <Field label="Theme mode" hint="Applies to the customer banking app and the tenant admin console.">
                  <select value={f.themeMode} onChange={e => set("themeMode", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Field>
                <Field label="Surface color" hint="Page background behind panels and cards. Inherited from the template when left as-is.">
                  <div className="flex items-stretch gap-2">
                    <input value={f.surfaceColor} onChange={e => set("surfaceColor", e.target.value)} placeholder="#f8fafc" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    <input type="color" aria-label="Surface color swatch" value={/^#[0-9a-fA-F]{6}$/.test(f.surfaceColor) ? f.surfaceColor : "#f8fafc"} onChange={e => set("surfaceColor", e.target.value)} className="h-[42px] w-12 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </Field>
                <Field label="Corner radius" hint="Softness of cards, inputs and buttons across both surfaces.">
                  <select value={f.radius} onChange={e => set("radius", e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                    {["0.25rem", "0.5rem", "0.75rem", "1rem", "1.25rem"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Live preview</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <TemplateSurfaces kit={f} />
                </div>
              </div>
            </div>

            <div>
              <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-xs text-slate-500 inline-flex items-center gap-1 underline">
                Advanced — banking feature toggles <ChevronDown className={`h-3 w-3 transition ${showAdvanced ? "rotate-180" : ""}`} />
              </button>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(f.features).map(([k, val]) => (
                    <label key={k} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:bg-slate-800 dark:border-slate-700">
                      <input type="checkbox" checked={!!val} onChange={e => setF(p => ({ ...p, features: { ...p.features, [k]: e.target.checked } }))} />
                      {FEATURE_LABELS[k] ?? k}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{TYPE_META[kind].label} tenant</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Tenant name" required><input required value={simple.tenantName} onChange={e => setSimple(p => ({ ...p, tenantName: e.target.value }))} placeholder={TYPE_META[kind].label + " tenant"} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
              <Field label="Slug"><input value={simple.slug} onChange={e => setSimple(p => ({ ...p, slug: e.target.value.toLowerCase() }))} placeholder="e.g. my-tenant" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
              <Field label="Subdomain" required hint={".g0ki.com"}><div className="flex gap-2"><input required value={simple.subdomain} onChange={e => setSimple(p => ({ ...p, subdomain: e.target.value.toLowerCase() }))} placeholder="my-tenant" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /><span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono dark:bg-slate-800">.g0ki.com</span></div></Field>
              <Field label="Contact email" required><input type="email" required value={simple.contactEmail} onChange={e => setSimple(p => ({ ...p, contactEmail: e.target.value }))} placeholder="admin@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700" /></Field>
              <Field label="Plan"><select value={simple.plan} onChange={e => setSimple(p => ({ ...p, plan: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">{PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
              <Field label="Status"><select value={simple.lifecycleStatus} onChange={e => setSimple(p => ({ ...p, lifecycleStatus: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:bg-slate-800 dark:border-slate-700">{STATUS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Duplicate slugs, subdomains, account numbers, and references are rejected server-side.</div>
          <button disabled={busy} type="submit" className="rounded-xl bg-slate-900 text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50 shadow-sm hover:bg-slate-800">
            {busy ? "Creating…" : isBanking ? "Create banking tenant" : `Create ${TYPE_META[kind].label} tenant`}
          </button>
        </div>
      </form>
    </div>
  );
}
