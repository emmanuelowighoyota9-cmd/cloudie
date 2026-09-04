import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  User,
  Package,
  FileText,
  Building2,
  Layers,
  ShoppingBag,
  Wallet,
  Users,
  Bell,
  Settings,
  Shield,
  BarChart3,
  ClipboardList,
  Landmark,
  Scale,
  Server,
  ScrollText,
  Truck,
  File,
  CreditCard,
  MessageSquare,
  Image,
  FolderOpen,
  ChevronLeft,
  Cloud,
  TrendingUp,
} from "lucide-react";

const mainNav = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Personal", icon: User, to: "/personal" },
  { label: "Shipments", icon: Package, to: "/shipments" },
  { label: "Ticketing", icon: FileText, to: "/ticketing" },
  { label: "Business Suite", icon: Building2, to: "/business" },
  { label: "Services", icon: Layers, to: "/services" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "Referrals", icon: Users, to: "/referrals" },
  { label: "Notifications", icon: Bell, to: "/notifications" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

const adminNav = [
  { label: "Admin Overview", icon: Shield, to: "/admin" },
  { label: "Users", icon: Users, to: "/admin/users" },
  { label: "Vendors", icon: ShoppingBag, to: "/admin/vendors" },
  { label: "Marketplace", icon: Layers, to: "/admin/marketplace" },
  { label: "Tenants", icon: Landmark, to: "/admin/tenants" },
  { label: "KYC", icon: ClipboardList, to: "/admin/kyc" },
  { label: "Shipments", icon: Truck, to: "/admin/shipments" },
  { label: "Documents", icon: File, to: "/admin/documents" },
  { label: "Transactions", icon: CreditCard, to: "/admin/transactions" },
  { label: "Analytics", icon: BarChart3, to: "/admin/analytics" },
  { label: "Audit Logs", icon: ScrollText, to: "/admin/audit-logs" },
  { label: "Infrastructure", icon: Server, to: "/admin/infrastructure" },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "notebook-sidebar flex h-screen flex-col border-r border-[var(--nb-rule)] bg-[var(--nb-surface)] transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-[var(--nb-rule)] px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Cloud className="h-6 w-6 text-blue-600 dark:text-blue-400 shrink-0" />
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-[var(--nb-ink)]">
              Cloudie
            </span>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="ml-auto hidden lg:flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--nb-ink)]/5"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-1 px-2">
          {mainNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "notebook-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-muted-foreground hover:bg-[var(--nb-ink)]/5 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {isAdmin && (
          <div className="mt-6 px-2">
            <div className={cn(
              "mb-2 text-[10px] font-semibold uppercase tracking-widest",
              collapsed ? "text-center" : "px-3",
              "text-muted-foreground",
            )}>
              {collapsed ? "•" : "Admin"}
            </div>
            <nav className="space-y-1">
              {adminNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.to)
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                      : "text-muted-foreground hover:bg-[var(--nb-ink)]/5 hover:text-foreground",
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
    </aside>
  );
}
