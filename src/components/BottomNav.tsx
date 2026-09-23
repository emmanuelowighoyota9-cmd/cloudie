import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { Home, CreditCard, Truck, FileText, Building2, FileStack } from "lucide-react";

const navItems = [
  { label: "Home", icon: Home, to: "/dashboard" },
  { label: "Buy Points", icon: CreditCard, to: "/buy-points" },
  { label: "Shipments", icon: Truck, to: "/shipments" },
  { label: "Docs", icon: FileStack, to: "/documents" },
  { label: "Tickets", icon: FileText, to: "/ticketing" },
  { label: "SaaS", icon: Building2, to: "/business" },
];

export function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 lg:hidden">
      <div className="flex items-center justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors min-w-[48px]",
                active
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
