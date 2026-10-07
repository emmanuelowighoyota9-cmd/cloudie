import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingBag, FileText, Building2, Layers, Users, Bell,
  Settings, Shield, CreditCard, Wallet, Truck, Store, Receipt, FileStack,
  Zap, Phone, TrendingUp, Wifi, Lightbulb, GraduationCap,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "Numbers", icon: Phone, to: "/marketplace/numbers" },
  { label: "Social Boost", icon: TrendingUp, to: "/marketplace/boost" },
  { label: "My Orders", icon: Receipt, to: "/orders" },
  { label: "Fund Wallet", icon: CreditCard, to: "/buy-points" },
  { label: "Airtime & Data", icon: Zap, to: "/vtu" },
  { label: "Data", icon: Wifi, to: "/vtu/data" },
  { label: "Electricity", icon: Lightbulb, to: "/vtu/electricity" },
  { label: "Exam Pins", icon: GraduationCap, to: "/vtu/exam-pins" },
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

interface MobileNavProps { onNavigate?: () => void; }

export function MobileNav({ onNavigate }: MobileNavProps) {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) =>
    path === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-card/70 px-4 backdrop-blur-xl">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CloudieMark />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight text-foreground">Cloudie</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3" aria-label="Mobile navigation">
        {navItems.filter((item) => item.label !== "Admin" || isAdmin).map((item) => (
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

function CloudieMark() {
  return (
    <span aria-hidden className="text-sm font-black tracking-tight">C</span>
  );
}
