import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
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
  ChevronLeft,
  Cloud,
  Store,
  Receipt,
} from "lucide-react";

const mainNav = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "My Orders", icon: Receipt, to: "/orders" },
  { label: "Buy Points", icon: CreditCard, to: "/buy-points" },
  { label: "Transactions", icon: Wallet, to: "/transactions" },
  { label: "Become Vendor", icon: Store, to: "/vendor" },
  { label: "Referrals", icon: Users, to: "/referrals" },
  { label: "Shipments", icon: Truck, to: "/shipments" },
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
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "U";

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-60",
        "dark:border-slate-700 dark:bg-slate-800",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-slate-200 dark:border-slate-700 px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
            <Cloud className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Cloudie
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="ml-auto hidden lg:flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* User Profile */}
      {!collapsed && (
        <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-xs font-semibold text-blue-700 dark:text-blue-300">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {user?.name || user?.email || "User"}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200",
              )}
            >
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
              "text-slate-400",
            )}>
              {collapsed ? "•" : "Admin"}
            </div>
            <nav className="space-y-0.5">
              {adminNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.to)
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </ScrollArea>

      {/* Logout */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-2">
        <button
          onClick={() => signOut()}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            "text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400",
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
