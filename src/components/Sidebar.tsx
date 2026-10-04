import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ShoppingBag,
  FileText,
  Building2,
  Layers,
  FileStack,
  Users,
  Bell,
  Settings,
  Shield,
  CreditCard,
  Wallet,
  Truck,
  ChevronLeft,
  Cloud,
  Store,
  Receipt,
  Zap,
  Phone,
  TrendingUp,
} from "lucide-react";

const mainNav = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "Numbers", icon: Phone, to: "/marketplace/numbers" },
  { label: "Social Boost", icon: TrendingUp, to: "/marketplace/boost" },
  { label: "My Orders", icon: Receipt, to: "/orders" },
  { label: "Buy Points", icon: CreditCard, to: "/buy-points" },
  { label: "Airtime & Data", icon: Zap, to: "/vtu" },
  { label: "Transactions", icon: Wallet, to: "/transactions" },
  { label: "Become Vendor", icon: Store, to: "/vendor" },
  { label: "Referrals", icon: Users, to: "/referrals" },
  { label: "Shipments", icon: Truck, to: "/shipments" },
  { label: "Documents", icon: FileStack, to: "/documents" },
  { label: "Ticketing", icon: FileText, to: "/ticketing" },
  { label: "Business Suite", icon: Building2, to: "/business" },
  { label: "Services", icon: Layers, to: "/services" },
  { label: "Notifications", icon: Bell, to: "/notifications" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

const adminNav = [
  { label: "Admin Overview", icon: Shield, to: "/admin" },
  { label: "Users", icon: Users, to: "/admin/users" },
  { label: "Vendors", icon: ShoppingBag, to: "/admin/vendors" },
  { label: "Marketplace", icon: Layers, to: "/admin/marketplace" },
  { label: "Tenants", icon: Building2, to: "/admin/tenants" },
  { label: "KYC", icon: FileText, to: "/admin/kyc" },
  { label: "Shipments", icon: Truck, to: "/admin/shipments" },
  { label: "Doc Templates", icon: Layers, to: "/admin/document-templates" },
  { label: "Transactions", icon: CreditCard, to: "/admin/transactions" },
  { label: "Analytics", icon: LayoutDashboard, to: "/admin/analytics" },
  { label: "Audit Logs", icon: Bell, to: "/admin/audit-logs" },
  { label: "Infrastructure", icon: Settings, to: "/admin/infrastructure" },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { brand } = usePlatformConfig();
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) => {
    // `/dashboard` must match exactly, or it would light up on every route
    // nested beneath it.
    if (path === "/dashboard") {
      return location.pathname === path;
    }
    if (path === "/marketplace") {
      return location.pathname === path;
    }
    // `/vtu` is the PARENT of `/vtu/airtime` and `/vtu/bills`, so it matches by
    // prefix — matching exactly would leave those two child pages with no
    // highlighted entry at all. The pages themselves carry their own nav, so
    // the sidebar needs to agree that they are still inside "Airtime & Data",
    // not stand in for it.
    return location.pathname.startsWith(path);
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "U";

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-16" : "w-60",
        "dark:border-border dark:bg-card",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Cloud className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-foreground">
              {brand.name}
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="ml-auto hidden lg:flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* User Profile */}
      {!collapsed && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.name || user?.email || "User"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-0.5 px-2">
          {mainNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium " +
                "transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
                "hover:translate-x-0.5 active:scale-[0.98]",
                isActive(item.to)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-200",
                  isActive(item.to) ? "opacity-100" : "opacity-0",
                )}
              />
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {isAdmin && (
          <div className="mt-4 px-2">
            <div className={cn(
              "mb-1 text-[10px] font-semibold uppercase tracking-widest",
              collapsed ? "text-center" : "px-3",
              "text-muted-foreground",
            )}>
              {collapsed ? "•" : "Admin"}
            </div>
            <nav className="space-y-0.5">
              {adminNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium " +
                "transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
                "hover:translate-x-0.5 active:scale-[0.98]",
                    isActive(item.to)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-200",
                      isActive(item.to) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </ScrollArea>

      {/* Logout */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => signOut()}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
