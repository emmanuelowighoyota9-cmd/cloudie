import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminPageHeader, StatCard, AdminSkeleton } from "@/components/admin/shared";
import {
  Activity, AlertTriangle, ArrowRight, BadgeDollarSign, Boxes, Building2,
  ClipboardCheck, Coins, CreditCard, FileText, Gavel, Package, Settings,
  ShieldAlert, ShieldCheck, ShoppingCart, Truck, UserCheck, UserX, Users, Zap
} from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Admin() {
  const data = useQuery(api.adminApi.adminDashboard);
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

      <AdminPageHeader title="Platform overview" description="Live metrics from the current production data layer." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => <Link key={m.label} to={m.to} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{m.label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{typeof m.value === "number" ? m.value.toLocaleString() : m.value}</p><p className="mt-1 text-xs text-muted-foreground">{m.sub}</p></Link>)}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="rounded-2xl border-border shadow-sm"><CardContent className="p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Command actions</h2><p className="text-xs text-muted-foreground">High-value administrative controls.</p></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></div><div className="grid gap-2 sm:grid-cols-2">{actions.map((a) => <Link key={a.to} to={a.to} className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/30 hover:bg-primary/[0.04]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><a.icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{a.label}</span><span className="block truncate text-[11px] text-muted-foreground">{a.description}</span></span></Link>)}</div></CardContent></Card>
        <Card className="rounded-2xl border-border shadow-sm"><CardContent className="p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><div><h2 className="font-semibold">Attention center</h2><p className="text-xs text-muted-foreground">Queues requiring administrator review.</p></div></div><div className="space-y-2">{attention.map((a) => <Link key={a.to} to={a.to} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 hover:bg-muted/50"><span className="text-sm">{a.label}</span><span className={a.danger ? "rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-600" : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-600"}>{a.value.toLocaleString()}</span></Link>)}</div></CardContent></Card>
      </section>

      {groups.map((group) => <section key={group.title} className="space-y-3"><h2 className="section-label">{group.title}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{group.items.map((m) => <Link key={m.title} to={m.to}><StatCard title={m.title} value={m.value} icon={m.icon} color={m.color} hint={"hint" in m ? m.hint : undefined} /></Link>)}</div></section>)}
    </div>
  );
}
