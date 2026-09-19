import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Building2,
  CreditCard,
  Landmark,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Settings,
  Plus,
  Trash2,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

function fmtDate(ts: number | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(ts: number | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function kycStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "submitted":
    case "under_review":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "resubmission_required":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  }
}

export default function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(
    api.tenants.get,
    siteId ? { id: siteId as Id<"tenantSites"> } : "skip",
  );
  const kycRecords = useQuery(
    api.tenants.listKyc,
    siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip",
  );
  const ledger = useQuery(
    api.tenants.getTenantLedger,
    siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip",
  );
  const tenantUsers = useQuery(
    api.tenants.listTenantUsers,
    siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip",
  );

  const updateSite = useMutation(api.tenants.update);
  const toggleActive = useMutation(api.tenants.toggleActive);
  const submitKyc = useMutation(api.tenants.submitKyc);
  const addUser = useMutation(api.tenants.addTenantUser);
  const removeUser = useMutation(api.tenants.removeTenantUser);
  const credit = useMutation(api.tenants.creditDemoAccount);
  const debit = useMutation(api.tenants.debitDemoAccount);

  const [tab, setTab] = useState("overview");
  const [kycOpen, setKycOpen] = useState(false);
  const [kycForm, setKycForm] = useState({ fullName: "", dateOfBirth: "" });
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserEmail, setAddUserEmail] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerForm, setLedgerForm] = useState({
    userId: "",
    amount: "",
    description: "",
    type: "credit" as "credit" | "debit",
  });
  const [settings, setSettings] = useState({
    siteName: "",
    contactEmail: "",
    contactPhone: "",
    primaryColor: "",
    accentColor: "",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  if (site === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="py-16 text-center">
        <Building2 className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">Site not found or not yours.</p>
        <Link to="/business">
          <Button variant="ghost" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to sites
          </Button>
        </Link>
      </div>
    );
  }

  // Compute balance from ledger.
  const balance =
    ledger?.reduce((sum, e) => sum + e.amount, 0) ?? 0;
  const totalCredits =
    ledger?.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0) ?? 0;
  const totalDebits =
    ledger?.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0) ?? 0;
  const latestKyc = kycRecords?.[0] ?? null;

  // Load settings when first switching tab.
  if (tab === "settings" && !settingsLoaded) {
    setSettingsLoaded(true);
    setSettings({
      siteName: site.siteName,
      contactEmail: site.contactEmail ?? "",
      contactPhone: site.contactPhone ?? "",
      primaryColor: site.branding?.primaryColor ?? "",
      accentColor: site.branding?.accentColor ?? "",
    });
  }

  const saveSettings = async () => {
    setBusy(true);
    try {
      await updateSite({
        tenantId: site._id,
        siteName: settings.siteName || undefined,
        contactEmail: settings.contactEmail || undefined,
        contactPhone: settings.contactPhone || undefined,
        branding: {
          primaryColor: settings.primaryColor || undefined,
          accentColor: settings.accentColor || undefined,
        },
      });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async () => {
    setBusy(true);
    try {
      await toggleActive({ tenantId: site._id });
      toast.success(site.isActive ? "Site locked" : "Site activated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitKyc = async () => {
    if (!kycForm.fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setBusy(true);
    try {
      await submitKyc({
        tenantId: site._id,
        fullName: kycForm.fullName.trim(),
        dateOfBirth: kycForm.dateOfBirth || undefined,
      });
      toast.success("KYC submitted for review");
      setKycOpen(false);
      setKycForm({ fullName: "", dateOfBirth: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddUser = async () => {
    if (!addUserEmail.trim()) return;
    setBusy(true);
    try {
      await addUser({ tenantId: site._id, email: addUserEmail.trim() });
      toast.success("User added to site");
      setAddUserOpen(false);
      setAddUserEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveUser = async (membershipId: Id<"tenantUsers">) => {
    try {
      await removeUser({ tenantId: site._id, membershipId });
      toast.success("User removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleLedgerEntry = async () => {
    if (!ledgerForm.userId || !ledgerForm.amount) {
      toast.error("User and amount are required");
      return;
    }
    setBusy(true);
    try {
      const args = {
        tenantId: site._id,
        userId: ledgerForm.userId as Id<"users">,
        amount: Number(ledgerForm.amount),
        description: ledgerForm.description || undefined,
      };
      if (ledgerForm.type === "credit") {
        await credit(args);
      } else {
        await debit(args);
      }
      toast.success(`${ledgerForm.type === "credit" ? "Credited" : "Debited"} successfully`);
      setLedgerOpen(false);
      setLedgerForm({ userId: "", amount: "", description: "", type: "credit" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const SiteIcon = site.siteType === "bank" ? Landmark : TrendingUp;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/business">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50">
          <SiteIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-slate-900 dark:text-white">
            {site.siteName}
          </h1>
          <p className="text-xs text-slate-500">
            {site.subdomain}.cloudie.app ·{" "}
            <span className="capitalize">{site.siteType}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={site.isActive ? "default" : "destructive"} className="text-xs">
            {site.isActive ? "Active" : "Locked"}
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Accounts
          </TabsTrigger>
          <TabsTrigger value="kyc" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> KYC
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Account Balance</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {fmtCurrency(balance)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Total Credits</p>
                <p className="mt-1 text-2xl font-bold text-green-600">
                  +{fmtCurrency(totalCredits)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Total Debits</p>
                <p className="mt-1 text-2xl font-bold text-red-600">
                  -{fmtCurrency(totalDebits)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Site Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["Type", site.siteType === "bank" ? "Banking Portal" : "Investment Portal"],
                ["Subdomain", `${site.subdomain}.cloudie.app`],
                ["Status", site.isActive ? "Active" : "Locked"],
                ["Renewal Date", fmtDate(site.renewalDate)],
                ["Contact Email", site.contactEmail || "—"],
                ["Contact Phone", site.contactPhone || "—"],
                ["Members", `${tenantUsers?.length ?? 0} users`],
                ["Created", fmtDate(site.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 py-1.5 dark:border-slate-800">
                  <span className="text-slate-400">{k}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleToggleActive} disabled={busy}>
              {site.isActive ? (
                <><Lock className="mr-1.5 h-3.5 w-3.5" /> Lock Site</>
              ) : (
                <><Unlock className="mr-1.5 h-3.5 w-3.5" /> Activate</>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* ── Accounts Tab (banking/investment dashboard) ── */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">
                {site.siteType === "bank" ? "Banking" : "Investment"} Accounts
              </CardTitle>
              <Button size="sm" onClick={() => setLedgerOpen(true)}>
                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> New Transaction
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Account summary cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-slate-700 dark:from-blue-950/30 dark:to-indigo-950/30">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-blue-600" />
                    <p className="text-xs font-medium text-blue-600">Total Balance</p>
                  </div>
                  <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                    {fmtCurrency(balance)}
                  </p>
                  <p className="text-[10px] text-slate-400">Across all accounts</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-xs font-medium text-green-600">Credits</p>
                  </div>
                  <p className="mt-2 text-xl font-bold text-green-600">
                    +{fmtCurrency(totalCredits)}
                  </p>
                  <p className="text-[10px] text-slate-400">{ledger?.filter((e) => e.amount > 0).length ?? 0} transactions</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-xs font-medium text-red-600">Debits</p>
                  </div>
                  <p className="mt-2 text-xl font-bold text-red-600">
                    -{fmtCurrency(totalDebits)}
                  </p>
                  <p className="text-[10px] text-slate-400">{ledger?.filter((e) => e.amount < 0).length ?? 0} transactions</p>
                </div>
              </div>

              {/* Recent transactions */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Recent Transactions
                </p>
                {!ledger || ledger.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No transactions yet. Create a credit or debit entry to get started.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ledger.slice(0, 20).map((entry) => (
                      <div key={entry._id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                            {entry.description}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {entry.type} · {fmtDateTime(entry.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`ml-3 text-sm font-semibold ${
                            entry.amount >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {entry.amount >= 0 ? "+" : ""}
                          {fmtCurrency(entry.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── KYC Tab ── */}
        <TabsContent value="kyc" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Identity Verification (KYC)</CardTitle>
              <Button
                size="sm"
                onClick={() => setKycOpen(true)}
                disabled={latestKyc?.status === "submitted" || latestKyc?.status === "under_review"}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {latestKyc?.status === "resubmission_required"
                  ? "Resubmit"
                  : latestKyc
                    ? "Submit New"
                    : "Submit KYC"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current KYC status */}
              {latestKyc ? (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${kycStatusBadge(latestKyc.status)}`}
                    >
                      {latestKyc.status === "approved" ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : latestKyc.status === "rejected" ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {latestKyc.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-slate-400">
                      Submitted {fmtDateTime(latestKyc.createdAt)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <span className="text-slate-400">Full Name</span>
                      <p className="font-medium text-slate-700 dark:text-slate-200">{latestKyc.fullName}</p>
                    </div>
                    {latestKyc.dateOfBirth && (
                      <div>
                        <span className="text-slate-400">Date of Birth</span>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{latestKyc.dateOfBirth}</p>
                      </div>
                    )}
                    {latestKyc.notes && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-400">Reviewer Notes</span>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{latestKyc.notes}</p>
                      </div>
                    )}
                  </div>
                  {latestKyc.status === "resubmission_required" && (
                    <p className="mt-3 rounded-lg bg-orange-50 p-3 text-xs text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                      Additional information is required. Please resubmit with updated documents.
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">
                  <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  No KYC submitted yet. Submit your identity to unlock full platform features.
                </div>
              )}

              {/* KYC History */}
              {kycRecords && kycRecords.length > 1 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    KYC History
                  </p>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {kycRecords.map((r) => (
                      <div key={r._id} className="flex items-center justify-between py-2 text-xs">
                        <div>
                          <span className={`rounded-full px-2 py-0.5 font-medium ${kycStatusBadge(r.status)}`}>
                            {r.status.replace(/_/g, " ")}
                          </span>
                          <span className="ml-2 text-slate-400">{fmtDateTime(r.createdAt)}</span>
                        </div>
                        {r.resubmissionCount ? (
                          <span className="text-slate-400">#{r.resubmissionCount + 1}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Users Tab ── */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Site Members</CardTitle>
              <Button size="sm" onClick={() => setAddUserOpen(true)} disabled={!site.isActive}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Member
              </Button>
            </CardHeader>
            <CardContent>
              {!tenantUsers || tenantUsers.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  No members yet. Add users to give them access to this portal.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tenantUsers.map((u) => (
                    <div key={u._id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {u.name || u.email}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {u.email} · {u.role} · joined {fmtDate(u.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleRemoveUser(u._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Settings Tab ── */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Site Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Site Name</Label>
                  <Input
                    value={settings.siteName}
                    onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Subdomain</Label>
                  <Input disabled value={`${site.subdomain}.cloudie.app`} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Contact Email</Label>
                  <Input
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Contact Phone</Label>
                  <Input
                    value={settings.contactPhone}
                    onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Primary Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.primaryColor || "#2563eb"}
                      onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                      className="h-9 w-9 cursor-pointer rounded border"
                    />
                    <Input
                      value={settings.primaryColor}
                      onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                      placeholder="#2563eb"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Accent Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings.accentColor || "#6366f1"}
                      onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                      className="h-9 w-9 cursor-pointer rounded border"
                    />
                    <Input
                      value={settings.accentColor}
                      onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                      placeholder="#6366f1"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={busy}>
                  {busy ? "Saving…" : "Save Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── KYC Dialog ── */}
      <Dialog open={kycOpen} onOpenChange={setKycOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {latestKyc?.status === "resubmission_required" ? "Resubmit KYC" : "Submit KYC"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Full Legal Name *</Label>
              <Input
                value={kycForm.fullName}
                onChange={(e) => setKycForm({ ...kycForm, fullName: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Date of Birth</Label>
              <Input
                type="date"
                value={kycForm.dateOfBirth}
                onChange={(e) => setKycForm({ ...kycForm, dateOfBirth: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKycOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitKyc} disabled={busy || !kycForm.fullName.trim()}>
              {busy ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add User Dialog ── */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Site Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">User Email *</Label>
            <Input
              type="email"
              value={addUserEmail}
              onChange={(e) => setAddUserEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={busy || !addUserEmail.trim()}>
              {busy ? "Adding…" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ledger Entry Dialog ── */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Type</Label>
              <Select
                value={ledgerForm.type}
                onValueChange={(v) => setLedgerForm({ ...ledgerForm, type: v as "credit" | "debit" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (deposit)</SelectItem>
                  <SelectItem value="debit">Debit (withdrawal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">User ID *</Label>
              <Input
                value={ledgerForm.userId}
                onChange={(e) => setLedgerForm({ ...ledgerForm, userId: e.target.value })}
                placeholder="User ID from the Users tab"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={ledgerForm.amount}
                onChange={(e) => setLedgerForm({ ...ledgerForm, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Description</Label>
              <Input
                value={ledgerForm.description}
                onChange={(e) => setLedgerForm({ ...ledgerForm, description: e.target.value })}
                placeholder="Account opening deposit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLedgerOpen(false)}>Cancel</Button>
            <Button onClick={handleLedgerEntry} disabled={busy || !ledgerForm.userId || !ledgerForm.amount}>
              {busy ? "Processing…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
