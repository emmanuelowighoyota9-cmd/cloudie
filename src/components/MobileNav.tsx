import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingBag,
  FileText,
  Building2,
  Layers,
  Users,
  Bell,
  Settings,
  Shield,
  CreditCard,
  Wallet,
  Truck,
  Store,
  Receipt,
  FileStack,
  Zap,
  Phone,
  TrendingUp,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "Numbers", icon: Phone, to: "/marketplace/numbers" },
  { label: "Social Boost", icon: TrendingUp, to: "/marketplace/boost" },
  { label: "My Orders", icon: Receipt, to: "/orders" },
  { label: "Buy Points", icon: CreditCard, to: "/buy-points" },
  // Mirrors the desktop sidebar, which already carried this entry. Without it
  // the mobile drawer was the one navigation surface in the customer app with
  // no route to airtime, data or bills at all.
  { label: "Airtime & Data", icon: Zap, to: "/vtu" },
  { label: "Transactions", icon: Wallet, to: "/transactions" },
  { label: "Become Vendor", icon: Store, to: "/vendor" },
  { label: "Referrals", icon: Users, to: "/referrals" },
  { label: "Shipments", icon: Truck, to: "/shipments" },
  { label: "Ticketing", icon: FileText, to: "/ticketing" },
  { label: "Business Suite", icon: Building2, to: "/business" },
  { label: "Documents", icon: FileStack, to: "/documents" },
  { label: "Services", icon: Layers, to: "/services" },
  { label: "Notifications", icon: Bell, to: "/notifications" },
  { label: "Settings", icon: Settings, to: "/settings" },
  { label: "Admin", icon: Shield, to: "/admin" },
];

interface MobileNavProps {
  onNavigate?: () => void;
}

export function MobileNav({ onNavigate }: MobileNavProps) {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Truck className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight text-foreground">Crestline Express</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Mobile navigation">
        {navItems
          .filter((item) => item.label !== "Admin" || isAdmin)
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive(item.to) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
      </nav>
    </div>
  );
}
