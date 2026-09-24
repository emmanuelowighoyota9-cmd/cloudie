import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Plus,
  ShieldCheck,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  FileText,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Clock,
  PiggyBank,
  Briefcase,
  Send,
  Receipt,
  Trash2,
  ChevronRight,
  DollarSign,
  Activity,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

function fmtDate(ts: number | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(ts: number | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

function maskAccount(num: string) {
  return `••••${num.slice(-4)}`;
}

function kycStatusBadge(status: string) {
  switch (status) {
    case "approved": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "rejected": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "submitted": case "under_review": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "resubmission_required": return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
    default: return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  }
}

const ACCOUNT_ICONS: Record<string, typeof Landmark> = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
};

const ACCOUNT_COLORS: Record<string, string> = {
  checking: "from-[#003087] to-[#0050a0]",
  savings: "from-[#00695c] to-[#00897b]",
  credit: "from-[#b71c1c] to-[#c62828]",
};

export default function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.get, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const accounts = useQuery(api.tenants.listAccounts, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const ledger = useQuery(api.tenants.getTenantLedger, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const kycRecords = useQuery(api.tenants.listKyc, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const tenantUsers = useQuery(api.tenants.listTenantUsers, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");

  const updateSite = useMutation(api.tenants.update);
  const toggleActive = useMutation(api.tenants.toggleActive);
  const submitKyc = useMutation(api.tenants.submitKyc);
  const addUser = useMutation(api.tenants.addTenantUser);
  const removeUser = useMutation(api.tenants.removeTenantUser);
  const createAccount = useMutation(api.tenants.createAccount);
  const depositMutation = useMutation(api.tenants.depositToAccount);
  const withdrawMutation = useMutation(api.tenants.withdrawFromAccount);
  const transferMutation = useMutation(api.tenantTransfers.transferBetweenAccounts);

  const [tab, setTab] = useState("accounts");
  const [showBalances, setShowBalances] = useState(true);
  const [createAcctOpen, setCreateAcctOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [kycOpen, setKycOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newAcct, setNewAcct] = useState({ accountType: "checking" as "checking" | "savings" | "credit", name: "", initialBalance: "" });
  const [depositAmt, setDepositAmt] = useState("");
  const [depositDesc, setDepositDesc] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawDesc, setWithdrawDesc] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmt, setTransferAmt] = useState("");
  const [transferDesc, setTransferDesc] = useState("");
  const [kycForm, setKycForm] = useState({ fullName: "", dateOfBirth: "" });
  const [addUserEmail, setAddUserEmail] = useState("");
  const [settingsForm, setSettingsForm] = useState({ siteName: "", contactEmail: "", contactPhone: "", primaryColor: "", accentColor: "" });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  if (site === undefined) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />)}</div>;
  }
  if (!site) {
    return (
      <div className="py-16 text-center">
        <Building2 className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">Site not found.</p>
        <Link to="/business"><Button variant="ghost" className="mt-4 gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
      </div>
    );
  }

  const totalBalance = accounts?.filter((a) => a.isActive).reduce((s, a) => s + a.balance, 0) ?? 0;
  const activeAccounts = accounts?.filter((a) => a.isActive) ?? [];
  const latestKyc = kycRecords?.[0] ?? null;

  if (tab === "settings" && !settingsLoaded && site) {
    setSettingsLoaded(true);
    setSettingsForm({
      siteName: site.siteName,
      contactEmail: site.contactEmail ?? "",
      contactPhone: site.contactPhone ?? "",
      primaryColor: site.branding?.primaryColor ?? "",
      accentColor: site.branding?.accentColor ?? "",
    });
  }

  const handleCreateAccount = async () => {
    if (!newAcct.name.trim()) { toast.error("Account name is required"); return; }
    setBusy(true);
    try {
      // Use first tenant user or owner as account holder.
      const holderId = tenantUsers?.[0]?.userId ?? site.ownerId;
      await createAccount({
        tenantId: site._id,
        userId: holderId,
        accountType: newAcct.accountType,
        name: newAcct.name.trim(),
        initialBalance: newAcct.initialBalance ? Number(newAcct.initialBalance) : 0,
      });
      toast.success("Account opened");
      setCreateAcctOpen(false);
      setNewAcct({ accountType: "checking", name: "", initialBalance: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleDeposit = async () => {
    if (!selectedAccount || !depositAmt) return;
    setBusy(true);
    try {
      await depositMutation({ tenantId: site._id, accountId: selectedAccount as Id<"tenantAccounts">, amount: Number(depositAmt), description: depositDesc || undefined });
      toast.success("Deposit successful");
      setDepositOpen(false); setDepositAmt(""); setDepositDesc(""); setSelectedAccount("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleWithdraw = async () => {
    if (!selectedAccount || !withdrawAmt) return;
    setBusy(true);
    try {
      await withdrawMutation({ tenantId: site._id, accountId: selectedAccount as Id<"tenantAccounts">, amount: Number(withdrawAmt), description: withdrawDesc || undefined });
      toast.success("Withdrawal processed");
      setWithdrawOpen(false); setWithdrawAmt(""); setWithdrawDesc(""); setSelectedAccount("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const openTransfer = (fromId?: string) => {
    if (activeAccounts.length < 2) { toast.error("Open a second active account to transfer funds"); return; }
    const from = fromId && activeAccounts.some((a) => a._id === fromId) ? fromId : activeAccounts[0]._id;
    setTransferFrom(from);
    setTransferTo((prev) => (prev && prev !== from ? prev : activeAccounts.find((a) => a._id !== from)!._id));
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    if (!transferFrom || !transferTo || !transferAmt) return;
    if (transferFrom === transferTo) { toast.error("Choose two different accounts"); return; }
    const amount = Number(transferAmt);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter an amount greater than zero"); return; }
    setBusy(true);
    try {
      await transferMutation({
        tenantId: site._id,
        fromAccountId: transferFrom as Id<"tenantAccounts">,
        toAccountId: transferTo as Id<"tenantAccounts">,
        amount,
        description: transferDesc || undefined,
      });
      toast.success("Transfer complete");
      setTransferOpen(false); setTransferAmt(""); setTransferDesc("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleSubmitKyc = async () => {
    if (!kycForm.fullName.trim()) { toast.error("Full name required"); return; }
    setBusy(true);
    try {
      await submitKyc({ tenantId: site._id, fullName: kycForm.fullName.trim(), dateOfBirth: kycForm.dateOfBirth || undefined });
      toast.success("KYC submitted"); setKycOpen(false); setKycForm({ fullName: "", dateOfBirth: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleAddUser = async () => {
    if (!addUserEmail.trim()) return;
    setBusy(true);
    try {
      await addUser({ tenantId: site._id, email: addUserEmail.trim() });
      toast.success("Member added"); setAddUserOpen(false); setAddUserEmail("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleSaveSettings = async () => {
    setBusy(true);
    try {
      await updateSite({ tenantId: site._id, siteName: settingsForm.siteName || undefined, contactEmail: settingsForm.contactEmail || undefined, contactPhone: settingsForm.contactPhone || undefined, branding: { primaryColor: settingsForm.primaryColor || undefined, accentColor: settingsForm.accentColor || undefined } });
      toast.success("Settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const SiteIcon = site.siteType === "bank" ? Landmark : TrendingUp;

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* ── Chase-style navy header ── */}
      <div className="bg-[#003087] text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Link to="/business" className="text-white/70 hover:text-white transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <SiteIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-none">{site.siteName}</p>
                  <p className="text-[10px] text-white/60">{site.subdomain}.cloudie.app</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={site.isActive ? "secondary" : "destructive"} className="text-[10px] bg-white/15 text-white border-0">
                {site.isActive ? "Active" : "Locked"}
              </Badge>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => setShowBalances(!showBalances)}>
                {showBalances ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Balance hero */}
          <div className="pb-6 pt-2">
            <p className="text-xs font-medium text-white/60 uppercase tracking-wider">Total Balance</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {showBalances ? fmtCurrency(totalBalance) : "••••••"}
            </p>
            <p className="mt-1 text-xs text-white/50">
              {accounts?.filter((a) => a.isActive).length ?? 0} active account{(accounts?.filter((a) => a.isActive).length ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Quick actions row */}
          <div className="flex gap-3 pb-5 overflow-x-auto">
            {[
              { icon: ArrowDownLeft, label: "Deposit", color: "bg-emerald-500", action: () => { if (accounts?.length) { setSelectedAccount(accounts[0]._id); setDepositOpen(true); } else toast.error("Create an account first"); } },
              { icon: Send, label: "Transfer", color: "bg-blue-400", action: () => openTransfer() },
              { icon: Receipt, label: "Statements", color: "bg-purple-500", action: () => setTab("overview") },
              { icon: ShieldCheck, label: "Verify ID", color: "bg-amber-500", action: () => setTab("kyc") },
              { icon: Settings, label: "Settings", color: "bg-slate-400", action: () => { setTab("settings"); setSettingsLoaded(false); } },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.action}
                className="flex shrink-0 flex-col items-center gap-1.5 group"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${a.color} text-white shadow-lg group-hover:scale-105 transition-transform`}>
                  <a.icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-white/80">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white dark:bg-slate-900 shadow-sm mb-6 w-full sm:w-auto">
            <TabsTrigger value="accounts" className="gap-1.5 data-[state=active]:bg-[#003087] data-[state=active]:text-white">
              <Wallet className="h-3.5 w-3.5" /> Accounts
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-[#003087] data-[state=active]:text-white">
              <Activity className="h-3.5 w-3.5" /> Activity
            </TabsTrigger>
            <TabsTrigger value="kyc" className="gap-1.5 data-[state=active]:bg-[#003087] data-[state=active]:text-white">
              <ShieldCheck className="h-3.5 w-3.5" /> KYC
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 data-[state=active]:bg-[#003087] data-[state=active]:text-white">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-[#003087] data-[state=active]:text-white">
              <Settings className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          {/* ════════════ ACCOUNTS TAB ════════════ */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your Accounts</h2>
              <Button size="sm" className="bg-[#003087] hover:bg-[#002060] text-white gap-1.5" onClick={() => setCreateAcctOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Open Account
              </Button>
            </div>

            {!accounts || accounts.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-12 text-center">
                  <Landmark className="mx-auto h-12 w-12 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">No accounts yet</p>
                  <p className="mt-1 text-xs text-slate-400">Open your first account to start managing funds.</p>
                  <Button size="sm" className="mt-4 bg-[#003087] hover:bg-[#002060] text-white" onClick={() => setCreateAcctOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Open Account
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map((acct) => {
                  const Icon = ACCOUNT_ICONS[acct.accountType] || Landmark;
                  return (
                    <div key={acct._id} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${ACCOUNT_COLORS[acct.accountType]} p-5 text-white shadow-lg`}>
                      <div className="flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="secondary" className="text-[10px] bg-white/15 text-white border-0 capitalize">
                          {acct.accountType}
                        </Badge>
                      </div>
                      <p className="mt-4 text-sm font-medium text-white/80">{acct.name}</p>
                      <p className="mt-1 text-2xl font-bold tracking-tight">
                        {showBalances ? fmtCurrency(acct.balance) : "••••••"}
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
                        <p className="font-mono text-[11px] text-white/60">
                          {maskAccount(acct.accountNumber)}
                        </p>
                        {!acct.isActive && (
                          <span className="text-[10px] font-medium text-red-300">CLOSED</span>
                        )}
                      </div>
                      {acct.isActive && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => { setSelectedAccount(acct._id); setDepositOpen(true); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 py-1.5 text-[11px] font-medium hover:bg-white/25 transition-colors"
                          >
                            <ArrowDownLeft className="h-3 w-3" /> Deposit
                          </button>
                          <button
                            onClick={() => openTransfer(acct._id)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 py-1.5 text-[11px] font-medium hover:bg-white/25 transition-colors"
                          >
                            <Send className="h-3 w-3" /> Transfer
                          </button>
                          <button
                            onClick={() => { setSelectedAccount(acct._id); setWithdrawOpen(true); }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/15 py-1.5 text-[11px] font-medium hover:bg-white/25 transition-colors"
                          >
                            <ArrowUpRight className="h-3 w-3" /> Withdraw
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ════════════ ACTIVITY / OVERVIEW TAB ════════════ */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003087]/10">
                      <DollarSign className="h-5 w-5 text-[#003087]" />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Total Balance</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{fmtCurrency(totalBalance)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                      <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Total Deposits</p>
                      <p className="text-lg font-bold text-emerald-600">
                        +{fmtCurrency(ledger?.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0) ?? 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                      <ArrowUpRight className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Total Withdrawals</p>
                      <p className="text-lg font-bold text-red-600">
                        -{fmtCurrency(ledger?.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0) ?? 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!ledger || ledger.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    <Receipt className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    No transactions yet
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ledger.slice(0, 15).map((entry) => (
                      <div key={entry._id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${entry.amount >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                          {entry.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{entry.description}</p>
                          <p className="text-[11px] text-slate-400">{entry.type} · {fmtDate(entry.createdAt)}</p>
                        </div>
                        <span className={`text-sm font-semibold ${entry.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {entry.amount >= 0 ? "+" : ""}{fmtCurrency(entry.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════ KYC TAB ════════════ */}
          <TabsContent value="kyc" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Identity Verification</CardTitle>
                <Button size="sm" className="bg-[#003087] hover:bg-[#002060] text-white" onClick={() => setKycOpen(true)} disabled={latestKyc?.status === "submitted" || latestKyc?.status === "under_review"}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {latestKyc?.status === "resubmission_required" ? "Resubmit" : "Submit KYC"}
                </Button>
              </CardHeader>
              <CardContent>
                {latestKyc ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${kycStatusBadge(latestKyc.status)}`}>
                        {latestKyc.status === "approved" ? <CheckCircle className="h-3 w-3" /> : latestKyc.status === "rejected" ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {latestKyc.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-slate-400">Submitted {fmtDateTime(latestKyc.createdAt)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div><span className="text-slate-400">Name</span><p className="font-medium">{latestKyc.fullName}</p></div>
                      {latestKyc.dateOfBirth && <div><span className="text-slate-400">DOB</span><p className="font-medium">{latestKyc.dateOfBirth}</p></div>}
                      {latestKyc.notes && <div className="sm:col-span-2"><span className="text-slate-400">Notes</span><p className="font-medium">{latestKyc.notes}</p></div>}
                    </div>
                    {latestKyc.status === "resubmission_required" && (
                      <p className="mt-3 rounded-lg bg-orange-50 p-3 text-xs text-orange-700 dark:bg-orange-900/20">Additional information required. Please resubmit.</p>
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-slate-400">
                    <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    Submit your identity to unlock full features.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════ USERS TAB ════════════ */}
          <TabsContent value="users" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Site Members</CardTitle>
                <Button size="sm" className="bg-[#003087] hover:bg-[#002060] text-white" onClick={() => setAddUserOpen(true)} disabled={!site.isActive}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                </Button>
              </CardHeader>
              <CardContent>
                {!tenantUsers || tenantUsers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No members yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tenantUsers.map((u) => (
                      <div key={u._id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003087]/10 text-[#003087] text-sm font-bold">
                            {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{u.name || u.email}</p>
                            <p className="text-[11px] text-slate-400">{u.email} · {u.role}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600" onClick={async () => { try { await removeUser({ tenantId: site._id, membershipId: u._id }); toast.success("Removed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════ SETTINGS TAB ════════════ */}
          <TabsContent value="settings" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Site Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs text-slate-500">Site Name</Label><Input value={settingsForm.siteName} onChange={(e) => setSettingsForm({ ...settingsForm, siteName: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs text-slate-500">Subdomain</Label><Input disabled value={`${site.subdomain}.cloudie.app`} /></div>
                  <div className="space-y-1.5"><Label className="text-xs text-slate-500">Contact Email</Label><Input type="email" value={settingsForm.contactEmail} onChange={(e) => setSettingsForm({ ...settingsForm, contactEmail: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs text-slate-500">Contact Phone</Label><Input value={settingsForm.contactPhone} onChange={(e) => setSettingsForm({ ...settingsForm, contactPhone: e.target.value })} /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Primary Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={settingsForm.primaryColor || "#003087"} onChange={(e) => setSettingsForm({ ...settingsForm, primaryColor: e.target.value })} className="h-9 w-9 cursor-pointer rounded border" />
                      <Input value={settingsForm.primaryColor} onChange={(e) => setSettingsForm({ ...settingsForm, primaryColor: e.target.value })} placeholder="#003087" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Accent Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={settingsForm.accentColor || "#0050a0"} onChange={(e) => setSettingsForm({ ...settingsForm, accentColor: e.target.value })} className="h-9 w-9 cursor-pointer rounded border" />
                      <Input value={settingsForm.accentColor} onChange={(e) => setSettingsForm({ ...settingsForm, accentColor: e.target.value })} placeholder="#0050a0" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{site.isActive ? "Site is active" : "Site is locked"}</p>
                    <p className="text-[11px] text-slate-400">{site.isActive ? "Deactivate to show a maintenance page." : "Reactivate to restore access."}</p>
                  </div>
                  <Button variant={site.isActive ? "destructive" : "default"} size="sm" onClick={async () => { try { await toggleActive({ tenantId: site._id }); toast.success(site.isActive ? "Site locked" : "Site activated"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>
                    {site.isActive ? <><Lock className="mr-1.5 h-3.5 w-3.5" /> Lock</> : <><Unlock className="mr-1.5 h-3.5 w-3.5" /> Activate</>}
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button className="bg-[#003087] hover:bg-[#002060] text-white" onClick={handleSaveSettings} disabled={busy}>{busy ? "Saving…" : "Save Settings"}</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create Account Dialog ── */}
      <Dialog open={createAcctOpen} onOpenChange={setCreateAcctOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open New Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Account Type</Label>
              <Select value={newAcct.accountType} onValueChange={(v) => setNewAcct({ ...newAcct, accountType: v as "checking" | "savings" | "credit" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking"><span className="flex items-center gap-2"><Landmark className="h-3.5 w-3.5" /> Checking</span></SelectItem>
                  <SelectItem value="savings"><span className="flex items-center gap-2"><PiggyBank className="h-3.5 w-3.5" /> Savings</span></SelectItem>
                  <SelectItem value="credit"><span className="flex items-center gap-2"><CreditCard className="h-3.5 w-3.5" /> Credit</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Account Name *</Label><Input value={newAcct.name} onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })} placeholder="e.g. Primary Checking" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Initial Deposit</Label><Input type="number" min="0" step="0.01" value={newAcct.initialBalance} onChange={(e) => setNewAcct({ ...newAcct, initialBalance: e.target.value })} placeholder="0.00" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateAcctOpen(false)}>Cancel</Button>
            <Button className="bg-[#003087] hover:bg-[#002060] text-white" onClick={handleCreateAccount} disabled={busy || !newAcct.name.trim()}>{busy ? "Opening…" : "Open Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deposit Dialog ── */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Make a Deposit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!selectedAccount && accounts && accounts.filter((a) => a.isActive).length > 0 && (
              <div className="space-y-1.5"><Label className="text-xs text-slate-500">To Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.isActive).map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.name} ({maskAccount(a.accountNumber)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Amount *</Label><Input type="number" min="0.01" step="0.01" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} placeholder="0.00" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Description</Label><Input value={depositDesc} onChange={(e) => setDepositDesc(e.target.value)} placeholder="e.g. Opening deposit" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleDeposit} disabled={busy || !depositAmt || !selectedAccount}>{busy ? "Depositing…" : "Deposit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Withdraw Dialog ── */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Make a Withdrawal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!selectedAccount && accounts && accounts.filter((a) => a.isActive).length > 0 && (
              <div className="space-y-1.5"><Label className="text-xs text-slate-500">From Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.isActive).map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.name} ({fmtCurrency(a.balance)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Amount *</Label><Input type="number" min="0.01" step="0.01" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} placeholder="0.00" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Description</Label><Input value={withdrawDesc} onChange={(e) => setWithdrawDesc(e.target.value)} placeholder="e.g. ATM withdrawal" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleWithdraw} disabled={busy || !withdrawAmt || !selectedAccount}>{busy ? "Processing…" : "Withdraw"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transfer Dialog ── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Between Accounts</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">From Account *</Label>
              <Select value={transferFrom} onValueChange={(v) => { setTransferFrom(v); if (v === transferTo) setTransferTo(activeAccounts.find((a) => a._id !== v)?._id ?? ""); }}>
                <SelectTrigger><SelectValue placeholder="Select source account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.name} ({fmtCurrency(a.balance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">To Account *</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.filter((a) => a._id !== transferFrom).map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.name} ({maskAccount(a.accountNumber)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Amount *</Label><Input type="number" min="0.01" step="0.01" value={transferAmt} onChange={(e) => setTransferAmt(e.target.value)} placeholder="0.00" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Description</Label><Input value={transferDesc} onChange={(e) => setTransferDesc(e.target.value)} placeholder="e.g. Move to savings" /></div>
            <p className="text-[11px] text-slate-400">Both accounts post to the same balanced double-entry ledger — the movement appears in each account's activity.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button className="bg-[#003087] hover:bg-[#002060] text-white" onClick={handleTransfer} disabled={busy || !transferAmt || !transferFrom || !transferTo || transferFrom === transferTo}>{busy ? "Transferring…" : "Transfer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── KYC Dialog ── */}
      <Dialog open={kycOpen} onOpenChange={setKycOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{latestKyc?.status === "resubmission_required" ? "Resubmit KYC" : "Submit Identity Verification"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Full Legal Name *</Label><Input value={kycForm.fullName} onChange={(e) => setKycForm({ ...kycForm, fullName: e.target.value })} placeholder="John Doe" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Date of Birth</Label><Input type="date" value={kycForm.dateOfBirth} onChange={(e) => setKycForm({ ...kycForm, dateOfBirth: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKycOpen(false)}>Cancel</Button>
            <Button className="bg-[#003087] hover:bg-[#002060] text-white" onClick={handleSubmitKyc} disabled={busy || !kycForm.fullName.trim()}>{busy ? "Submitting…" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add User Dialog ── */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Site Member</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label className="text-xs text-slate-500">Email *</Label><Input type="email" value={addUserEmail} onChange={(e) => setAddUserEmail(e.target.value)} placeholder="user@example.com" autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button className="bg-[#003087] hover:bg-[#002060] text-white" onClick={handleAddUser} disabled={busy || !addUserEmail.trim()}>{busy ? "Adding…" : "Add Member"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
