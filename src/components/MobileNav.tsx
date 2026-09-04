import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Cloud } from "lucide-react";
import {
  LayoutDashboard,
  User,
  Package,
  FileText,
  Building2,
  Layers,
  ShoppingBag,
  Users,
  Bell,
  Settings,
  Shield,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Personal", icon: User, to: "/personal" },
  { label: "Shipments", icon: Package, to: "/shipments" },
  { label: "Ticketing", icon: FileText, to: "/ticketing" },
  { label: "Business", icon: Building2, to: "/business" },
  { label: "Services", icon: Layers, to: "/services" },
  { label: "Marketplace", icon: ShoppingBag, to: "/marketplace" },
  { label: "Referrals", icon: Users, to: "/referrals" },
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
    <div className="flex h-full flex-col bg-[var(--nb-surface)]">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--nb-rule)] px-4">
        <Cloud className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <span className="text-lg font-bold text-[var(--nb-ink)]">Cloudie</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
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
                  : "text-muted-foreground hover:bg-[var(--nb-ink)]/5",
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
