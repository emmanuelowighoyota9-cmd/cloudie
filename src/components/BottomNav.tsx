import { Link, useLocation } from "react-router";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Home, Grid2X2, ShoppingBag, ReceiptText, Wallet, MoreHorizontal } from "lucide-react";

const navItems = [
  { label: "Home", icon: Home, to: "/dashboard" },
  { label: "Services", icon: Grid2X2, to: "/services/my" },
  { label: "Market", icon: ShoppingBag, to: "/marketplace" },
  { label: "Orders", icon: ReceiptText, to: "/orders" },
  { label: "Wallet", icon: Wallet, to: "/personal/wallet" },
  { label: "More", icon: MoreHorizontal, to: "/billing" },
];

export function BottomNav() {
  const location = useLocation();
  const isActive = (path: string) =>
    path === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-card/95 shadow-[0_-10px_30px_-24px_hsl(var(--shadow-color)/0.65)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <div className="mx-auto flex max-w-xl items-stretch justify-around px-1 pt-1 sm:px-2">
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.95]",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {active && <motion.span layoutId="bottomnav-active" aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" transition={{ type: "spring", stiffness: 480, damping: 34 }} />}
              <motion.span animate={active ? { y: -1, scale: 1.06 } : { y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 480, damping: 26 }} className="flex">
                <item.icon className="size-5" />
              </motion.span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
