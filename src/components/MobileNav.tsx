import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Cloud } from "lucide-react";
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
} from "lucide-react";

const navItems = [
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
    <div className="flex h-full flex-col bg-white dark:bg-slate-800">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
          <Cloud className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-900 dark:text-white">Cloudie</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        {navItems
          .filter((item) => item.label !== "Admin" || isAdmin)
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50",
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
