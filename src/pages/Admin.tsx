import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminPageHeader, StatCard, AdminSkeleton } from "@/components/admin/shared";
import {
  Boxes,
  Building2,
  ClipboardCheck,
  Coins,
  FileText,
  Gavel,
  Package,
  ShoppingCart,
  Truck,
  UserCheck,
  UserX,
  Users,
  Zap,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePricing } from "@/lib/pricing";

export default function Admin() {
  const data = useQuery(api.adminApi.adminDashboard);
  const { ngnPerPoint } = usePricing();
  const ngnValue = (points: number) => `₦${Math.round(points * ngnPerPoint).toLocaleString("en-NG")}`;

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Admin Dashboard" description="Platform overview and management." />
        <AdminSkeleton rows={4} />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Admin Dashboard" description="Platform overview and management." />
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground">Admin access required</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This console is limited to active admin accounts. Use an admin account or return to the main workspace.
              </p>
            </div>
            <Link to="/dashboard">
              <Button variant="outline">Back to app</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metricGroups = [
    {
      title: "Users",
      items: [
        { title: "Total Users", value: data.users.total, icon: Users, color: "blue" as const, to: "/admin/users" },
        { title: "Active Users", value: data.users.active, icon: UserCheck, color: "green" as const, to: "/admin/users" },
        { title: "Suspended", value: data.users.suspended, icon: UserX, color: "red" as const, to: "/admin/users" },
      ],
    },
    {
      title: "Points Economy",
      items: [
        { title: "Points Issued", value: data.points.minted, icon: Coins, color: "blue" as const, to: "/admin/transactions", hint: ngnValue(data.points.minted) },
        { title: "Points Burned", value: data.points.burned, icon: Coins, color: "amber" as const, to: "/admin/transactions", hint: ngnValue(data.points.burned) },
        { title: "Velocity (24h)", value: data.points.velocity24h, icon: Zap, color: "purple" as const, to: "/admin/transactions" },
      ],
    },
    {
      title: "Marketplace",
      items: [
        { title: "Total Vendors", value: data.vendors.total, icon: Boxes, color: "purple" as const, to: "/admin/vendors" },
        { title: "Pending Vendors", value: data.vendors.pending, icon: Boxes, color: "amber" as const, to: "/admin/vendors" },
        { title: "Orders", value: data.marketplace.orders, icon: ShoppingCart, color: "blue" as const, to: "/admin/orders" },
        { title: "Escrow Pending", value: data.marketplace.escrowPending, icon: Package, color: "amber" as const, to: "/admin/orders" },
        { title: "Open Disputes", value: data.disputes.open, icon: Gavel, color: "red" as const, to: "/admin/disputes" },
      ],
    },
    {
      title: "Operations",
      items: [
        { title: "Active Shipments", value: data.shipments.active, icon: Truck, color: "blue" as const, to: "/admin/shipments" },
        { title: "Delivered", value: data.shipments.delivered, icon: Truck, color: "green" as const, to: "/admin/shipments" },
        { title: "Documents (24h)", value: data.documents.last24h, icon: FileText, color: "indigo" as const, to: "/admin/documents" },
        { title: "Active Tenants", value: data.tenants.active, icon: Building2, color: "amber" as const, to: "/admin/tenants" },
        { title: "Locked Tenants", value: data.tenants.locked, icon: Building2, color: "red" as const, to: "/admin/tenants" },
        { title: "Pending KYC", value: data.kyc.pending, icon: ClipboardCheck, color: "amber" as const, to: "/admin/kyc" },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Real-time platform metrics. Every number reflects live database state."
      />

      {metricGroups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{group.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.items.map((m) => (
              <Link key={m.title} to={m.to}>
                <StatCard title={m.title} value={m.value} icon={m.icon} color={m.color} hint={"hint" in m ? (m.hint as string | undefined) : undefined} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
