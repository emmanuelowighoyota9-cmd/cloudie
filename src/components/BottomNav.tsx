import { Link, useLocation } from "react-router";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Home, Zap, Truck, Wallet, LayoutGrid } from "lucide-react";

/**
 * The thumb bar is the only navigation most phone customers ever use, so it
 * carries the five journeys that actually get repeated: home, the VTU shop,
 * shipments, the wallet, and the full catalogue of everything else.
 *
 * It used to hold seven tabs. At 320px that is ~45px per tab — under the 44px
 * touch minimum once padding is counted — and the labels had to be truncated to
 * fit. Five tabs keep every target comfortably above 44px and let each one keep
 * its full label; `/services` is the "everything else" door, and the drawer
 * behind the header holds the complete list.
 */
const navItems = [
  { label: "Home", icon: Home, to: "/dashboard" },
  { label: "Digital", icon: Zap, to: "/vtu" },
  { label: "Shipments", icon: Truck, to: "/shipments" },
  { label: "Wallet", icon: Wallet, to: "/personal/wallet" },
  { label: "All", icon: LayoutGrid, to: "/services" },
];

export function BottomNav() {
  const location = useLocation();
  const isActive = (path: string) =>
    path === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname.startsWith(path);

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-semibold",
                "transition-[background-color,color] duration-200 active:scale-[0.95]",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="bottomnav-active"
                  aria-hidden
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 480, damping: 34 }}
                />
              )}
              <motion.span
                animate={active ? { y: -1, scale: 1.06 } : { y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 480, damping: 26 }}
                className="flex"
              >
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
