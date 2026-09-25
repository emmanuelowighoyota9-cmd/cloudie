import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { Home, CreditCard, Truck, FileText, Building2, FileStack } from "lucide-react";

const navItems = [
  { label: "Home", icon: Home, to: "/dashboard" },
  { label: "Points", icon: CreditCard, to: "/buy-points" },
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
    <nav aria-label="Primary mobile navigation" className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_color-mix(in_srgb,var(--foreground)_35%,transparent)] backdrop-blur lg:hidden">
      <div className="flex items-stretch justify-around px-1 pt-1 sm:px-2">
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="size-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
