import { StaggerGroup, StaggerItem } from "@/components/motion";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, Package, Users, TrendingUp, ArrowUpRight, ShoppingBag, Building2, FileText, Layers, FileStack, Receipt, LifeBuoy, Search } from "lucide-react";
import { Link } from "react-router";
import { usePricing } from "@/lib/pricing";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { QUICK_ACTION_CATALOG, type QuickActionKind } from "@/lib/platformConfig";

const QUICK_ACTION_ICONS: Record<QuickActionKind, React.ComponentType<{ className?: string }>> = {
  shipment: Package,
  points: Coins,
  document: FileStack,
  orders: Receipt,
  tracking: Search,
  wallet: Building2,
  marketplace: ShoppingBag,
  support: LifeBuoy,
};

function MetricCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
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
  const { price } = usePricing();
  const { quickActions } = usePlatformConfig();
  const shipmentPrice = price("shipment_create", 100);
  const invoicePrice = price("commercial_invoice", 80);
  const { user } = useAuth();
  const balance = useQuery(api.wallet.getBalance);
  const ledger = useQuery(api.wallet.getLedger, { limit: 100 });
  const shipments = useQuery(api.trackingUser.myShipments, {});
  const referrals = useQuery(api.referrals.getMyReferrals);
  const orders = useQuery(api.marketplace.getMyOrders);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const monthlyTransactions = (ledger ?? []).filter((l) => l.createdAt >= thisMonth.getTime()).length;
  const recentTx = (ledger ?? []).slice(0, 5);

  return (
    <div className="space-y-7 sm:space-y-9">
      {/* Welcome */}
      <div>
        <h1 className="page-title text-foreground">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="page-subtitle">
          Here's an overview of your Cloudie Operations workspace.
        </p>
      </div>

      <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2 sm:hidden">
        {quickActions.map((action) => {
          const catalogItem = QUICK_ACTION_CATALOG.find((item) => item.kind === action.kind);
          if (!catalogItem) return null;
          const Icon = QUICK_ACTION_ICONS[action.kind];
          return (
            <Link
              key={action.kind}
              to={catalogItem.path}
              className="group flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-1.5 py-2 text-center shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.98]"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Icon className="size-4" />
              </span>
              <span className="max-w-full truncate text-[10px] font-semibold text-foreground">{action.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Hero Points Card */}
      <Card className="overflow-hidden border border-primary/10 bg-card shadow-[0_24px_60px_-38px_hsl(var(--primary)/0.55)]">
        <div className="bg-primary/95 px-6 py-2">
          <div className="h-1.5 w-32 bg-white/30 rounded-full" />
        </div>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg">
                <Coins className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground dark:text-slate-400">NGN Wallet Balance</p>
                <p className="mt-0.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">₦{(balance ?? 0).toLocaleString("en-NG")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Nigerian Naira wallet</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/personal/wallet">
                <Button className="gap-2 bg-primary hover:from-blue-700 hover:to-indigo-700 px-6">
                  <ShoppingBag className="h-4 w-4" /> Fund Wallet
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
      <StaggerGroup className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <MetricCard
            title="Shipments"
            value={shipments?.length ?? 0}
            icon={Package}
            color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="Referrals"
            value={referrals?.length ?? 0}
            icon={Users}
            color="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="Transactions This Month"
            value={monthlyTransactions}
            icon={TrendingUp}
            color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
        </StaggerItem>
      </StaggerGroup>

      {/* Quick Actions */}
      <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <Link to="/shipments/new">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">New Shipment</p>
                  <p className="text-xs text-muted-foreground">{shipmentPrice.label}</p>
                </div>
                <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link to="/ticketing/flight">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30">
                  <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Generate Document</p>
                  <p className="text-xs text-muted-foreground">From {invoicePrice.label}</p>
                </div>
                <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link to="/marketplace">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
                  <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Marketplace</p>
                  <p className="text-xs text-muted-foreground">Browse products</p>
                </div>
                <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link to="/business/sites/new">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/30">
                  <Building2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Create Site</p>
                  <p className="text-xs text-muted-foreground">Business Suite</p>
                </div>
                <ArrowUpRight className="ml-auto h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
      </StaggerGroup>

      {/* Workspace Hub */}
      <Card>
        <CardHeader>
          <CardTitle className="section-label">
            Your Workspaces
          </CardTitle>
          <p className="text-xs text-slate-400">Everything else lives in one of these.</p>
        </CardHeader>
        <CardContent className="p-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: FileStack, title: "Documents", desc: "Generate branded PDFs and images from dynamic templates.", to: "/documents", color: "bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" },
              { icon: Package, title: "Shipments", desc: "Create and track parcels end to end.", to: "/shipments", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
              { icon: FileText, title: "Ticketing", desc: "Flights, hotels, invoices and receipts.", to: "/ticketing", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
              { icon: Building2, title: "Business Suite", desc: "Spin up and manage your bank and investment sites.", to: "/business", color: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
              { icon: Layers, title: "Services", desc: "Small tools that stand on their own, email and pictures.", to: "/services", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
            ].map((w) => (
              <Link key={w.to} to={w.to} className="group">
                <Card className="interactive-card h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${w.color}`}>
                        <w.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground">{w.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground dark:text-slate-400">{w.desc}</p>
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
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
                      <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                      <p className="text-xs text-slate-400">{typeLabel(tx.type)} • {new Date(tx.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-sm font-bold ${tx.amountNgn > 0 ? "text-green-600" : "text-red-600"}`}>
                      {tx.amountNgn > 0 ? "+" : ""}₦{Math.abs(tx.amountNgn).toLocaleString("en-NG")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
                      <p className="text-sm font-medium text-foreground">Order #{o._id.slice(-8)}</p>
                      <p className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-600">₦{(o.totalNgn ?? o.totalPoints * 15).toLocaleString("en-NG")}</p>
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
