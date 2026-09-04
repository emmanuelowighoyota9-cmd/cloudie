import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Users, Coins, Truck, FileText, ShoppingBag, Mail } from "lucide-react";

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: number | undefined; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        {value === undefined ? <Skeleton className="mt-1 h-5 w-12" /> : <p className="text-lg font-bold text-[var(--nb-ink)]">{value.toLocaleString()}</p>}
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const analytics = useQuery(api.admin.getAnalytics);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform-wide metrics and insights.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Users" value={analytics?.totalUsers} icon={Users} color="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" />
        <MetricCard label="Active Users" value={analytics?.activeUsers} icon={Users} color="bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400" />
        <MetricCard label="Points Minted" value={analytics?.pointsMinted} icon={Coins} color="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" />
        <MetricCard label="Points Burned" value={analytics?.pointsBurned} icon={Coins} color="bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400" />
        <MetricCard label="Points in Circulation" value={analytics?.pointsInCirculation} icon={Coins} color="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" />
        <MetricCard label="Shipments" value={analytics?.totalShipments} icon={Truck} color="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400" />
        <MetricCard label="Documents" value={analytics?.totalDocuments} icon={FileText} color="bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400" />
        <MetricCard label="Marketplace Orders" value={analytics?.totalOrders} icon={ShoppingBag} color="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400" />
      </div>

      {/* Last 7 Days */}
      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Last 7 Days</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="text-center p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
              <p className="text-3xl font-bold text-blue-600">{analytics?.last7Days.newUsers ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">New Users</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
              <p className="text-3xl font-bold text-indigo-600">{analytics?.last7Days.shipments ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Shipments</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
              <p className="text-3xl font-bold text-rose-600">{analytics?.last7Days.documents ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Documents</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Health */}
      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Platform Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-center">
            <div><p className="text-2xl font-bold text-[var(--nb-ink)]">{analytics?.totalVendors ?? 0}</p><p className="text-xs text-muted-foreground">Vendors</p></div>
            <div><p className="text-2xl font-bold text-[var(--nb-ink)]">{analytics?.approvedVendors ?? 0}</p><p className="text-xs text-muted-foreground">Approved Vendors</p></div>
            <div><p className="text-2xl font-bold text-[var(--nb-ink)]">{analytics?.totalTenants ?? 0}</p><p className="text-xs text-muted-foreground">Tenant Sites</p></div>
            <div><p className="text-2xl font-bold text-[var(--nb-ink)]">{analytics?.totalProducts ?? 0}</p><p className="text-xs text-muted-foreground">Products</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
