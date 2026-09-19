import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Landmark, CreditCard, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Wallet, Plus, Users, FileText, Bell, DollarSign, Check } from "lucide-react";

function Money({ minor, currency = "USD" }: { minor: number; currency?: string }) {
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency + " ";
  const s = (minor / 100).toFixed(2);
  return <>{sym}{s}</>;
}
function fmtDate(ms?: number) { return ms ? new Date(ms).toLocaleString() : "—"; }

export default function SiteBanking() {
  const { siteId } = useParams<{ siteId: string }>();
  const id = siteId as Id<"tenantSites">;
  const publicT = useQuery(api.bankingCustomer.publicTenant, { tenantId: id });
  const member = useQuery(api.bankingCustomer.memberTenant, { tenantId: id });
  const joinMutation = useMutation(api.bankingCustomer.joinTenant);
  const accounts = useQuery(api.bankingCustomer.memberAccounts, { tenantId: id });
  const history = useQuery(api.bankingCustomer.bankingHistory, { tenantId: id, limit: 50 });
  const bens = useQuery(api.bankingCustomer.listBeneficiaries, { tenantId: id });
  const onboard = useQuery(api.bankingCustomer.onboardingMe, { tenantId: id });
  const [tab, setTab] = useState<"overview" | "accounts" | "transfers" | "beneficiaries" | "statements">("overview");
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
  const stmt = useQuery(api.bankingCustomer.statement as any, stmtAcc ? { tenantId: id, accountId: stmtAcc as Id<"tenantAccounts"> } : "skip") as any;

  if (publicT === undefined || member === undefined) return <div className="p-8"><div className="animate-pulse text-slate-400">Loading…</div></div>;
  if (!publicT) return <div className="max-w-3xl mx-auto p-8"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm"><div className="font-semibold">404 — Banking tenant not found</div><Link to="/business" className="underline">Back to Business</Link></div></div>;
  const currency = (publicT as any).currency ?? "USD";
  const lifecycle = (publicT as any).status ?? "active";
  const bankingUp = lifecycle === "active";

  if (!member) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-slate-400 mx-auto" />
          <h1 className="text-xl font-bold mt-3">{publicT.siteName}</h1>
          <p className="text-sm text-slate-500 mt-2">Banking portal is tenant-scoped. Sign in and join this tenant to continue. Branched from the existing Convex auth — no third-party auth introduced.</p>
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            <Link to={`/auth?returnTo=/site/${id}/banking`} className="rounded-xl bg-slate-900 text-white px-5 py-2 text-sm font-semibold">Sign in</Link>
            <button onClick={async () => { setBusy(true); try { await joinMutation({ tenantId: id }); toast.success(`Joined ${publicT.siteName}`); } catch (e) { const msg = e instanceof Error ? e.message : String(e); if (msg.includes("TENANT_UNAVAILABLE")) toast.error("This tenant is unavailable (paused/disabled)."); else toast.error(msg); } finally { setBusy(false); } }} disabled={busy || !bankingUp} className="rounded-xl border border-slate-900 bg-white px-5 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">Join as customer</button>
            <Link to={`/business/sites/${id}`} className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold">View in Business Suite</Link>
          </div>
          {!bankingUp && <div className="mt-3 text-xs text-amber-600">This tenant is {lifecycle} — joining and transactions are temporarily disabled. Historical records remain preserved.</div>}
        </div>
      </div>
    );
  }

  const kycList = onboard?.kyc ?? [];
  const latestKyc = kycList[0];
  const pendingKyc = !latestKyc || latestKyc.status === "submitted" || latestKyc.status === "under_review";

  const doKyc = async () => {
    if (!kName.trim()) { toast.error("Provide full name"); return; }
    setBusy(true);
    try { await submitKycAny({ tenantId: id, fullName: kName.trim(), dateOfBirth: kDob || undefined }); toast.success("KYC submitted"); setKName(""); setKDob(""); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const doOpen = async () => {
    if (!accountForm.name.trim()) return;
    setBusy(true);
    try { await openAccount({ tenantId: id, name: accountForm.name.trim(), accountType: accountForm.accountType as any, currency: accountForm.currency || undefined }); toast.success("Account opened"); setAccountForm({ name: "", accountType: "checking", currency: "" }); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doDep = async () => {
    const minor = Math.round(Number(dep.amount) * 100);
    setBusy(true);
    try { await createDeposit({ tenantId: id, accountId: dep.accountId ? dep.accountId as Id<"tenantAccounts"> : undefined, amountMinor: minor, currency: currency, method: dep.method }); toast.success("Deposit created — pending"); setDep({ accountId: "", amount: "", method: "bank_transfer" }); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doWth = async () => {
    const minor = Math.round(Number(wth.amount) * 100);
    setBusy(true);
    try { await createWithdrawal({ tenantId: id, accountId: wth.accountId as Id<"tenantAccounts">, amountMinor: minor, destination: wth.destination || undefined }); toast.success("Withdrawal completed"); setWth({ accountId: "", amount: "", destination: "" }); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
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
    try { await addBen({ tenantId: id, nickname: benForm.nickname.trim(), accountNumber: benForm.accountNumber.trim(), accountHolderName: benForm.holderName || undefined, isExternal: !!benForm.isExternal }); toast.success("Beneficiary added"); setBenForm({ nickname: "", accountNumber: "", holderName: "", isExternal: false }); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const acctOpts = accounts ?? [];
  const transfers: any[] = history?.transfers ?? [];
  const deposits: any[] = history?.deposits ?? [];
  const withdrawals: any[] = history?.withdrawals ?? [];

  const NavItem = ({ v, label, Icon }: any) => <button onClick={() => setTab(v)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}><Icon className="h-4 w-4" /> {label}</button>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Landmark className="h-6 w-6" /> {(publicT as any).displayName ?? publicT.siteName} — Banking</h1>
          <div className="text-sm text-slate-500">{(publicT as any).subdomain}.g0ki.com · {currency} · <span className={bankingUp ? "text-emerald-600" : "text-red-600"}>{lifecycle}</span> · realtime via Convex subscriptions</div>
          <div className="flex gap-2 mt-2">
            <Link to={`/site/${id}`} className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">Public banking site</Link>
            <Link to={`/site/${id}/admin`} className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">Bank admin app</Link>
            <Link to={`/admin/tenants/${id}/banking`} className="text-xs rounded-full bg-slate-900 text-white px-3 py-1">Super Admin → tenant banking</Link>
          </div>
        </div>
        <div className="text-xs text-slate-400">Customer onboarding · KYC · Accounts · Ledger-backed balances · Transfers · Statements</div>
      </div>

      {!bankingUp && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm flex items-center gap-2"><AlertIcon /> This tenant is {lifecycle} — transactions and on-boarding are temporarily disabled. Historical records & ledger are preserved.</div>
      )}

      <div className="flex flex-wrap gap-2">
        <NavItem v="overview" label="Overview" Icon={Wallet} />
        <NavItem v="accounts" label="Accounts" Icon={CreditCard} />
        <NavItem v="transfers" label="Send / Deposit / Withdraw" Icon={ArrowLeftRight} />
        <NavItem v="beneficiaries" label="Beneficiaries" Icon={Users} />
        <NavItem v="statements" label="Statements" Icon={FileText} />
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {/* Onboarding / KYC banner */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className={`h-4 w-4 ${pendingKyc ? "text-amber-600" : latestKyc?.status === "approved" ? "text-emerald-600" : "text-slate-400"}`} /> Onboarding & KYC {pendingKyc ? "— submit to unlock higher limits" : latestKyc?.status === "approved" ? "— verified" : null}</div>
            {latestKyc && <div className="text-sm text-slate-600">Latest: {latestKyc.fullName} · <span className={`rounded-full px-2 py-0.5 text-xs ${latestKyc.status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : latestKyc.status === "rejected" ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>{latestKyc.status}</span> · {fmtDate(latestKyc.createdAt)}</div>}
            <div className="flex flex-wrap gap-2">
              <input value={kName} onChange={e => setKName(e.target.value)} placeholder="Full legal name" className="rounded-xl border border-slate-200 px-4 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              <input type="date" value={kDob} onChange={e => setKDob(e.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              <button disabled={busy || !kName.trim() || !bankingUp} onClick={doKyc} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50">Submit KYC</button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Balance (sum of active accounts)</div><div className="text-2xl font-bold mt-1">{accounts === undefined ? "—" : <><Money minor={accounts.reduce((s: number, a: any) => s + ((a as any).balanceMinor ?? 0), 0)} currency={currency} /></>}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Transfers</div><div className="text-xl font-mono mt-1">{transfers.length} · last 24h {transfers.filter((t: any) => (t as any).createdAt > Date.now() - 24 * 3600 * 1000).length}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Notifications</div><div className="text-sm mt-1"><Link to="/notifications" className="underline">Notification center</Link> — banking events live via realtime</div></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            <div className="p-4 flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Recent transfers</div>
            {transfers.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No transfers yet — try Send below.</div> : transfers.slice(0, 10).map((t: any) => (
              <div key={t._id} className="p-4 flex items-center gap-3 text-sm"><span className="font-mono text-xs rounded-full bg-slate-100 px-2 py-1">{t.reference}</span><span className={`text-xs rounded-full px-2 py-0.5 ${t.status === "completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100"}`}>{t.status}</span><span className="flex-1"><Money minor={t.amountMinor} currency={t.currency} /></span><span className="text-xs text-slate-500 hidden sm:block">{fmtDate(t.createdAt)}</span></div>
            ))}
          </div>
        </div>
      )}

      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Open account</div>
            <div className="flex flex-wrap gap-2">
              <input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Account name (e.g. Checking)" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" />
              <select value={accountForm.accountType} onChange={e => setAccountForm({ ...accountForm, accountType: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"><option value="checking">checking</option><option value="savings">savings</option><option value="credit">credit</option></select>
              <input value={accountForm.currency} onChange={e => setAccountForm({ ...accountForm, currency: e.target.value.toUpperCase() })} placeholder={currency} className="w-20 rounded-xl border border-slate-200 px-4 py-2 text-sm" />
              <button disabled={busy || !accountForm.name.trim() || !bankingUp} onClick={doOpen} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"><Plus className="inline h-3.5 w-3.5" /> Open</button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-sm font-semibold">My accounts</div>
            {accounts === undefined ? <div className="text-sm text-slate-400 animate-pulse">Loading…</div> : accounts.length === 0 ? <div className="text-sm text-slate-400">No accounts yet — open one above.</div> : <div className="grid sm:grid-cols-2 gap-4">
              {accounts.map((a: any) => (
                <div key={a._id} className="rounded-xl border border-slate-200 p-4">
                  <div className="font-medium">{a.name} <span className={`ml-2 text-[11px] rounded-full px-2 py-0.5 ${a.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : a.status === "frozen" ? "bg-amber-50 text-amber-700" : "bg-slate-100"}`}>{a.status}</span></div>
                  <div className="text-xs text-slate-500 font-mono">{a.accountNumber}</div>
                  <div className="text-lg font-bold mt-1"><Money minor={a.balanceMinor} currency={a.currency} /></div>
                  <div className="text-xs text-slate-400">Ledger-backed · double-entry</div>
                </div>
              ))}
            </div>}
          </div>
        </div>
      )}

      {tab === "transfers" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Internal transfer (tenant → tenant)</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <select value={tx.sourceAccountId} onChange={e => setTx({ ...tx, sourceAccountId: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="">Source account…</option>{acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} — <Money minor={a.balanceMinor} currency={a.currency} /> · {a.accountNumber}</option>)}</select>
              <select value={tx.destAccountId} onChange={e => setTx({ ...tx, destAccountId: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="">Destination account…</option>{acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}</select>
              <input type="number" step="0.01" placeholder="Amount" value={tx.amount} onChange={e => setTx({ ...tx, amount: e.target.value })} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              <button disabled={busy || !tx.sourceAccountId || !tx.destAccountId || !tx.amount || !bankingUp} onClick={doTx} className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Send transfer (atomic, fee-aware)</button>
            </div>
            <div className="text-xs text-slate-400">Beneficiary/external flows: use Beneficiaries tab then retry with a beneficiary. External integrations are designed additively (do not rewrite the ledger).</div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-emerald-600" /> Deposit</div>
              <select value={dep.accountId} onChange={e => setDep({ ...dep, accountId: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="">Account (optional)…</option>{acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}</select>
              <input type="number" step="0.01" value={dep.amount} onChange={e => setDep({ ...dep, amount: e.target.value })} placeholder="Amount" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              <select value={dep.method} onChange={e => setDep({ ...dep, method: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="crypto">Crypto (blocked without provider)</option></select>
              <button disabled={busy || !dep.amount || !bankingUp} onClick={doDep} className="w-full rounded-xl bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">Create deposit (pending → admin reconcile)</button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-600" /> Withdrawal</div>
              <select value={wth.accountId} onChange={e => setWth({ ...wth, accountId: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="">Source account…</option>{acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} — <Money minor={a.balanceMinor} currency={a.currency} /></option>)}</select>
              <input type="number" step="0.01" value={wth.amount} onChange={e => setWth({ ...wth, amount: e.target.value })} placeholder="Amount" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              <input value={wth.destination} onChange={e => setWth({ ...wth, destination: e.target.value })} placeholder="Destination / method" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" />
              <button disabled={busy || !wth.accountId || !wth.amount || !bankingUp} onClick={doWth} className="w-full rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Withdraw (atomic fee + balance check)</button>
            </div>
          </div>
        </div>
      )}

      {tab === "beneficiaries" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Add beneficiary</div>
            <div className="flex flex-wrap gap-2">
              <input value={benForm.nickname} onChange={e => setBenForm({ ...benForm, nickname: e.target.value })} placeholder="Nickname" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" />
              <input value={benForm.accountNumber} onChange={e => setBenForm({ ...benForm, accountNumber: e.target.value })} placeholder="External account number" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" />
              <input value={benForm.holderName} onChange={e => setBenForm({ ...benForm, holderName: e.target.value })} placeholder="Holder name (optional)" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" />
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={benForm.isExternal} onChange={e => setBenForm({ ...benForm, isExternal: e.target.checked })} /> external bank</label>
              <button disabled={busy || !benForm.nickname.trim() || !benForm.accountNumber.trim() || !bankingUp} onClick={doBen} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50">Add</button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-semibold">Saved beneficiaries</div>
            {bens === undefined ? <div className="text-sm text-slate-400 animate-pulse mt-2">Loading…</div> : bens.length === 0 ? <div className="text-sm text-slate-400 mt-2">No beneficiaries yet.</div> : <ul className="divide-y divide-slate-100 mt-2">
              {bens.map((b: any) => (
                <li key={b._id} className="py-2 flex items-center gap-3 text-sm"><span className="font-medium">{b.nickname}</span><span className="text-slate-500 font-mono text-xs">{b.accountNumber}</span><span className="text-xs rounded-full bg-slate-100 px-2 py-0.5">{b.isExternal ? "external" : "internal"}</span><span className="ml-auto" /><button onClick={async () => { try { await rmBen({ tenantId: id, beneficiaryId: b._id }); toast.success("Removed"); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } }} className="text-xs text-red-600 hover:underline">Remove</button></li>
              ))}
            </ul>}
          </div>
        </div>
      )}

      {tab === "statements" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Statement — authoritative ledger (balances never from client input)</div>
            <div className="flex flex-wrap gap-2">
              <select value={stmtAcc} onChange={e => setStmtAcc(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="">Pick account…</option>{acctOpts.map((a: any) => <option key={a._id} value={a._id}>{a.name} · {a.accountNumber}</option>)}</select>
            </div>
            {!stmt ? <div className="text-sm text-slate-400">Select an account above; balances and lines are derived from double-entry ledger entries on the server.</div> : (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">Opening</div><div className="font-mono font-semibold"><Money minor={(stmt as any).openingBalanceMinor} currency={currency} /></div></div>
                  <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">Closing (computed from ledger)</div><div className="font-mono font-semibold"><Money minor={(stmt as any).closingBalanceMinor} currency={currency} /></div></div>
                  <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs text-slate-500">Authoritative account balance</div><div className="font-mono font-semibold"><Money minor={(stmt as any).authoritativeBalanceMinor} currency={currency} /></div></div>
                </div>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {(stmt as any).posts?.length ? (stmt as any).posts.map((p: any) => (
                    <div key={p._id} className="p-3 flex items-center gap-3 text-sm"><span className={`text-xs rounded-full px-2 py-0.5 ${p.creditMinor > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{p.creditMinor > 0 ? `+ <Money minor=${p.creditMinor} />` : `- ${p.debitMinor}`} {currency}</span><span className="flex-1">{p.description}</span><span className="text-xs text-slate-400 hidden sm:block">{fmtDate(p.createdAt)}</span></div>
                  )) : <div className="p-6 text-center text-sm text-slate-400">No ledger entries in this window.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertIcon() { return <DollarSign className="h-4 w-4 text-amber-600" />; }
