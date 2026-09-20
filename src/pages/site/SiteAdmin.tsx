import { useParams, Link } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import {
  Landmark, Users, ShieldCheck, Activity, Settings, CreditCard,
  DollarSign, TrendingUp, TrendingDown, Search, Plus, Trash2,
  Eye, EyeOff, CheckCircle, XCircle, Clock, AlertTriangle,
  ArrowLeft, PiggyBank, Briefcase, Bell, BarChart3, Palette, Wallet,
} from "lucide-react";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString();
}
function maskAccount(n: string) {
  return `••••${n.slice(-4)}`;
}

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  submitted: "bg-amber-100 text-amber-700",
  under_review: "bg-blue-100 text-blue-700",
  resubmission_required: "bg-orange-100 text-orange-700",
  not_submitted: "bg-gray-100 text-gray-600",
};

export default function SiteAdmin() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const stats = useQuery(api.tenants.adminGetStats, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const customers = useQuery(api.tenants.adminListCustomers, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const transactions = useQuery(api.tenants.adminListTransactions, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const kycRecords = useQuery(api.tenants.adminListKycRecords, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");

  // Tenant-scoped accounts (admin-guarded query) — used for the deposit picker.
  const accountsList = useQuery(api.bankingAdmin.adminListBalances, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const pendingDeposits = useQuery(api.tenants.adminListDeposits, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");

  const addCustomer = useMutation(api.tenants.adminAddCustomer);
  const removeCustomer = useMutation(api.tenants.adminRemoveCustomer);
  const reviewKyc = useMutation(api.tenants.adminReviewCustomerKyc);
  // Ledger-backed account opening (writes balanced double-entry posts, never a bare balance write).
  const createAccount = useMutation(api.bankingCustomer.adminOpenAccount);
  const recordDeposit = useMutation(api.tenants.depositToAccount);
  // Customer-initiated deposits are reconciled through a controlled, auditable admin action.
  const reconcileDeposit = useMutation(api.bankingAdmin.adminOverrideDeposit);
  const updateSite = useMutation(api.tenants.update);

  const [tab, setTab] = useState<"overview" | "customers" | "kyc" | "transactions" | "settings">("overview");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addCustomerEmail, setAddCustomerEmail] = useState("");
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ userId: "", accountType: "checking" as "checking" | "savings" | "credit", name: "" });
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositData, setDepositData] = useState({ accountId: "", amount: "" });
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [kycReviewOpen, setKycReviewOpen] = useState<string | null>(null);
  const [kycNotes, setKycNotes] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ siteName: "", contactEmail: "", primaryColor: "", accentColor: "" });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const primary = site?.branding?.primaryColor || "#003087";
  const accent = site?.branding?.accentColor || "#0050a0";

  if (site === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }
  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Landmark className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">Site not found.</p>
          <Link to="/business" className="mt-4 inline-block text-sm font-medium hover:underline" style={{ color: primary }}>← Back to Business Suite</Link>
        </div>
      </div>
    );
  }

  if (tab === "settings" && !settingsLoaded && site) {
    setSettingsLoaded(true);
    setSettingsForm({
      siteName: site.siteName,
      contactEmail: site.contactEmail ?? "",
      primaryColor: site.branding?.primaryColor ?? "",
      accentColor: site.branding?.accentColor ?? "",
    });
  }

  const filteredCustomers = customers?.filter((c) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const pendingKyc = kycRecords?.filter((k) => k.status === "submitted" || k.status === "under_review") ?? [];
  const awaitingDeposits = ((pendingDeposits ?? []) as any[]).filter((d) => d.status === "pending" || d.status === "processing");
  const filteredTxns = transactions?.filter((t) =>
    !search || t.userName.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleAddCustomer = async () => {
    if (!addCustomerEmail.trim() || !siteId) return;
    setBusy(true);
    try {
      await addCustomer({ tenantId: siteId as Id<"tenantSites">, email: addCustomerEmail.trim() });
      toast.success("Customer added"); setAddCustomerOpen(false); setAddCustomerEmail("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleCreateAccount = async () => {
    if (!newAccount.name.trim() || !newAccount.userId || !siteId) return;
    setBusy(true);
    try {
      await createAccount({ tenantId: siteId as Id<"tenantSites">, userId: newAccount.userId as Id<"users">, accountType: newAccount.accountType, name: newAccount.name.trim() });
      toast.success("Account created"); setAddAccountOpen(false); setNewAccount({ userId: "", accountType: "checking", name: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleDeposit = async () => {
    if (!depositData.accountId || !depositData.amount || !siteId) return;
    setBusy(true);
    try {
      await recordDeposit({ tenantId: siteId as Id<"tenantSites">, accountId: depositData.accountId as Id<"tenantAccounts">, amount: Number(depositData.amount) });
      toast.success("Deposit successful"); setDepositOpen(false); setDepositData({ accountId: "", amount: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleReconcile = async (depositId: string, action: "complete" | "fail") => {
    if (!siteId) return;
    setBusy(true);
    try {
      await reconcileDeposit({ tenantId: siteId as Id<"tenantSites">, depositId: depositId as Id<"bankingDeposits">, action, reason: "Admin reconciliation from bank admin panel" });
      toast.success(action === "complete" ? "Deposit credited to ledger" : "Deposit marked failed");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleReviewKyc = async (kycId: string, status: "approved" | "rejected" | "under_review") => {
    if (!siteId) return;
    setBusy(true);
    try {
      await reviewKyc({ tenantId: siteId as Id<"tenantSites">, kycId: kycId as Id<"kycRecords">, status, notes: kycNotes || undefined });
      toast.success(`KYC ${status}`); setKycReviewOpen(null); setKycNotes("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleSaveSettings = async () => {
    if (!siteId) return;
    setBusy(true);
    try {
      await updateSite({
        tenantId: siteId as Id<"tenantSites">,
        siteName: settingsForm.siteName || undefined,
        contactEmail: settingsForm.contactEmail || undefined,
        branding: { primaryColor: settingsForm.primaryColor || undefined, accentColor: settingsForm.accentColor || undefined },
      });
      toast.success("Settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const NAV = [
    { key: "overview" as const, label: "Dashboard", icon: BarChart3 },
    { key: "customers" as const, label: "Customers", icon: Users },
    { key: "kyc" as const, label: "KYC Reviews", icon: ShieldCheck, badge: pendingKyc.length },
    { key: "transactions" as const, label: "Transactions", icon: Activity, badge: awaitingDeposits.length },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex lg:w-64 flex-col text-white" style={{ backgroundColor: primary }}>
        <div className="p-5 border-b border-white/10">
          <Link to={`/site/${siteId}/dashboard`} className="flex items-center gap-2 text-white/60 hover:text-white text-xs mb-3 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to Banking Site
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: accent }}>
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">{site.siteName}</p>
              <p className="text-[10px] text-white/50 mt-0.5">Admin Panel</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === item.key ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold px-1.5">{item.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden text-white px-4 py-3 flex items-center gap-3" style={{ backgroundColor: primary }}>
          <Link to={`/site/${siteId}/dashboard`}>
            <ArrowLeft className="h-5 w-5 text-white/70" />
          </Link>
          <Landmark className="h-5 w-5" />
          <span className="font-bold text-sm">{site.siteName} Admin</span>
        </div>

        {/* Mobile tabs */}
        <div className="lg:hidden overflow-x-auto flex gap-1 p-2 bg-white border-b border-gray-200">
          {NAV.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${
                tab === item.key ? "text-white" : "text-gray-600 hover:bg-gray-100"
              }`} style={tab === item.key ? { backgroundColor: primary } : {}}>
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
              {item.badge ? <span className="ml-1 h-4 min-w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">{item.badge}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* ════════════ OVERVIEW ════════════ */}
          {tab === "overview" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Total Customers", value: stats?.totalCustomers ?? 0, icon: Users, color: "bg-blue-50 text-blue-600" },
                  { label: "Active Accounts", value: stats?.totalAccounts ?? 0, icon: Wallet, color: "bg-emerald-50 text-emerald-600" },
                  { label: "Total Balance", value: fmtCurrency(stats?.totalBalance ?? 0), icon: DollarSign, color: "bg-purple-50 text-purple-600" },
                  { label: "Pending KYC", value: stats?.pendingKyc ?? 0, icon: ShieldCheck, color: "bg-amber-50 text-amber-600" },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                        <card.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium">{card.label}</p>
                        <p className="text-xl font-bold text-gray-900">{card.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Total Deposits", value: `+${fmtCurrency(stats?.totalDeposits ?? 0)}`, icon: TrendingUp, color: "text-emerald-600" },
                  { label: "Total Withdrawals", value: `-${fmtCurrency(stats?.totalWithdrawals ?? 0)}`, icon: TrendingDown, color: "text-red-600" },
                  { label: "Total Transactions", value: stats?.totalTransactions ?? 0, icon: Activity, color: "text-blue-600" },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center gap-3">
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                      <div>
                        <p className="text-xs text-gray-400 font-medium">{card.label}</p>
                        <p className="text-lg font-bold text-gray-900">{card.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════ CUSTOMERS ════════════ */}
          {tab === "customers" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                <div className="flex gap-2">
                  <button onClick={() => setAddAccountOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: accent }}>
                    <CreditCard className="h-3.5 w-3.5" /> New Account
                  </button>
                  <button onClick={() => setAddCustomerOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: primary }}>
                    <Plus className="h-3.5 w-3.5" /> Add Customer
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..."
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white" />
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                {filteredCustomers.length === 0 ? (
                  <div className="p-12 text-center text-sm text-gray-400">
                    <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="font-medium">No customers yet</p>
                    <p className="mt-1 text-xs">Add your first customer to get started.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredCustomers.map((c) => (
                      <div key={c._id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: primary }}>
                          {(c.name ?? c.email ?? "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{c.name || "Unknown"}</p>
                          <p className="text-xs text-gray-400">{c.email} · Joined {fmtDate(c.joinedAt)}</p>
                        </div>
                        <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                          <span>{c.accountCount} accts</span>
                          <span className="font-medium text-gray-900">{fmtCurrency(c.totalBalance)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[c.kycStatus] || "bg-gray-100 text-gray-600"}`}>
                            {c.kycStatus.replace(/_/g, " ")}
                          </span>
                        </div>
                        <button onClick={() => { setSelectedCustomer(selectedCustomer === c.userId ? null : c.userId); }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                          <Eye className="h-4 w-4 text-gray-400" />
                        </button>
                        <button onClick={async () => { try { await removeCustomer({ tenantId: siteId as Id<"tenantSites">, membershipId: c._id }); toast.success("Removed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ KYC ════════════ */}
          {tab === "kyc" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-gray-900">KYC Reviews</h1>
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                {(!kycRecords || kycRecords.length === 0) ? (
                  <div className="p-12 text-center text-sm text-gray-400">
                    <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="font-medium">No KYC submissions yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {kycRecords.map((k) => (
                      <div key={k._id} className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_BADGE[k.status] || "bg-gray-100 text-gray-600"}`}>
                            {k.status.replace(/_/g, " ")}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900">{k.fullName}</p>
                            <p className="text-xs text-gray-400">{k.userName} · Submitted {fmtDateTime(k.createdAt)}</p>
                          </div>
                          {(k.status === "submitted" || k.status === "under_review") && (
                            <div className="flex gap-1.5">
                              <button onClick={() => handleReviewKyc(k._id, "approved")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">
                                <CheckCircle className="inline h-3 w-3 mr-1" />Approve
                              </button>
                              <button onClick={() => { setKycReviewOpen(k._id); }} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700">
                                <XCircle className="inline h-3 w-3 mr-1" />Reject
                              </button>
                            </div>
                          )}
                        </div>
                        {k.notes && <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">{k.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ TRANSACTIONS ════════════ */}
          {tab === "transactions" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
                <button onClick={() => setDepositOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: primary }}>
                  <DollarSign className="h-3.5 w-3.5" /> Record Deposit
                </button>
              </div>
              {awaitingDeposits.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <h2 className="text-sm font-bold text-gray-900">Deposits awaiting reconciliation</h2>
                    <span className="ml-auto rounded-full bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5">{awaitingDeposits.length}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Customer deposits only credit the ledger once approved by an administrator.</p>
                  <div className="space-y-2">
                    {awaitingDeposits.slice(0, 20).map((d) => (
                      <div key={d._id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white border border-amber-100 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{fmtCurrency((d.amountMinor ?? 0) / 100)}</p>
                          <p className="text-xs text-gray-400">{d.reference} · {d.userName} · {d.method}</p>
                        </div>
                        <button onClick={() => handleReconcile(d._id, "complete")} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">Credit</button>
                        <button onClick={() => handleReconcile(d._id, "fail")} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 disabled:opacity-50">Fail</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                {filteredTxns.length === 0 ? (
                  <div className="p-12 text-center text-sm text-gray-400">
                    <Activity className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="font-medium">No transactions yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredTxns.slice(0, 100).map((t) => (
                      <div key={t._id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          t.amount >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                        }`}>
                          {t.amount >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800">{t.description}</p>
                          <p className="text-xs text-gray-400">{t.userName} · {fmtDateTime(t.createdAt)}</p>
                        </div>
                        <span className={`text-sm font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {t.amount >= 0 ? "+" : ""}{fmtCurrency(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ SETTINGS ════════════ */}
          {tab === "settings" && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-gray-900">Site Settings</h1>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                    <input value={settingsForm.siteName} onChange={(e) => setSettingsForm({ ...settingsForm, siteName: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                    <input type="email" value={settingsForm.contactEmail} onChange={(e) => setSettingsForm({ ...settingsForm, contactEmail: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                  <div className="flex items-center gap-0">
                    <input disabled value={site.subdomain} className="flex-1 rounded-l-xl border border-gray-300 border-r-0 px-4 py-2.5 text-sm bg-gray-50" />
                    <span className="rounded-r-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-500 bg-gray-50">.cloudie.app</span>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5" /> Primary Color
                    </label>
                    <div className="flex gap-2">
                      <input type="color" value={settingsForm.primaryColor || "#003087"} onChange={(e) => setSettingsForm({ ...settingsForm, primaryColor: e.target.value })} className="h-9 w-9 cursor-pointer rounded border" />
                      <input value={settingsForm.primaryColor} onChange={(e) => setSettingsForm({ ...settingsForm, primaryColor: e.target.value })} placeholder="#003087"
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5" /> Accent Color
                    </label>
                    <div className="flex gap-2">
                      <input type="color" value={settingsForm.accentColor || "#0050a0"} onChange={(e) => setSettingsForm({ ...settingsForm, accentColor: e.target.value })} className="h-9 w-9 cursor-pointer rounded border" />
                      <input value={settingsForm.accentColor} onChange={(e) => setSettingsForm({ ...settingsForm, accentColor: e.target.value })} placeholder="#0050a0"
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={handleSaveSettings} disabled={busy} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 shadow-lg" style={{ backgroundColor: primary }}>
                    {busy ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════ MODALS ════════════ */}

      {/* Add Customer */}
      {addCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAddCustomerOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add Customer</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={addCustomerEmail} onChange={(e) => setAddCustomerEmail(e.target.value)}
                placeholder="customer@example.com" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" autoFocus />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddCustomerOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddCustomer} disabled={busy || !addCustomerEmail.trim()} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 shadow-lg" style={{ backgroundColor: primary }}>
                {busy ? "Adding..." : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Account */}
      {addAccountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAddAccountOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Open Account</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <select value={newAccount.userId} onChange={(e) => setNewAccount({ ...newAccount, userId: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2">
                  <option value="">Select customer</option>
                  {customers?.map((c) => (
                    <option key={c.userId} value={c.userId}>{c.name || c.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                <select value={newAccount.accountType} onChange={(e) => setNewAccount({ ...newAccount, accountType: e.target.value as "checking" | "savings" | "credit" })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2">
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                <input value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  placeholder="e.g. Premium Checking" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddAccountOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreateAccount} disabled={busy || !newAccount.name.trim() || !newAccount.userId} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 shadow-lg" style={{ backgroundColor: primary }}>
                {busy ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Deposit */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDepositOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Record Deposit</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                <select value={depositData.accountId} onChange={(e) => setDepositData({ ...depositData, accountId: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2">
                  <option value="">Select account</option>
                  {(accountsList ?? []).map((a: any) => (
                    <option key={a._id} value={a._id}>
                      {a.userName || a.userEmail || "Account"} · {a.name} · ••••{String(a.accountNumber).slice(-4)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" min="0.01" step="0.01" value={depositData.amount} onChange={(e) => setDepositData({ ...depositData, amount: e.target.value })}
                  placeholder="0.00" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDepositOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeposit} disabled={busy || !depositData.accountId || !depositData.amount} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-lg">
                {busy ? "Processing..." : "Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC Review */}
      {kycReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setKycReviewOpen(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reject KYC</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason *</label>
              <textarea value={kycNotes} onChange={(e) => setKycNotes(e.target.value)} rows={3} placeholder="Provide a reason for rejection..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setKycReviewOpen(null)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleReviewKyc(kycReviewOpen, "rejected")} disabled={busy || kycNotes.trim().length < 5}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-lg">
                {busy ? "Submitting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
