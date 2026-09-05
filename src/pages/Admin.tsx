import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingBag, Landmark, Coins, Package, FileText, Truck, Shield } from "lucide-react";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number | string | undefined; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="notebook-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{title}</p>
            {value === undefined ? <Skeleton className="mt-2 h-6 w-16" /> : <p className="mt-1 text-2xl font-bold text-[var(--nb-ink)]">{typeof value === "number" ? value.toLocaleString() : value}</p>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const stats = useQuery(api.points.getStats);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform overview and management.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Users" value={stats?.totalUsers} icon={Users} color="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" />
        <StatCard title="Active Users" value={stats?.activeUsers} icon={Users} color="bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400" />
        <StatCard title="Vendors" value={stats?.vendors} icon={ShoppingBag} color="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400" />
        <StatCard title="Tenants" value={stats?.tenants} icon={Landmark} color="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" />
        <StatCard title="Points Minted" value={stats?.totalPointsMinted} icon={Coins} color="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" />
        <StatCard title="Shipments" value={stats?.shipments} icon={Truck} color="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400" />
        <StatCard title="Documents" value={stats?.documents} icon={FileText} color="bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400" />
        <StatCard title="Products" value={stats?.products} icon={Package} color="bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400" />
      </div>

      {/* Quick Links */}
      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Manage Users", to: "/admin/users", icon: Users },
              { label: "Manage Vendors", to: "/admin/vendors", icon: ShoppingBag },
              { label: "Manage Tenants", to: "/admin/tenants", icon: Landmark },
              { label: "View Analytics", to: "/admin/analytics", icon: Shield },
              { label: "Audit Logs", to: "/admin/audit-logs", icon: FileText },
              { label: "Transactions", to: "/admin/transactions", icon: Coins },
              { label: "Shipments", to: "/admin/shipments", icon: Truck },
              { label: "KYC Reviews", to: "/admin/kyc", icon: Shield },
            ].map((item) => (
              <Link key={item.to} to={item.to} className="flex items-center gap-3 rounded-lg border border-[var(--nb-rule)] p-3 text-sm font-medium text-[var(--nb-ink)] hover:bg-[var(--nb-ink)]/5 transition-colors">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
