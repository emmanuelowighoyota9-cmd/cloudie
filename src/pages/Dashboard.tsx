import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Coins,
  Package,
  FileText,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ShoppingBag,
  Building2,
} from "lucide-react";
import { Link } from "react-router";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string | number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card className="notebook-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="mt-1 text-2xl font-bold text-[var(--nb-ink)]">{value}</p>
            )}
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
  const ledger = useQuery(api.points.getLedger, { limit: 10 });
  const shipments = useQuery(api.shipments.list, {});
  const docs = useQuery(api.documents.list, { limit: 10 });
  const referrals = useQuery(api.referrals.getMyReferrals);

  const isLoading = balance === undefined || ledger === undefined;

  const recentTx = (ledger ?? []).slice(0, 5);
  const recentShipments = (shipments ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's an overview of your Cloudie workspace.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Points Balance"
          value={balance?.toLocaleString() ?? "0"}
          icon={Coins}
          color="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
          loading={isLoading}
        />
        <StatCard
          title="Total Earned"
          value={
            (ledger ?? [])
              .filter((l) => l.amount > 0)
              .reduce((s, l) => s + l.amount, 0)
              .toLocaleString() ?? "0"
          }
          icon={TrendingUp}
          color="bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400"
          loading={isLoading}
        />
        <StatCard
          title="Total Spent"
          value={
            (ledger ?? [])
              .filter((l) => l.amount < 0)
              .reduce((s, l) => s + Math.abs(l.amount), 0)
              .toLocaleString() ?? "0"
          }
          icon={TrendingDown}
          color="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
          loading={isLoading}
        />
        <StatCard
          title="Shipments"
          value={shipments?.length ?? 0}
          icon={Package}
          color="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
          loading={shipments === undefined}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/shipments/new">
          <Card className="notebook-card cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700">
            <CardContent className="flex items-center gap-3 p-4">
              <Package className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">New Shipment</p>
                <p className="text-xs text-muted-foreground">100 pts</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/ticketing/flight">
          <Card className="notebook-card cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700">
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Generate Document</p>
                <p className="text-xs text-muted-foreground">From 80 pts</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/marketplace">
          <Card className="notebook-card cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700">
            <CardContent className="flex items-center gap-3 p-4">
              <ShoppingBag className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium">Marketplace</p>
                <p className="text-xs text-muted-foreground">Browse products</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/business/sites/new">
          <Card className="notebook-card cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700">
            <CardContent className="flex items-center gap-3 p-4">
              <Building2 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium">Create Site</p>
                <p className="text-xs text-muted-foreground">Business Suite</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Transactions */}
        <Card className="notebook-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              Recent Transactions
              <Link to="/personal/transactions">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  View all
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTx.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transactions yet. Points will appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {recentTx.map((tx) => (
                  <div
                    key={tx._id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          tx.amount > 0
                            ? "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                            : "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400"
                        }`}
                      >
                        {tx.amount > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                      </div>
                      <span className="truncate text-[var(--nb-ink)]">{tx.description}</span>
                    </div>
                    <span
                      className={`ml-3 shrink-0 font-semibold ${
                        tx.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Shipments */}
        <Card className="notebook-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              Recent Shipments
              <Link to="/shipments">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  View all
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentShipments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No shipments yet. Create your first shipment.
              </p>
            ) : (
              <div className="space-y-3">
                {recentShipments.map((s) => (
                  <Link
                    key={s._id}
                    to={`/shipments/${s._id}`}
                    className="flex items-center justify-between text-sm rounded-lg p-2 hover:bg-[var(--nb-ink)]/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--nb-ink)]">{s.trackingNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.recipientCity}, {s.recipientCountry}
                      </p>
                    </div>
                    <Badge
                      variant={s.status === "delivered" ? "default" : "secondary"}
                      className="shrink-0 ml-3"
                    >
                      {s.status.replace("_", " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
