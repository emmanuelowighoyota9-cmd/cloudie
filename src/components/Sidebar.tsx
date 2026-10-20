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
  Receipt,
  Zap,
  LogOut,
  Coins,
  type LucideIcon,
} from "lucide-react";

/**
 * The signed-in navigation index.
 *
 * Exported because the command palette (`AppSearch`) offers the same
 * destinations: one list, so a page can never be reachable from the sidebar but
 * invisible to search (or the reverse).
 */
/* eslint-disable react-refresh/only-export-components -- these two arrays are
   the navigation contract: `AppSearch` offers exactly the destinations the
   sidebar renders, and the navigation tests assert on this file's literal
   entries. Splitting them into a second module would duplicate the contract. */
export const mainNav = [
  { label: "Overview", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Personal Workspace", icon: Wallet, to: "/personal" },
  { label: "My Services", icon: Layers, to: "/services/my" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "My Orders", icon: Receipt, to: "/orders" },
  { label: "Wallet", icon: Wallet, to: "/personal/wallet" },
  { label: "Credits", icon: Coins, to: "/personal/wallet" },
  { label: "Billing", icon: CreditCard, to: "/billing" },
  { label: "Digital Services", icon: Zap, to: "/vtu" },
  { label: "Shipments", icon: Truck, to: "/shipments" },
  { label: "Documents", icon: FileStack, to: "/documents" },
  { label: "Ticketing", icon: FileText, to: "/ticketing" },
  { label: "Business Suite", icon: Building2, to: "/business" },
  { label: "Services", icon: Layers, to: "/services" },
  { label: "Notifications", icon: Bell, to: "/notifications" },
  { label: "Referrals", icon: Users, to: "/referrals" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

export const adminNav = [
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
    // `/services` is also a prefix of `/services/my`, so it matches exactly too
    // — otherwise two sidebar entries claim the same page.
    if (path === "/services") {
      return location.pathname === path;
    }
    // `/vtu` is the PARENT of `/vtu/airtime` and `/vtu/bills`, so it matches by
    // prefix — matching exactly would leave those two child pages with no
    // highlighted entry at all. The pages themselves carry their own nav, so
    // the sidebar needs to agree that they are still inside "Digital Services",
    // not stand in for it.
    return location.pathname.startsWith(path);
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "U";

  /** One nav row. Collapsed, the label becomes a tooltip rather than being cut. */
  const navItem = (item: { label: string; icon: LucideIcon; to: string }) => {
    const active = isActive(item.to);
    return (
      <Link
        key={item.to}
        to={item.to}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex min-h-11 items-center rounded-xl text-sm font-medium",
          "transition-[background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "justify-center px-0" : "gap-3 px-3",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {/* The active indicator is a shape, not just a colour, so the current
            page is still obvious without relying on hue alone. */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-200",
            active ? "opacity-100" : "opacity-0",
          )}
        />
        <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const groupLabel = (label: string) => (
    <p
      className={cn(
        "px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70",
        collapsed && "text-center text-[9px] tracking-normal",
      )}
    >
      {collapsed ? "•••" : label}
    </p>
  );

  return (
    <aside
      aria-label="Workspace"
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      {/* Brand + collapse control */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        )}
      >
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${brand.name} home`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Cloud className="size-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">
                {brand.name}
              </span>
              <span className="block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Operations
              </span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            aria-pressed={false}
            className="ml-auto hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      {/* Account */}
      {!collapsed && (
        <div className="shrink-0 border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {user?.name || user?.email || "User"}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {user?.email || ""}
              </span>
            </span>
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <nav className="px-2 pb-3" aria-label="Main">
          {groupLabel("Workspace")}
          <div className="space-y-0.5">{mainNav.map(navItem)}</div>

          {isAdmin && (
            <>
              {groupLabel("Administration")}
              <div className="space-y-0.5">{adminNav.map(navItem)}</div>
            </>
          )}
        </nav>
      </ScrollArea>

      {/* Sign out stays pinned to the bottom: it must never need a scroll to
          reach, on a short laptop viewport especially. */}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={() => signOut()}
          title={collapsed ? "Sign out" : undefined}
          aria-label="Sign out"
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-muted-foreground",
            "transition-colors duration-200 hover:bg-error/10 hover:text-error",
            collapsed ? "justify-center px-0" : "gap-3 px-3",
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="mt-1 hidden min-h-11 w-full items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
          >
            <ChevronLeft className="size-4 rotate-180" />
          </button>
        )}
      </div>
    </aside>
  );
}
