import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, Package, Users, TrendingUp, TrendingDown, ArrowUpRight, ShoppingBag, Building2, FileText, Layers } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";

function MetricCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const balance = useQuery(api.points.getBalance);
  const ledger = useQuery(api.points.getLedger, { limit: 100 });
  const shipments = useQuery(api.shipments.list, {});
  const docs = useQuery(api.documents.list, { limit: 20 });
  const referrals = useQuery(api.referrals.getMyReferrals);
  const orders = useQuery(api.marketplace.getMyOrders);
  const [search, setSearch] = useState("");

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const monthlyTransactions = (ledger ?? []).filter((l) => l.createdAt >= thisMonth.getTime()).length;
  const recentTx = (ledger ?? []).slice(0, 5);
  const recentDocs = (docs ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Here's an overview of your Cloudie workspace.
        </p>
      </div>

      {/* Hero Points Card */}
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2">
          <div className="h-1.5 w-32 bg-white/30 rounded-full" />
        </div>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg">
                <Coins className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Points Balance</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{balance?.toLocaleString() ?? 0}</p>
                <p className="text-xs text-slate-500 mt-0.5">Cloudie Points</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/buy-points">
                <Button className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6">
                  <ShoppingBag className="h-4 w-4" /> Buy Points
                </Button>
              </Link>
              <Link to="/settings">
                <Button variant="outline" className="gap-2">Guide</Button>
              </Link>
              <Button variant="outline">Get Help</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Shipments"
          value={shipments?.length ?? 0}
          icon={Package}
          color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <MetricCard
          title="Referrals"
          value={referrals?.length ?? 0}
          icon={Users}
          color="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
        <MetricCard
          title="Transactions This Month"
          value={monthlyTransactions}
          icon={TrendingUp}
          color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/shipments/new">
          <Card className="h-full hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">New Shipment</p>
                <p className="text-xs text-slate-500">100 pts</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/ticketing/flight">
          <Card className="h-full hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30">
                <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Generate Document</p>
                <p className="text-xs text-slate-500">From 80 pts</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/marketplace">
          <Card className="h-full hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
                <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Marketplace</p>
                <p className="text-xs text-slate-500">Browse products</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/business/sites/new">
          <Card className="h-full hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/30">
                <Building2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Create Site</p>
                <p className="text-xs text-slate-500">Business Suite</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Workspace Hub */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Your Workspaces
          </CardTitle>
          <p className="text-xs text-slate-400">Everything else lives in one of these.</p>
        </CardHeader>
        <CardContent className="p-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Package, title: "Shipments", desc: "Create and track parcels end to end.", to: "/shipments", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
              { icon: FileText, title: "Ticketing", desc: "Flights, hotels, invoices and receipts.", to: "/ticketing", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
              { icon: Building2, title: "Business Suite", desc: "Spin up and manage your bank and investment sites.", to: "/business", color: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
              { icon: Layers, title: "Services", desc: "Small tools that stand on their own, email and pictures.", to: "/services", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
            ].map((w) => (
              <Link key={w.to} to={w.to} className="group">
                <Card className="h-full hover:border-blue-300 dark:hover:border-blue-700 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${w.color}`}>
                        <w.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{w.title}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{w.desc}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTx.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {recentTx.map((tx) => (
                  <div key={tx._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{tx.description}</p>
                      <p className="text-xs text-slate-400">{typeLabel(tx.type)} • {new Date(tx.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-sm font-bold ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!orders ? (
              <p className="py-8 text-center text-sm text-slate-400 animate-pulse">Loading...</p>
            ) : orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No orders yet.</p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 5).map((o) => (
                  <div key={o._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Order #{o._id.slice(-8)}</p>
                      <p className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-600">{o.totalPoints.toLocaleString()} pts</p>
                      <Badge className={`mt-1 ${statusColor(o.status)} border-0 text-[10px] capitalize`}>{o.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    deposit: "Deposit",
    purchase: "Purchase",
    service_charge: "Service",
    refund: "Refund",
    admin_adjustment: "Admin",
    referral_reward: "Referral",
    vendor_transaction: "Vendor",
    marketplace_purchase: "Marketplace",
    shipment_creation: "Shipment",
    document_generation: "Document",
    email_dispatch: "Email",
    image_rendering: "Render",
  };
  return labels[type] ?? type;
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
    refunded: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
    disputed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
  };
  return colors[status] ?? "bg-slate-100 text-slate-700";
}
