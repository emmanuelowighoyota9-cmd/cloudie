import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Bell,
  LogOut,
  User,
  Wallet,
  Settings,
  Menu,
  Box,
  Cloud,
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { MobileNav } from "./MobileNav";
import { AppSearch } from "./AppSearch";
import { formatNgn } from "@/lib/pricing";
import { usePlatformConfig } from "@/hooks/use-platform-config";

/**
 * The application top bar.
 *
 * Mobile-first: on a phone it is a 56px strip holding the drawer trigger, the
 * brand, the points balance and the account menu. From `sm` up the real search
 * field appears; from `md` the account name joins it.
 *
 * There is no theme switch: Cloudie is dark-only, and the toggle that used to
 * live here repainted nothing.
 */
export function Header() {
  const { user, signOut } = useAuth();
  const { brand } = usePlatformConfig();
  const navigate = useNavigate();
  const walletBalance = useQuery(api.wallet.getBalance);
  const unreadCount = useQuery(api.notifications.unreadCount);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] max-w-80 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Every workspace in {brand.name}.
            </SheetDescription>
            <MobileNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Brand: the desktop sidebar already carries it, so this is phone-only. */}
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Cloud className="size-4" />
          </span>
          <span className="truncate text-sm font-bold tracking-tight text-foreground">
            {brand.name}
          </span>
        </Link>

        <div className="hidden md:block">
          <AppSearch />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Points balance — the one number worth permanent screen space. */}
        <Link
          to="/buy-points"
          className="shrink-0 rounded-full transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Points balance — top up"
        >
          <Badge
            variant="outline"
            className="min-h-9 gap-1.5 rounded-full border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors duration-200 hover:bg-primary/15 sm:text-sm"
          >
            <Box className="size-3.5" />
            {walletBalance != null ? formatNgn(walletBalance) : "—"}
            {walletBalance != null && (
              <span className="hidden text-[11px] font-normal opacity-90 sm:inline">NGN</span>
            )}
          </Badge>
        </Link>

        <Link to="/notifications">
          <Button
            variant="ghost"
            size="icon"
            className="relative size-11 sm:size-9"
            aria-label={
              unreadCount && unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          >
            <Bell className="size-4" />
            {unreadCount !== undefined && unreadCount > 0 && (
              <motion.span
                key={unreadCount}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
                aria-hidden
                className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-error text-[10px] font-bold text-foreground"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="size-11 gap-2 px-1 sm:h-9 sm:w-auto sm:px-2"
              aria-label="Account menu"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[140px] truncate text-sm font-medium md:inline">
                {user?.name || user?.email || "User"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="truncate">
              {user?.email || "Signed in"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/personal")}>
              <User className="mr-2 size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/buy-points")}>
              <Wallet className="mr-2 size-4" /> Wallet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-error focus:text-error"
            >
              <LogOut className="mr-2 size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
