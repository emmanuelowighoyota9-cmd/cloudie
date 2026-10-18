import { StaggerGroup, StaggerItem } from "@/components/motion";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coins,
  Package,
  Users,
  TrendingUp,
  ArrowUpRight,
  ShoppingBag,
  Building2,
  FileText,
  Layers,
  FileStack,
  Receipt,
  LifeBuoy,
  Search,
  Sparkles,
  Smartphone,
  Wifi,
  Zap,
  Tv,
  GraduationCap,
  Truck,
  MoreHorizontal,
  Plus,
  ArrowDownLeft,
  Bell,
  WalletCards,
  ChevronRight,
  Activity,
  CircleCheck,
  Clock3,
} from "lucide-react";
import { Link } from "react-router";
import { usePricing } from "@/lib/pricing";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { formatNgn } from "@/lib/pricing";
import {
  QUICK_ACTION_CATALOG,
  type QuickActionKind,
} from "@/lib/platformConfig";

function numericAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [
      "wallet_balance_ngn",
      "amountNgn",
      "ngnEquivalent",
      "amount",
      "balance",
      "walletAmount",
      "ngn",
      "amount_ngn",
    ];
    for (const key of candidates) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate as number;
      if (typeof candidate === "string") {
        const parsed = Number(candidate.trim());
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function displayName(value?: string | null) {
  const clean = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!clean) return "friend";
  return clean
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const QUICK_ACTION_ICONS: Record<
  QuickActionKind,
  React.ComponentType<{ className?: string }>
> = {
  shipment: Package,
  points: Coins,
  document: FileStack,
  orders: Receipt,
  tracking: Search,
  wallet: Building2,
  marketplace: ShoppingBag,
  support: LifeBuoy,
};

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  /** `undefined` means the subscription has not answered yet. */
  value: string | number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {value === undefined ? (
              /* Still loading: a placeholder, never a zero. Showing 0 while the
                 subscription is in flight reads as a real balance of nothing. */
              <span
                aria-hidden
                className="mt-2 block h-7 w-14 animate-pulse rounded bg-surface-2"
              />
            ) : (
              <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${color}`}
          >
            <Icon className="size-5" />
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
  const walletAmount = numericAmount(balance);
  const ledger = useQuery(api.wallet.getLedger, { limit: 100 });
  const shipments = useQuery(api.trackingUser.myShipments, {});
  const referrals = useQuery(api.referrals.getMyReferrals);
  const orders = useQuery(api.marketplace.getMyOrders);
  const unreadNotifications = useQuery(api.notifications.unreadCount);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const monthlyTransactions = (ledger ?? []).filter(
    (l) => l.createdAt >= thisMonth.getTime(),
  ).length;
  const recentTx = (ledger ?? []).slice(0, 5);
  const activeOrders = (orders ?? []).filter(
    (o) => !["completed", "cancelled", "refunded"].includes(o.status),
  ).length;

  return (
    <div className="cloudie-dashboard space-y-6 sm:space-y-8">
      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <CardContent className="p-5 sm:p-7">
          {" "}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Cloudie Command Center
                </p>
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Welcome back, {displayName(user?.name)}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Your personal workspace connects points activity, orders, notifications and tools. Switch into shipments, ticketing, Business Suite or services whenever you need them.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/notifications"
                className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
                aria-label="Notifications"
              >
                <Bell className="size-5" />
                {(unreadNotifications ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-foreground">
                    {unreadNotifications}
                  </span>
                )}
              </Link>
              <Button asChild className="gap-2">
                <Link to="/buy-points">
                  <Plus className="size-4" /> Fund wallet
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </section>

      <nav
        aria-label="Quick actions"
        className="grid grid-cols-4 gap-2 sm:hidden"
      >
        {quickActions.map((action) => {
          const catalogItem = QUICK_ACTION_CATALOG.find(
            (item) => item.kind === action.kind,
          );
          if (!catalogItem) return null;
          const Icon = QUICK_ACTION_ICONS[action.kind];
          return (
            <Link
              key={action.kind}
              to={catalogItem.path}
              className="group flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-1.5 py-2 text-center shadow-sm"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="max-w-full truncate text-[10px] font-semibold text-foreground">
                {action.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <Card className="overflow-hidden border-primary/15 bg-card">
        <div className="cloudie-wallet-strip h-1.5" />
        <CardContent className="p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="cloudie-wallet-icon flex size-14 items-center justify-center rounded-2xl shadow-lg">
                <Coins className="size-7 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Available wallet
                </p>
                {/* `undefined` = still loading; `null` = no wallet row yet, which
                    is a real zero rather than an unknown. */}
                {balance === undefined ? (
                  <span
                    aria-hidden
                    className="mt-2 block h-9 w-40 animate-pulse rounded-lg bg-surface-2"
                  />
                ) : (
                  <p className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {formatNgn(balance)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Ready for Cloudie services
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Link
                to="/personal/wallet"
                className="rounded-xl border border-border bg-card p-3 hover:bg-muted"
              >
                <WalletCards className="size-4 text-primary" />
                <p className="mt-2 text-[10px] text-muted-foreground">Wallet</p>
                <p className="text-xs font-bold">Manage</p>
              </Link>
              <Link
                to="/transactions"
                className="rounded-xl border border-border bg-card p-3 hover:bg-muted"
              >
                <Activity className="size-4 text-primary" />
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Activity
                </p>
                <p className="text-xs font-bold">
                  {ledger === undefined
                    ? "Loading…"
                    : `${monthlyTransactions} this month`}
                </p>
              </Link>
              <Link
                to="/orders"
                className="rounded-xl border border-border bg-card p-3 hover:bg-muted"
              >
                <Receipt className="size-4 text-primary" />
                <p className="mt-2 text-[10px] text-muted-foreground">Orders</p>
                <p className="text-xs font-bold">
                  {orders === undefined ? "Loading…" : `${activeOrders} active`}
                </p>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Pay & manage</h2>
            <p className="text-xs text-muted-foreground">
              Your most-used services, one tap away.
            </p>
          </div>
          <Link
            to="/services/my"
            className="text-xs font-semibold text-primary"
          >
            View all
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {[
            { label: "Airtime", icon: Smartphone, to: "/vtu/airtime" },
            { label: "Data", icon: Wifi, to: "/vtu/data" },
            { label: "Electricity", icon: Zap, to: "/vtu/electricity" },
            { label: "TV", icon: Tv, to: "/vtu/bills" },
            { label: "Exam", icon: GraduationCap, to: "/vtu/exam-pins" },
            { label: "Ship", icon: Truck, to: "/shipments/new" },
            { label: "Market", icon: ShoppingBag, to: "/marketplace" },
            { label: "More", icon: MoreHorizontal, to: "/services/my" },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="group flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <item.icon className="size-4" />
              </span>
              <span className="truncate text-[10px] font-semibold text-foreground">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <StaggerGroup className="grid gap-3 sm:grid-cols-3">
        <StaggerItem>
          <MetricCard
            title="Shipments"
            value={shipments?.length}
            icon={Package}
            color="bg-primary/10 text-primary"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="Referrals"
            value={referrals?.length}
            icon={Users}
            color="bg-primary/10 text-primary"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="Transactions this month"
            value={ledger === undefined ? undefined : monthlyTransactions}
            icon={TrendingUp}
            color="bg-primary/10 text-primary"
          />
        </StaggerItem>
      </StaggerGroup>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/70 pb-4">
            <div>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest wallet movements.
              </p>
            </div>
            <Link
              to="/transactions"
              className="text-xs font-semibold text-primary"
            >
              See all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentTx.length === 0 ? (
              <div className="p-7 text-center">
                <Receipt className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium">No activity yet</p>
              </div>
            ) : (
              recentTx.map((tx) => (
                <div
                  key={tx._id}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tx.amountNgn >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}
                  >
                    {tx.amountNgn >= 0 ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {tx.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {typeLabel(tx.type)} · {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${tx.amountNgn >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-foreground"}`}
                  >
                    {tx.amountNgn >= 0 ? "+" : ""}₦{Math.abs(tx.amountNgn).toLocaleString("en-NG")}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Cloudie shortcuts</p>
                <p className="text-xs text-muted-foreground">
                  Get back to work faster.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Link
                to="/vtu/history"
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted"
              >
                <CircleCheck className="size-4 text-primary" />
                <span className="flex-1 text-xs font-semibold">VTU history</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/orders"
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted"
              >
                <Clock3 className="size-4 text-primary" />
                <span className="flex-1 text-xs font-semibold">Track orders</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/services/my"
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted"
              >
                <Sparkles className="size-4 text-primary" />
                <span className="flex-1 text-xs font-semibold">Manage services</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/notifications"
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted"
              >
                <Bell className="size-4 text-primary" />
                <span className="flex-1 text-xs font-semibold">Notifications</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <Link to="/shipments/new">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <Package className="size-5 text-primary" />
                <div>
                  <p className="font-medium">New Shipment</p>
                  <p className="text-xs text-muted-foreground">{shipmentPrice.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link to="/ticketing/flight">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="size-5 text-primary" />
                <div>
                  <p className="font-medium">Generate Document</p>
                  <p className="text-xs text-muted-foreground">From {invoicePrice.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link to="/marketplace">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <Layers className="size-5 text-primary" />
                <div>
                  <p className="font-medium">Marketplace</p>
                  <p className="text-xs text-muted-foreground">Browse products</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link to="/business/sites/new">
            <Card className="interactive-card h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <Building2 className="size-5 text-primary" />
                <div>
                  <p className="font-medium">Create Site</p>
                  <p className="text-xs text-muted-foreground">Business Suite</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </StaggerItem>
      </StaggerGroup>

      <Card>
        <CardHeader>
          <CardTitle className="section-label">Your Workspaces</CardTitle>
          <p className="text-xs text-muted-foreground">Everything else lives in one of these.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                icon: FileStack,
                title: "Documents",
                desc: "Generate branded documents.",
                to: "/documents",
              },
              {
                icon: Package,
                title: "Shipments",
                desc: "Create and track parcels.",
                to: "/shipments",
              },
              {
                icon: FileText,
                title: "Ticketing",
                desc: "Flights, hotels and invoices.",
                to: "/ticketing",
              },
              {
                icon: Building2,
                title: "Business Suite",
                desc: "Business and banking sites.",
                to: "/business",
              },
              {
                icon: Layers,
                title: "Services",
                desc: "Email, renders and tools.",
                to: "/services",
              },
            ].map((w) => (
              <Link
                key={w.to}
                to={w.to}
                className="group rounded-2xl border border-border p-4 transition hover:border-primary/30 hover:bg-primary/[0.025]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <w.icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{w.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{w.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            {!orders ? (
              <p className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading...</p>
            ) : orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 5).map((o) => (
                  <Link
                    to="/orders"
                    key={o._id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">Order #{o._id.slice(-8)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{(o.totalNgn ?? o.totalPoints * 15).toLocaleString("en-NG")} NGN</p>
                      <Badge className={`mt-1 ${statusColor(o.status)} border-0 text-[10px] capitalize`}>{o.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Need help?</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <LifeBuoy className="size-5 text-primary" />
              <div>
                <p className="font-semibold">Cloudie Support</p>
                <p className="text-xs text-muted-foreground">Get help with payments, orders or services.</p>
              </div>
            </div>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/billing">Open account center</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
function typeLabel(type: string) {
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
function statusColor(status: string) {
  const colors: Record<string, string> = {
    pending:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
    completed:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
    refunded:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
    disputed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    cancelled:
      "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
  };
  return colors[status] ?? "bg-slate-100 text-slate-700";
}
