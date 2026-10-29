import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { classifyTenantParam } from "@/lib/tenantParam";
import { bankTheme, bankTone, type BankTheme, type BankTone } from "@/lib/tenantBankTheme";
import {
  ShieldCheck, Landmark, CreditCard, ArrowLeftRight, ArrowDownLeft, ArrowUpRight,
  Wallet, Plus, Users, FileText, Bell, ChevronRight, Check, FlaskConical,
} from "lucide-react";

function Money({ minor, currency = "USD" }: { minor: number; currency?: string }) {
  try {
    return (
      <>
        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100)}
      </>
    );
  } catch {
    return <>{`${currency} ${(minor / 100).toFixed(2)}`}</>;
  }
}

function fmtDate(ms?: number) {
  return ms ? new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

type Tab = "overview" | "accounts" | "transfers" | "beneficiaries" | "statements";

// Declared at module scope (not inside the page) so React keeps the same element
// types across renders — otherwise every keystroke remounts the subtree and inputs lose focus.
function Shell({ theme, children }: { theme: BankTheme; children: React.ReactNode }) {
  return <div style={{ backgroundColor: theme.surface, color: theme.text, minHeight: "100vh" }}>{children}</div>;
}

function Panel({ theme, children, className = "" }: { theme: BankTheme; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ backgroundColor: theme.panel, border: `1px solid ${theme.border}`, borderRadius: theme.radius }}>
      {children}
    </div>
  );
}

function Pill({ theme, tone, children }: { theme: BankTheme; tone: BankTone; children: React.ReactNode }) {
  const t = bankTone(theme, tone);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ backgroundColor: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      {children}
    </span>
  );
}

export default function SiteBanking() {
  // Two entry routes resolve to the same portal:
  //   /site/:siteId/banking  → Convex tenant id
  //   /:tenant/banking       → tenant subdomain (resolved server-side against the authoritative mapping)
  const params = useParams<{ siteId?: string; tenant?: string }>();
  const rawParam = (params.siteId ?? params.tenant ?? "").trim();
  const paramKind = classifyTenantParam(rawParam);
  const isId = paramKind === "id";
  // A slug resolves against the authoritative server-side tenant/domain mapping —
  // never treated as a client-asserted tenant id.
  const bySubdomain = useQuery(
    api.tenantResolver.resolveBySubdomain,
    paramKind === "subdomain" ? { subdomain: rawParam } : "skip",
  );
  const id = (isId ? rawParam : bySubdomain?.tenantId) as Id<"tenantSites"> | undefined;
  const publicT = useQuery(api.bankingCustomer.publicTenant, id ? { tenantId: id } : "skip");
  const member = useQuery(api.bankingCustomer.memberTenant, id ? { tenantId: id } : "skip");
  const joinMutation = useMutation(api.bankingCustomer.joinTenant);
  const accounts = useQuery(api.bankingCustomer.memberAccounts, id ? { tenantId: id } : "skip");
  const history = useQuery(api.bankingCustomer.bankingHistory, id ? { tenantId: id, limit: 50 } : "skip");
  const bens = useQuery(api.bankingCustomer.listBeneficiaries, id ? { tenantId: id } : "skip");
  const onboard = useQuery(api.bankingCustomer.onboardingMe, id ? { tenantId: id } : "skip");
  // Tenant owners (and Cloudie super admins) get a link into the console that
  // matches what the server will actually let them read: owners land on the
  // tenant console, super admins on the oversight view.
  const viewer = useQuery(api.bankingAdmin.myTenantPermissions, id ? { tenantId: id } : "skip");
  const consolePath = viewer?.isSuperAdmin ? `/admin/tenants/${id}/banking` : viewer?.role === "owner" ? `/site/${id}/admin` : null;
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);

  // onboarding
  const [kName, setKName] = useState(""); const [kDob, setKDob] = useState("");
  const submitKycAny = useMutation(api.tenants.submitKyc as any);

  // open account
  const [accountForm, setAccountForm] = useState({ name: "", accountType: "checking" as string, currency: "" });
  const openAccount = useMutation(api.bankingCustomer.openAccount);

  // deposit
  const [dep, setDep] = useState({ accountId: "", amount: "", method: "bank_transfer" });
  const createDeposit = useMutation(api.bankingCustomer.createDeposit);

  // withdrawal
  const [wth, setWth] = useState({ accountId: "", amount: "", destination: "" });
  const createWithdrawal = useMutation(api.bankingCustomer.createWithdrawal);

  // transfer
  const [tx, setTx] = useState({ sourceAccountId: "", destType: "internal_account" as const, destAccountId: "" as string, beneficiaryId: "" as string, amount: "" });
  const createTransfer = useMutation(api.bankingCustomer.createTransfer);

  // beneficiary
  const [benForm, setBenForm] = useState({ nickname: "", accountNumber: "", holderName: "", isExternal: false });
  const addBen = useMutation(api.bankingCustomer.addBeneficiary);
  const rmBen = useMutation(api.bankingCustomer.removeBeneficiary);

  // statement
  const [stmtAcc, setStmtAcc] = useState("");
  const stmt = useQuery(api.bankingCustomer.statement as any, stmtAcc && id ? { tenantId: id, accountId: stmtAcc as Id<"tenantAccounts"> } : "skip") as any;

  // Design kit applied from the banking template chosen at tenancy creation.
  // Palette, radius, surfaces and the template's own copy drive the whole customer app.
  const theme = bankTheme(publicT?.branding);
  const { primary, accent, surface, panel, border, text, muted, radius, inputBg, divider } = theme;
  const cur = (publicT as any)?.currency ?? "USD";
  // Action colours that keep white label text legible on both light and dark kits.
  const okColor = "#059669";
  const dangerColor = "#DC2626";

  const fieldStyle = {
    backgroundColor: inputBg,
    border: `1px solid ${border}`,
    color: text,
    borderRadius: radius,
  } as const;

  if (paramKind === "subdomain" && bySubdomain === undefined) {
    return <Shell theme={theme}><div className="p-10 animate-pulse text-sm" style={{ color: muted }}>Loading…</div></Shell>;
  }
  if (!id) {
    return (
      <Shell theme={theme}>
        <div className="mx-auto max-w-3xl p-10">
          <div className="p-6 text-sm" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <div className="font-semibold">404 — Banking tenant not found</div>
            <Link to="/business" className="underline" style={{ color: accent }}>Back to Business Suite</Link>
          </div>
        </div>
      </Shell>
    );
  }
  if (publicT === undefined || member === undefined) {
    return <Shell theme={theme}><div className="p-10 animate-pulse text-sm" style={{ color: muted }}>Loading…</div></Shell>;
  }
  if (!publicT) {
    return (
      <Shell theme={theme}>
        <div className="mx-auto max-w-3xl p-10">
          <div className="p-6 text-sm" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <div className="font-semibold">404 — Banking tenant not found</div>
            <Link to="/business" className="underline" style={{ color: accent }}>Back to Business Suite</Link>
          </div>
        </div>
      </Shell>
    );
  }

  const lifecycle = (publicT as any).status ?? "active";
  const bankingUp = lifecycle === "active";
  const brandName = (publicT as any).displayName ?? publicT.siteName;
  // Sandbox tenants keep a real double-entry ledger but contact no provider, so
  // every movement is labelled rather than presented as settled funds.
  const bankingMode: "sandbox" | "live" = (publicT as any).bankingMode === "live" ? "live" : "sandbox";

  // ── Join screen (not yet a member of this tenant) ──
  if (!member) {
    return (
      <Shell theme={theme}>
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="p-8 text-center" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: accent }}>
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">{brandName}</h1>
            <p className="mt-1 text-sm" style={{ color: muted }}>
              {theme.tagline ?? "Secure digital banking for the modern world."}
            </p>
            <p className="mt-4 text-xs" style={{ color: muted }}>
              This portal is tenant-scoped. Sign in and join {brandName} to continue.
            </p>
            <div className="mt-6 space-y-2">
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await joinMutation({ tenantId: id });
                    toast.success(`Joined ${brandName}`);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (msg.includes("TENANT_UNAVAILABLE")) toast.error("This tenant is unavailable (paused/disabled).");
                    else toast.error(msg);
                  } finally { setBusy(false); }
                }}
                disabled={busy || !bankingUp}
                className="w-full py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: primary, borderRadius: radius }}
              >
                Join as customer
              </button>
              <Link
                to={`/auth?returnTo=/site/${id}/banking`}
                className="block w-full py-3 text-sm font-semibold"
                style={{ border: `1px solid ${border}`, borderRadius: radius, color: text }}
              >
                Sign in
              </Link>
              <Link to={`/business/sites/${id}`} className="block pt-2 text-xs" style={{ color: muted }}>
                View in Business Suite
              </Link>
            </div>
          </div>
          {!bankingUp && (
            <div className="mt-3 px-4 py-3 text-xs" style={{ ...bankTone(theme, "warning"), borderWidth: 1, borderStyle: "solid", borderRadius: radius }}>
              This tenant is {lifecycle} — joining and transactions are temporarily disabled. Historical records remain preserved.
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ── Member workspace ──
  const acctOpts = (accounts ?? []) as any[];
  const transfers: any[] = history?.transfers ?? [];
  const deposits: any[] = history?.deposits ?? [];
  const withdrawals: any[] = history?.withdrawals ?? [];

  const kycList = onboard?.kyc ?? [];
  const latestKyc = kycList[0];
  const pendingKyc = !latestKyc || latestKyc.status === "submitted" || latestKyc.status === "under_review";
  const kycTone: BankTone = !latestKyc ? "neutral" : latestKyc.status === "approved" ? "success" : latestKyc.status === "rejected" ? "danger" : "warning";

  const totalMinor = acctOpts.reduce((s: number, a: any) => s + (a.balanceMinor ?? 0), 0);
  const activeAccounts = acctOpts.filter((a: any) => a.status === "active");
  const day = Date.now() - 24 * 3600 * 1000;
  const last24 = transfers.filter((t: any) => t.createdAt > day).length;
  const pending = deposits.filter((d: any) => d.status === "pending" || d.status === "processing").length;

  const doKyc = async () => {
    if (!kName.trim()) { toast.error("Provide full name"); return; }
    setBusy(true);
    try { await submitKycAny({ tenantId: id, fullName: kName.trim(), dateOfBirth: kDob || undefined }); toast.success("KYC submitted"); setKName(""); setKDob(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doOpen = async () => {
    if (!accountForm.name.trim()) return;
    setBusy(true);
    try { await openAccount({ tenantId: id, name: accountForm.name.trim(), accountType: accountForm.accountType as any, currency: accountForm.currency || undefined }); toast.success("Account opened"); setAccountForm({ name: "", accountType: "checking", currency: "" }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doDep = async () => {
    const minor = Math.round(Number(dep.amount) * 100);
    setBusy(true);
    try { await createDeposit({ tenantId: id, accountId: dep.accountId ? dep.accountId as Id<"tenantAccounts"> : undefined, amountMinor: minor, currency: cur, method: dep.method }); toast.success("Deposit created — pending"); setDep({ accountId: "", amount: "", method: "bank_transfer" }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doWth = async () => {
    const minor = Math.round(Number(wth.amount) * 100);
    setBusy(true);
    try { await createWithdrawal({ tenantId: id, accountId: wth.accountId as Id<"tenantAccounts">, amountMinor: minor, destination: wth.destination || undefined }); toast.success(bankingMode === "sandbox" ? "Withdrawal recorded (sandbox — simulated)" : "Withdrawal completed"); setWth({ accountId: "", amount: "", destination: "" }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doTx = async () => {
    const minor = Math.round(Number(tx.amount) * 100);
    setBusy(true);
    try {
      await createTransfer({ tenantId: id, sourceAccountId: tx.sourceAccountId as Id<"tenantAccounts">, destType: tx.destType as any, destAccountId: tx.destAccountId ? tx.destAccountId as Id<"tenantAccounts"> : undefined, beneficiaryId: tx.beneficiaryId ? tx.beneficiaryId as any : undefined, amountMinor: minor, idempotencyKey: `bankportal-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
      toast.success("Transfer completed");
      setTx({ sourceAccountId: "", destType: "internal_account", destAccountId: "", beneficiaryId: "", amount: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doBen = async () => {
    setBusy(true);
    try { await addBen({ tenantId: id, nickname: benForm.nickname.trim(), accountNumber: benForm.accountNumber.trim(), accountHolderName: benForm.holderName || undefined, isExternal: !!benForm.isExternal }); toast.success("Beneficiary added"); setBenForm({ nickname: "", accountNumber: "", holderName: "", isExternal: false }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const TABS: { k: Tab; label: string; Icon: typeof Wallet }[] = [
    { k: "overview", label: "Overview", Icon: Wallet },
    { k: "accounts", label: "Accounts", Icon: CreditCard },
    { k: "transfers", label: "Move money", Icon: ArrowLeftRight },
    { k: "beneficiaries", label: "Payees", Icon: Users },
    { k: "statements", label: "Statements", Icon: FileText },
  ];

  const secTitle = "text-[11px] font-semibold uppercase tracking-wider";

  const statusTone = (s: string): BankTone =>
    s === "completed" || s === "approved" || s === "active" ? "success"
      : s === "pending" || s === "processing" || s === "submitted" || s === "under_review" ? "warning"
        : s === "failed" || s === "rejected" ? "danger" : "neutral";

  return (
    <Shell theme={theme}>
      {/* ── App bar ── */}
      <header style={{ backgroundColor: primary }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: accent }}>
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-white">{brandName}</p>
                <p className="truncate text-[11px] text-white/55">
                  {theme.tagline ?? "Digital banking"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 sm:inline">
                {cur}
              </span>
              <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium capitalize text-white/80 md:inline">
                {lifecycle}
              </span>
              <span
                className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize sm:inline ${bankingMode === "live" ? "bg-emerald-400/20 text-emerald-100" : "bg-amber-300/20 text-amber-100"}`}
                title={bankingMode === "live" ? "Settlements require a verified provider" : "Simulated ledger — no real funds move"}
              >
                {bankingMode}
              </span>
              {consolePath && (
                <Link to={consolePath} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/25">
                  Console
                </Link>
              )}
              <Link to={`/site/${id}/dashboard`} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/25">
                Classic view
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── Balance hero (the only gradient surface in the app) ── */}
      <div style={{ backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` }}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Total balance</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {accounts === undefined ? "—" : <Money minor={totalMinor} currency={cur} />}
              </p>
              <p className="mt-1 text-xs text-white/60">
                {activeAccounts.length} active account{activeAccounts.length === 1 ? "" : "s"} · ledger-backed
              </p>
              {bankingMode === "sandbox" && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                  <FlaskConical className="h-3 w-3" /> Sandbox — deposits, transfers and withdrawals are simulated
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Deposit", Icon: ArrowDownLeft, t: "transfers" as Tab },
                { label: "Send", Icon: ArrowLeftRight, t: "transfers" as Tab },
                { label: "Withdraw", Icon: ArrowUpRight, t: "transfers" as Tab },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => setTab(a.t)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                >
                  <a.Icon className="h-4 w-4" /> {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!bankingUp && (
          <div className="mb-5 flex items-center gap-2 px-4 py-3 text-sm"
            style={{ ...bankTone(theme, "warning"), borderWidth: 1, borderStyle: "solid", borderRadius: radius }}>
            This tenant is {lifecycle} — transactions and onboarding are temporarily disabled. Historical records and the ledger are preserved.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* ── Rail (desktop) / scroller (mobile) ── */}
          <nav className="lg:sticky lg:top-6 lg:self-start">
            <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
              {TABS.map(({ k, label, Icon }) => {
                const active = tab === k;
                return (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className="inline-flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors lg:w-full"
                    style={{
                      borderRadius: radius,
                      backgroundColor: active ? theme.accentSoft : "transparent",
                      color: active ? accent : muted,
                      border: `1px solid ${active ? theme.accentSoft : "transparent"}`,
                    }}
                  >
                    <Icon className="h-4 w-4" /> {label}
                    {active && <ChevronRight className="ml-auto hidden h-3.5 w-3.5 lg:block" />}
                  </button>
                );
              })}
            </div>

            {/* KYC state lives in the rail so it is always visible */}
            <div className="mt-3 hidden p-3 lg:block" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
              <p className={secTitle} style={{ color: muted }}>Verification</p>
              <div className="mt-2">
                <Pill theme={theme} tone={kycTone}>{pendingKyc ? (latestKyc ? latestKyc.status.replace(/_/g, " ") : "not started") : latestKyc?.status}</Pill>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: muted }}>
                {latestKyc?.status === "approved" ? "Full limits unlocked." : "Submit KYC to unlock higher limits."}
              </p>
            </div>
          </nav>

          {/* ── Panel area ── */}
          <div className="min-w-0 space-y-5">
            {tab === "overview" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { label: "Accounts", value: String(acctOpts.length), sub: `${activeAccounts.length} active` },
                    { label: "Transfers (24h)", value: String(last24), sub: `${transfers.length} lifetime` },
                    { label: "Pending deposits", value: String(pending), sub: "awaiting reconciliation" },
                  ].map((k) => (
                    <Panel theme={theme} key={k.label} className="p-5">
                      <p className={secTitle} style={{ color: muted }}>{k.label}</p>
                      <p className="mt-1.5 text-2xl font-bold tracking-tight">{k.value}</p>
                      <p className="text-[11px]" style={{ color: muted }}>{k.sub}</p>
                    </Panel>
                  ))}
                </div>

                <Panel theme={theme}>
                  <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${divider}` }}>
                    <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" style={{ color: accent }} /> Onboarding & KYC</p>
                    <Pill theme={theme} tone={kycTone}>{latestKyc ? latestKyc.status.replace(/_/g, " ") : "not started"}</Pill>
                  </div>
                  <div className="space-y-3 p-5">
                    {latestKyc && (
                      <p className="text-xs" style={{ color: muted }}>
                        Latest submission: {latestKyc.fullName} · {fmtDate(latestKyc.createdAt)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <input value={kName} onChange={(e) => setKName(e.target.value)} placeholder="Full legal name"
                        className="flex-1 px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                      <input type="date" value={kDob} onChange={(e) => setKDob(e.target.value)}
                        className="px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                      <button disabled={busy || !kName.trim() || !bankingUp} onClick={doKyc}
                        className="px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: primary, borderRadius: radius }}>
                        Submit KYC
                      </button>
                    </div>
                  </div>
                </Panel>

                <Panel theme={theme}>
                  <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${divider}` }}>
                    <p className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" style={{ color: accent }} /> Recent transfers</p>
                    <button onClick={() => setTab("transfers")} className="text-xs font-medium" style={{ color: accent }}>Move money →</button>
                  </div>
                  {transfers.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: muted }}>No transfers yet — deposit first, then send.</div>
                  ) : (
                    <div>
                      {transfers.slice(0, 8).map((t: any) => (
                        <div key={t._id} className="flex items-center gap-3 px-5 py-3.5 text-sm" style={{ borderTop: `1px solid ${divider}` }}>
                          <span className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px]" style={{ backgroundColor: theme.subtle, color: muted }}>{t.reference}</span>
                          <Pill theme={theme} tone={statusTone(t.status)}>{t.status}</Pill>
                          <span className="ml-auto font-semibold"><Money minor={t.amountMinor} currency={t.currency} /></span>
                          <span className="hidden text-[11px] sm:block" style={{ color: muted }}>{fmtDate(t.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </>
            )}

            {tab === "accounts" && (
              <>
                <Panel theme={theme} className="space-y-3 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" style={{ color: accent }} /> Open an account</p>
                  <div className="flex flex-wrap gap-2">
                    <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                      placeholder="Account name (e.g. Everyday Checking)" className="min-w-[200px] flex-1 px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <select value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}
                      className="px-3.5 py-2.5 text-sm capitalize outline-none" style={fieldStyle}>
                      <option value="checking">checking</option>
                      <option value="savings">savings</option>
                      <option value="credit">credit</option>
                    </select>
                    <input value={accountForm.currency} onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value.toUpperCase() })}
                      placeholder={cur} className="w-24 px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <button disabled={busy || !accountForm.name.trim() || !bankingUp} onClick={doOpen}
                      className="px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: primary, borderRadius: radius }}>
                      Open
                    </button>
                  </div>
                </Panel>

                {accounts === undefined ? (
                  <Panel theme={theme} className="animate-pulse p-6 text-sm" ><span style={{ color: muted }}>Loading accounts…</span></Panel>
                ) : acctOpts.length === 0 ? (
                  <Panel theme={theme} className="p-10 text-center text-sm"><CreditCard className="mx-auto mb-2 h-8 w-8" style={{ color: muted }} /><span style={{ color: muted }}>No accounts yet — open one above.</span></Panel>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {acctOpts.map((a: any) => (
                      <Panel theme={theme} key={a._id} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{a.name}</p>
                            <p className="font-mono text-[11px]" style={{ color: muted }}>{a.accountNumber}</p>
                          </div>
                          <Pill theme={theme} tone={statusTone(a.status)}>{a.status}</Pill>
                        </div>
                        <p className="mt-4 text-2xl font-bold tracking-tight"><Money minor={a.balanceMinor} currency={a.currency} /></p>
                        <p className="mt-1 text-[11px]" style={{ color: muted }}>Balance derived from double-entry ledger entries</p>
                      </Panel>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "transfers" && (
              <>
                <Panel theme={theme} className="space-y-3 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><ArrowLeftRight className="h-4 w-4" style={{ color: accent }} /> Transfer between accounts</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select value={tx.sourceAccountId} onChange={(e) => setTx({ ...tx, sourceAccountId: e.target.value })}
                      className="px-3.5 py-2.5 text-sm outline-none" style={fieldStyle}>
                      <option value="">Source account…</option>
                      {acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}
                    </select>
                    <select value={tx.destAccountId} onChange={(e) => setTx({ ...tx, destAccountId: e.target.value })}
                      className="px-3.5 py-2.5 text-sm outline-none" style={fieldStyle}>
                      <option value="">Destination account…</option>
                      {acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}
                    </select>
                    <input type="number" step="0.01" placeholder={`Amount (${cur})`} value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })}
                      className="px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <button disabled={busy || !tx.sourceAccountId || !tx.destAccountId || !tx.amount || !bankingUp} onClick={doTx}
                      className="px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: primary, borderRadius: radius }}>
                      Send transfer
                    </button>
                  </div>
                  <p className="text-[11px]" style={{ color: muted }}>
                    Transfers post balanced double-entry lines atomically and are fee-snapshotted at execution time.
                  </p>
                </Panel>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Panel theme={theme} className="space-y-3 p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold"><ArrowDownLeft className="h-4 w-4" style={{ color: bankTone(theme, "success").fg }} /> Deposit</p>
                    <select value={dep.accountId} onChange={(e) => setDep({ ...dep, accountId: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm outline-none" style={fieldStyle}>
                      <option value="">Account (optional)…</option>
                      {acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}
                    </select>
                    <input type="number" step="0.01" value={dep.amount} onChange={(e) => setDep({ ...dep, amount: e.target.value })}
                      placeholder={`Amount (${cur})`} className="w-full px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <select value={dep.method} onChange={(e) => setDep({ ...dep, method: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm outline-none" style={fieldStyle}>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="crypto">Crypto (needs a provider)</option>
                    </select>
                    <button disabled={busy || !dep.amount || !bankingUp} onClick={doDep}
                      className="w-full py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: okColor, borderRadius: radius }}>
                      Create deposit
                    </button>
                    <p className="text-[11px]" style={{ color: muted }}>Deposits land as pending until an operator reconciles them.</p>
                  </Panel>

                  <Panel theme={theme} className="space-y-3 p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold"><ArrowUpRight className="h-4 w-4" style={{ color: bankTone(theme, "danger").fg }} /> Withdraw</p>
                    <select value={wth.accountId} onChange={(e) => setWth({ ...wth, accountId: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm outline-none" style={fieldStyle}>
                      <option value="">Source account…</option>
                      {acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}
                    </select>
                    <input type="number" step="0.01" value={wth.amount} onChange={(e) => setWth({ ...wth, amount: e.target.value })}
                      placeholder={`Amount (${cur})`} className="w-full px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <input value={wth.destination} onChange={(e) => setWth({ ...wth, destination: e.target.value })}
                      placeholder="Destination / method" className="w-full px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <button disabled={busy || !wth.accountId || !wth.amount || !bankingUp} onClick={doWth}
                      className="w-full py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: primary, borderRadius: radius }}>
                      Withdraw
                    </button>
                    <p className="text-[11px]" style={{ color: muted }}>Fee and available balance are re-checked server-side.</p>
                  </Panel>
                </div>

                <Panel theme={theme}>
                  <p className="px-5 py-4 text-sm font-semibold" style={{ borderBottom: `1px solid ${divider}` }}>Banking history</p>
                  {deposits.length === 0 && withdrawals.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: muted }}>Nothing recorded yet.</div>
                  ) : (
                    <div>
                      {[...deposits.map((d) => ({ ...d, kind: "deposit" })), ...withdrawals.map((w) => ({ ...w, kind: "withdrawal" }))]
                        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                        .slice(0, 12)
                        .map((r: any) => (
                          <div key={r._id} className="flex items-center gap-3 px-5 py-3.5 text-sm" style={{ borderTop: `1px solid ${divider}` }}>
                            <span className="capitalize" style={{ color: muted }}>{r.kind}</span>
                            <Pill theme={theme} tone={statusTone(r.status)}>{r.status}</Pill>
                            <span className="ml-auto font-semibold"><Money minor={r.amountMinor} currency={r.currency ?? cur} /></span>
                            <span className="hidden text-[11px] sm:block" style={{ color: muted }}>{fmtDate(r.createdAt)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </Panel>
              </>
            )}

            {tab === "beneficiaries" && (
              <>
                <Panel theme={theme} className="space-y-3 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" style={{ color: accent }} /> Add a payee</p>
                  <div className="flex flex-wrap gap-2">
                    <input value={benForm.nickname} onChange={(e) => setBenForm({ ...benForm, nickname: e.target.value })} placeholder="Nickname"
                      className="min-w-[140px] flex-1 px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <input value={benForm.accountNumber} onChange={(e) => setBenForm({ ...benForm, accountNumber: e.target.value })} placeholder="Account number"
                      className="min-w-[160px] flex-1 px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <input value={benForm.holderName} onChange={(e) => setBenForm({ ...benForm, holderName: e.target.value })} placeholder="Holder name (optional)"
                      className="min-w-[160px] flex-1 px-3.5 py-2.5 text-sm outline-none" style={fieldStyle} />
                    <label className="inline-flex items-center gap-2 px-3 py-2.5 text-sm" style={fieldStyle}>
                      <input type="checkbox" checked={benForm.isExternal} onChange={(e) => setBenForm({ ...benForm, isExternal: e.target.checked })} />
                      External bank
                    </label>
                    <button disabled={busy || !benForm.nickname.trim() || !benForm.accountNumber.trim() || !bankingUp} onClick={doBen}
                      className="px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: primary, borderRadius: radius }}>
                      Add
                    </button>
                  </div>
                </Panel>

                <Panel theme={theme}>
                  <p className="px-5 py-4 text-sm font-semibold" style={{ borderBottom: `1px solid ${divider}` }}>Saved payees</p>
                  {bens === undefined ? (
                    <div className="animate-pulse p-6 text-sm" style={{ color: muted }}>Loading…</div>
                  ) : bens.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: muted }}>No payees saved yet.</div>
                  ) : (
                    <div>
                      {bens.map((b: any) => (
                        <div key={b._id} className="flex items-center gap-3 px-5 py-3.5 text-sm" style={{ borderTop: `1px solid ${divider}` }}>
                          <span className="font-medium">{b.nickname}</span>
                          <span className="font-mono text-[11px]" style={{ color: muted }}>{b.accountNumber}</span>
                          <Pill theme={theme} tone="neutral">{b.isExternal ? "external" : "internal"}</Pill>
                          <button
                            onClick={async () => { try { await rmBen({ tenantId: id, beneficiaryId: b._id }); toast.success("Removed"); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } }}
                            className="ml-auto text-xs font-medium hover:underline" style={{ color: dangerColor }}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </>
            )}

            {tab === "statements" && (
              <Panel theme={theme} className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" style={{ color: accent }} /> Statement</p>
                  <select value={stmtAcc} onChange={(e) => setStmtAcc(e.target.value)}
                    className="px-3.5 py-2.5 text-sm outline-none" style={fieldStyle}>
                    <option value="">Pick an account…</option>
                    {acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}
                  </select>
                </div>

                {!stmt ? (
                  <p className="text-sm" style={{ color: muted }}>
                    Balances and lines are derived from the double-entry ledger on the server — never from client input.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        { label: "Opening", value: stmt.openingBalanceMinor },
                        { label: "Closing (from ledger)", value: stmt.closingBalanceMinor },
                        { label: "Authoritative balance", value: stmt.authoritativeBalanceMinor },
                      ].map((r) => (
                        <div key={r.label} className="p-4" style={{ backgroundColor: theme.subtle, border: `1px solid ${border}`, borderRadius: radius }}>
                          <p className={secTitle} style={{ color: muted }}>{r.label}</p>
                          <p className="mt-1 font-mono text-sm font-semibold"><Money minor={r.value ?? 0} currency={cur} /></p>
                        </div>
                      ))}
                    </div>

                    <div style={{ border: `1px solid ${border}`, borderRadius: radius, overflow: "hidden" }}>
                      {stmt.posts?.length ? (
                        stmt.posts.map((p: any) => {
                          const credit = (p.creditMinor ?? 0) > 0;
                          return (
                            <div key={p._id} className="flex items-center gap-3 px-4 py-3 text-sm" style={{ borderTop: `1px solid ${divider}` }}>
                              <Pill theme={theme} tone={credit ? "success" : "danger"}>
                                {credit
                                  ? <><span>+</span><Money minor={p.creditMinor} currency={cur} /></>
                                  : <><span>−</span><Money minor={p.debitMinor} currency={cur} /></>}
                              </Pill>
                              <span className="min-w-0 flex-1 truncate">{p.description}</span>
                              <span className="hidden text-[11px] sm:block" style={{ color: muted }}>{fmtDate(p.createdAt)}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-sm" style={{ color: muted }}>No ledger entries in this window.</div>
                      )}
                    </div>
                  </>
                )}
              </Panel>
            )}
          </div>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 pb-10 text-[11px]" style={{ color: muted }}>
          <span>{brandName} · {cur} · powered by Cloudie</span>
          <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" style={{ color: accent }} /> realtime via Convex subscriptions</span>
        </footer>
      </div>
    </Shell>
  );
}
