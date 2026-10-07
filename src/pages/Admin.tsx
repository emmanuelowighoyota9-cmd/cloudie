import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminPageHeader, StatCard, AdminSkeleton } from "@/components/admin/shared";
import {
  Activity, AlertTriangle, ArrowRight, BadgeDollarSign, Boxes, Building2,
  LockKeyhole, Server, Shield, WalletCards, Workflow, CircleCheck, CircleAlert, Eye,
  ClipboardCheck, Coins, CreditCard, FileText, Gavel, Package, Settings,
  ShieldAlert, ShieldCheck, ShoppingCart, Truck, UserCheck, UserX, Users, Zap
} from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Admin() {
  const data = useQuery(api.adminApi.adminDashboard);
  const risk = useQuery(api.adminApi.getFinancialRisk, { hours: 24, limit: 5 });
  const ngnValue = (amountNgn: number) => `₦${Math.round(amountNgn).toLocaleString("en-NG")}`;

  if (data === undefined) return <div className="space-y-6"><AdminPageHeader title="Cloudie Command Center" description="Loading live platform controls…" /><AdminSkeleton rows={5} /></div>;

  if (data === null) return (
    <div className="space-y-6">
      <AdminPageHeader title="Cloudie Command Center" description="Privileged platform control." />
      <Card><CardContent className="flex items-center gap-4 p-6"><ShieldAlert className="h-6 w-6 text-destructive" /><div><h2 className="font-semibold">Admin access required</h2><p className="text-sm text-muted-foreground">Use an active administrator account.</p></div><Link className="ml-auto" to="/dashboard"><Button variant="outline">Back to app</Button></Link></CardContent></Card>
    </div>
  );

  const metrics = [
    { label: "Users", value: data.users.total, sub: `${data.users.active.toLocaleString()} active`, to: "/admin/users" },
    { label: "Wallet credits", value: ngnValue(data.points.minted), sub: `${data.points.velocity24h.toLocaleString()} events / 24h`, to: "/admin/transactions" },
    { label: "Marketplace orders", value: data.marketplace.orders, sub: `${data.marketplace.escrowPending.toLocaleString()} in escrow`, to: "/admin/orders" },
    { label: "Active shipments", value: data.shipments.active, sub: `${data.shipments.delivered.toLocaleString()} delivered`, to: "/admin/shipments" },
  ];

  const actions = [
    { label: "Administrators", description: "Privileged access and operators", to: "/admin/administrators", icon: ShieldCheck },
    { label: "Wallet & Ledger", description: "Credits, debits and reconciliation", to: "/admin/transactions", icon: BadgeDollarSign },
    { label: "System Health", description: "Infrastructure and provider status", to: "/admin/system-health", icon: Activity },
    { label: "Platform Settings", description: "Global configuration and controls", to: "/admin/settings", icon: Settings },
    { label: "VTU Providers", description: "Provider routing and catalog", to: "/admin/vtu/providers", icon: Zap },
    { label: "Business Tenants", description: "Tenant lifecycle and controls", to: "/admin/tenants", icon: Building2 },
  ];

  const attention = [
    { label: "Pending KYC", value: data.kyc.pending, to: "/admin/kyc", danger: false },
    { label: "Open disputes", value: data.disputes.open, to: "/admin/disputes", danger: true },
    { label: "Pending vendors", value: data.vendors.pending, to: "/admin/vendors", danger: false },
    { label: "Locked tenants", value: data.tenants.locked, to: "/admin/tenants", danger: true },
  ];

  const groups = [
    { title: "Users", items: [
      { title: "Total Users", value: data.users.total, icon: Users, color: "blue" as const, to: "/admin/users" },
      { title: "Active Users", value: data.users.active, icon: UserCheck, color: "green" as const, to: "/admin/users" },
      { title: "Suspended", value: data.users.suspended, icon: UserX, color: "red" as const, to: "/admin/users" },
    ]},
    { title: "Wallet Economy", items: [
      { title: "Wallet Credits", value: data.points.minted, icon: Coins, color: "blue" as const, to: "/admin/transactions", hint: ngnValue(data.points.minted) },
      { title: "Wallet Debits", value: data.points.burned, icon: Coins, color: "amber" as const, to: "/admin/transactions", hint: ngnValue(data.points.burned) },
      { title: "Velocity (24h)", value: data.points.velocity24h, icon: Zap, color: "purple" as const, to: "/admin/transactions" },
    ]},
    { title: "Marketplace", items: [
      { title: "Vendors", value: data.vendors.total, icon: Boxes, color: "purple" as const, to: "/admin/vendors" },
      { title: "Orders", value: data.marketplace.orders, icon: ShoppingCart, color: "blue" as const, to: "/admin/orders" },
      { title: "Escrow Pending", value: data.marketplace.escrowPending, icon: Package, color: "amber" as const, to: "/admin/orders" },
      { title: "Open Disputes", value: data.disputes.open, icon: Gavel, color: "red" as const, to: "/admin/disputes" },
    ]},
    { title: "Operations", items: [
      { title: "Active Shipments", value: data.shipments.active, icon: Truck, color: "blue" as const, to: "/admin/shipments" },
      { title: "Delivered", value: data.shipments.delivered, icon: Truck, color: "green" as const, to: "/admin/shipments" },
      { title: "Documents (24h)", value: data.documents.last24h, icon: FileText, color: "indigo" as const, to: "/admin/documents" },
      { title: "Pending KYC", value: data.kyc.pending, icon: ClipboardCheck, color: "amber" as const, to: "/admin/kyc" },
    ]},
  ];

  return (
    <div className="space-y-7 sm:space-y-9">
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.12] via-card to-card p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-primary text-primary-foreground">MASTER SUPER ADMIN</Badge>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE CONTROL PLANE</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Cloudie Command Center</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">One control surface for users, money movement, marketplace operations, tenants, VTU infrastructure and privileged access.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Link to="/admin/administrators"><Button variant="outline" className="w-full gap-2"><ShieldCheck className="h-4 w-4" /> Admins</Button></Link>
            <Link to="/admin/system-health"><Button className="w-full gap-2"><Activity className="h-4 w-4" /> Health</Button></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/admin/transactions" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Wallet control</span><WalletCards className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">{ngnValue(data.points.minted)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Credits processed</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-full rounded-full bg-primary" /></div>
        </Link>
        <Link to="/admin/orders" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Order control</span><Workflow className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">{data.marketplace.orders.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.marketplace.escrowPending.toLocaleString()} awaiting escrow resolution</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600"><CircleCheck className="h-3.5 w-3.5" /> LIVE ORDER QUEUE</div>
        </Link>
        <Link to="/admin/system-health" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Platform signals</span><Server className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">LIVE</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.documents.last24h.toLocaleString()} documents processed in 24h</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600"><CircleCheck className="h-3.5 w-3.5" /> DATA LAYER RESPONDING</div>
        </Link>
        <Link to="/admin/audit" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Security control</span><LockKeyhole className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">{data.users.suspended.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">Suspended accounts under control</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-primary"><Eye className="h-3.5 w-3.5" /> AUDIT READY</div>
        </Link>
      </section>

      <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><h2 className="font-semibold">Master control room</h2></div><p className="mt-1 text-xs text-muted-foreground">Prioritized signals for the administrator responsible for the whole platform.</p></div>
          <Link to="/admin/audit" className="text-xs font-semibold text-primary hover:underline">Open audit trail →</Link>
        </div>
        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link to="/admin/kyc" className="p-5 transition hover:bg-muted/40"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Identity queue</span><CircleAlert className={data.kyc.pending > 0 ? "h-4 w-4 text-amber-500" : "h-4 w-4 text-emerald-500"} /></div><p className="mt-3 text-xl font-bold">{data.kyc.pending.toLocaleString()}</p><p className="text-xs text-muted-foreground">KYC reviews pending</p></Link>
          <Link to="/admin/disputes" className="p-5 transition hover:bg-muted/40"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Risk queue</span><CircleAlert className={data.disputes.open > 0 ? "h-4 w-4 text-red-500" : "h-4 w-4 text-emerald-500"} /></div><p className="mt-3 text-xl font-bold">{data.disputes.open.toLocaleString()}</p><p className="text-xs text-muted-foreground">Open marketplace disputes</p></Link>
          <Link to="/admin/tenants" className="p-5 transition hover:bg-muted/40"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Tenant controls</span><CircleAlert className={data.tenants.locked > 0 ? "h-4 w-4 text-red-500" : "h-4 w-4 text-emerald-500"} /></div><p className="mt-3 text-xl font-bold">{data.tenants.locked.toLocaleString()}</p><p className="text-xs text-muted-foreground">Locked business tenants</p></Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/admin/transactions" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Wallet control</span><WalletCards className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">{ngnValue(data.points.minted)}</p><p className="mt-1 text-xs text-muted-foreground">Credits processed</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-full rounded-full bg-primary" /></div>
        </Link>
        <Link to="/admin/orders" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Order control</span><Workflow className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">{data.marketplace.orders.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{data.marketplace.escrowPending.toLocaleString()} awaiting escrow resolution</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600"><CircleCheck className="h-3.5 w-3.5" /> LIVE ORDER QUEUE</div>
        </Link>
        <Link to="/admin/system-health" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Platform signals</span><Server className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">LIVE</p><p className="mt-1 text-xs text-muted-foreground">{data.documents.last24h.toLocaleString()} documents processed in 24h</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600"><CircleCheck className="h-3.5 w-3.5" /> DATA LAYER RESPONDING</div>
        </Link>
        <Link to="/admin/audit" className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Security control</span><LockKeyhole className="h-4 w-4 text-primary" /></div>
          <p className="mt-3 text-2xl font-bold tracking-tight">{data.users.suspended.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Suspended accounts under control</p>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-primary"><Eye className="h-3.5 w-3.5" /> AUDIT READY</div>
        </Link>
      </section>

      <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><h2 className="font-semibold">Master control room</h2></div><p className="mt-1 text-xs text-muted-foreground">Prioritized signals for the administrator responsible for the whole platform.</p></div>
          <Link to="/admin/audit" className="text-xs font-semibold text-primary hover:underline">Open audit trail →</Link>
        </div>
        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link to="/admin/kyc" className="p-5 transition hover:bg-muted/40"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Identity queue</span><CircleAlert className={data.kyc.pending > 0 ? "h-4 w-4 text-amber-500" : "h-4 w-4 text-emerald-500"} /></div><p className="mt-3 text-xl font-bold">{data.kyc.pending.toLocaleString()}</p><p className="text-xs text-muted-foreground">KYC reviews pending</p></Link>
          <Link to="/admin/disputes" className="p-5 transition hover:bg-muted/40"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Risk queue</span><CircleAlert className={data.disputes.open > 0 ? "h-4 w-4 text-red-500" : "h-4 w-4 text-emerald-500"} /></div><p className="mt-3 text-xl font-bold">{data.disputes.open.toLocaleString()}</p><p className="text-xs text-muted-foreground">Open marketplace disputes</p></Link>
          <Link to="/admin/tenants" className="p-5 transition hover:bg-muted/40"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Tenant controls</span><CircleAlert className={data.tenants.locked > 0 ? "h-4 w-4 text-red-500" : "h-4 w-4 text-emerald-500"} /></div><p className="mt-3 text-xl font-bold">{data.tenants.locked.toLocaleString()}</p><p className="text-xs text-muted-foreground">Locked business tenants</p></Link>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /><h2 className="font-semibold">Financial risk engine</h2></div><p className="mt-1 text-xs text-muted-foreground">Explainable, advisory monitoring of recent wallet movement. No funds are automatically frozen.</p></div>
          <Link to="/admin/transactions" className="text-xs font-semibold text-primary hover:underline">Open monitor →</Link>
        </div>
        {risk === undefined ? <div className="h-24 animate-pulse rounded-2xl bg-muted" /> : risk.alerts.length === 0 ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm"><span className="font-semibold text-emerald-600">No elevated wallet risk detected.</span><span className="ml-2 text-muted-foreground">{risk.scannedTransactions.toLocaleString()} transactions scanned.</span></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{risk.alerts.map((a) => <Link key={a.userId} to="/admin/transactions" className="rounded-2xl border border-border p-4 transition hover:border-primary/30 hover:bg-muted/30"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-muted-foreground">{a.userId.slice(-12)}</span><Badge variant={a.severity === "critical" ? "destructive" : "outline"}>{a.severity.toUpperCase()} · {a.score}</Badge></div><p className="mt-3 text-sm font-semibold">₦{Math.round(a.debitTotal).toLocaleString("en-NG")} debited</p><p className="mt-1 text-xs text-muted-foreground">{a.transactionCount} transactions · largest ₦{Math.round(a.largestDebit).toLocaleString("en-NG")}</p><p className="mt-2 text-xs">{a.reasons[0]}</p></Link>)}</div>}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-1"><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /><h2 className="font-semibold">Finance & risk command center</h2></div><p className="text-xs text-muted-foreground">Live financial movement and risk queues requiring privileged review.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Credits · 24h", ngnValue(data.points.minted), data.points.mintedCount24h.toLocaleString()+" credit events", "/admin/transactions"],
            ["Debits · 24h", ngnValue(data.points.debited24h), data.points.debitedCount24h.toLocaleString()+" debit events", "/admin/transactions"],
            ["Net movement · 24h", ngnValue(data.points.velocity24h), data.points.velocity24h >= 0 ? "Net positive" : "Net negative", "/admin/transactions"],
            ["Risk queues", (data.disputes.open + data.kyc.pending + data.tenants.locked).toLocaleString(), "disputes + KYC + locked tenants", "/admin/audit"],
          ].map(([label,value,sub,to]) => <Link key={label} to={to} className="rounded-2xl border border-border p-4 transition hover:border-primary/30 hover:bg-primary/[0.03]"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{sub}</p></Link>)}
        </div>
      </section>

      <AdminPageHeader title="Platform overview" description="Live metrics from the current production data layer." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => <Link key={m.label} to={m.to} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{m.label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{typeof m.value === "number" ? m.value.toLocaleString() : m.value}</p><p className="mt-1 text-xs text-muted-foreground">{m.sub}</p></Link>)}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-2xl border-border shadow-sm"><CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Wallet activity</h2><p className="text-xs text-muted-foreground">Ledger activity tracked in the current production data layer.</p></div><Link to="/admin/transactions" className="text-xs font-semibold text-primary">View ledger</Link></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ledger events · 7d</p><p className="mt-2 text-2xl font-bold">{data.activity.ledger7d.toLocaleString()}</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net movement · 24h</p><p className="mt-2 text-2xl font-bold">{ngnValue(data.points.velocity24h)}</p></div>
          </div>
        </CardContent></Card>
        <Card className="rounded-2xl border-border shadow-sm"><CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Admin activity</h2><p className="text-xs text-muted-foreground">Use the audit trail for privileged actions.</p></div><Link to="/admin/audit" className="text-xs font-semibold text-primary">Audit trail</Link></div>
          <div className="rounded-xl border border-border p-5"><p className="text-sm text-muted-foreground">Audit events are available in the dedicated audit workspace.</p><p className="mt-2 text-2xl font-bold">{data.users.admins.toLocaleString()} administrators</p></div>
        </CardContent></Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="rounded-2xl border-border shadow-sm"><CardContent className="p-5 sm:p-6">
          <div className="mb-4"><h2 className="font-semibold">Operations pulse</h2><p className="mt-1 text-xs text-muted-foreground">Current workload and recent platform movement.</p></div>
          <div className="space-y-3">
            {[["New users · 7d", data.activity.newUsers7d.toLocaleString(), "/admin/users"], ["Ledger events · 7d", data.activity.ledger7d.toLocaleString(), "/admin/transactions"]].map(([label,value,to]) => <Link key={label} to={to} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 hover:bg-muted/50"><span className="text-sm">{label}</span><span className="font-bold">{value}</span></Link>)}
          </div>
        </CardContent></Card>
        <Card className="rounded-2xl border-border shadow-sm"><CardContent className="p-5 sm:p-6">
          <h2 className="font-semibold">Administrator coverage</h2><p className="mt-1 text-xs text-muted-foreground">Active admin accounts available for privileged operations.</p>
          <p className="mt-5 text-3xl font-bold">{data.users.admins.toLocaleString()}</p>
          <Link to="/admin/administrators" className="mt-3 inline-block text-xs font-semibold text-primary">Manage administrators →</Link>
        </CardContent></Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="overflow-hidden rounded-2xl border-border shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div><h2 className="font-semibold">Live administrator activity</h2><p className="mt-1 text-xs text-muted-foreground">Most recent privileged actions across the platform.</p></div>
              <Link to="/admin/audit" className="text-xs font-semibold text-primary">View all</Link>
            </div>
            <div className="divide-y divide-border">
              {data.activity.recentAudit.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No administrator activity recorded yet.</div>
              ) : data.activity.recentAudit.map((entry) => (
                <div key={entry._id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{entry.action.replaceAll("_", " ")}</p><p className="truncate text-[11px] text-muted-foreground">{entry.actorEmail ?? "Administrator"} · {entry.resource}</p></div>
                  <time className="shrink-0 text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4"><h2 className="font-semibold">Operations pulse</h2><p className="mt-1 text-xs text-muted-foreground">Current workload and 24-hour movement.</p></div>
            <div className="space-y-3">
              {[
                ["New users · 7d", data.activity.newUsers7d.toLocaleString(), "/admin/users"],
                ["Ledger events · 7d", data.activity.ledger7d.toLocaleString(), "/admin/transactions"],
                ["Orders · 24h", data.marketplace.orders24h.toLocaleString(), "/admin/orders"],
                ["Documents · 24h", data.documents.last24h.toLocaleString(), "/admin/documents"],
                ["Open moderation flags", data.moderation.openFlags.toLocaleString(), "/admin/tenants"],
              ].map(([label, value, to]) => (
                <Link key={label} to={to} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 transition hover:border-primary/30 hover:bg-primary/[0.04]">
                  <span className="text-xs text-muted-foreground">{label}</span><span className="text-sm font-bold">{value}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {groups.map((group) => <section key={group.title} className="space-y-3"><h2 className="section-label">{group.title}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{group.items.map((m) => <Link key={m.title} to={m.to}><StatCard title={m.title} value={m.value} icon={m.icon} color={m.color} hint={"hint" in m ? m.hint : undefined} /></Link>)}</div></section>)}
    </div>
  );
}
