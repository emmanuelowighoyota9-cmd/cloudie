import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { cn } from "@/lib/utils";
import { SheetClose } from "@/components/ui/sheet";
import {
  LayoutDashboard, ShoppingBag, FileText, Building2, Layers, Users, Bell,
  Settings, Shield, CreditCard, Wallet, Truck, Store, Receipt, FileStack,
  Zap, Phone, TrendingUp, Wifi, Lightbulb, GraduationCap, Cloud, LogOut,
} from "lucide-react";

/**
 * Grouped the way the work is actually done, rather than as one flat list of
 * nineteen links: a drawer you have to read twice is slower than the page you
 * were trying to reach.
 */
const NAV_GROUPS: { label: string; items: { label: string; icon: typeof Cloud; to: string }[] }[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", icon: LayoutDashboard, to: "/dashboard" },
      { label: "Personal Workspace", icon: Wallet, to: "/personal" },
      { label: "My Services", icon: Layers, to: "/services/my" },
      { label: "Wallet", icon: Wallet, to: "/personal/wallet" },
      { label: "Transactions", icon: Wallet, to: "/transactions" },
      { label: "Billing & Points", icon: CreditCard, to: "/buy-points" },
    ],
  },
  {
    label: "Digital services",
    items: [
      { label: "Digital Services", icon: Zap, to: "/vtu" },
      { label: "Airtime", icon: Phone, to: "/vtu/airtime" },
      { label: "Data", icon: Wifi, to: "/vtu/data" },
      { label: "Electricity", icon: Lightbulb, to: "/vtu/electricity" },
      { label: "Exam pins", icon: GraduationCap, to: "/vtu/exam-pins" },
      { label: "Purchase history", icon: Receipt, to: "/vtu/history" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
      { label: "Numbers", icon: Phone, to: "/marketplace/numbers" },
      { label: "Social Boost", icon: TrendingUp, to: "/marketplace/boost" },
      { label: "My Orders", icon: Receipt, to: "/orders" },
      { label: "Become a Vendor", icon: Store, to: "/vendor" },
      { label: "Referrals", icon: Users, to: "/referrals" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Shipments", icon: Truck, to: "/shipments" },
      { label: "Ticketing", icon: FileText, to: "/ticketing" },
      { label: "Documents", icon: FileStack, to: "/documents" },
      { label: "Business Suite", icon: Building2, to: "/business" },
      { label: "Services", icon: Layers, to: "/services" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Notifications", icon: Bell, to: "/notifications" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];

const ADMIN_ITEMS = [{ label: "Admin", icon: Shield, to: "/admin" }];

interface MobileNavProps {
  onNavigate?: () => void;
}

/**
 * The phone/tablet navigation drawer.
 *
 * Every row closes the drawer on selection — the sheet is unmounted by the
 * parent's `onNavigate`, so a tap never leaves you staring at the menu on top of
 * the page you asked for.
 */
export function MobileNav({ onNavigate }: MobileNavProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { brand } = usePlatformConfig();
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const row = (item: { label: string; icon: typeof Cloud; to: string }) => {
    const active = isActive(item.to);
    return (
      <SheetClose asChild key={item.to}>
        <Link
          to={item.to}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200",
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
              active ? "opacity-100" : "opacity-0",
            )}
          />
          <item.icon className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      </SheetClose>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Cloud className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">
            {brand.name}
          </span>
          <span className="block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Operations
          </span>
        </span>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-0.5">{group.items.map(row)}</div>
          </div>
        ))}

        {isAdmin && (
          <div>
            <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
              Administration
            </p>
            <div className="space-y-0.5">{ADMIN_ITEMS.map(row)}</div>
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            void signOut();
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-error/10 hover:text-error"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
