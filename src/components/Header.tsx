import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ThemeProvider";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Bell,
  Moon,
  Sun,
  LogOut,
  User,
  Wallet,
  Settings,
  Menu,
  Box,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { MobileNav } from "./MobileNav";
import { formatNgn } from "@/lib/pricing";

export function Header() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/70 sm:h-14 sm:px-4">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11 shrink-0 lg:hidden" aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] max-w-80 p-0">
            <MobileNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2 lg:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="size-4" />
          </span>
          <span className="hidden truncate text-sm font-bold tracking-tight text-foreground min-[360px]:inline">Crestline Express</span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Wallet Balance */}          <Link to="/buy-points" className="shrink-0 rounded-full transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Badge
              variant="default"
              className="min-h-11 gap-1.5 rounded-full border-0 px-2.5 py-2 text-xs font-semibold shadow-sm transition-shadow duration-200 hover:shadow-md sm:min-h-8 sm:px-3 sm:text-sm"
            >
            <Box className="h-3.5 w-3.5" />
            {walletBalance != null ? formatNgn(walletBalance) : "—"}
            {pointsBalance != null && (
              <span className="hidden text-[11px] font-normal opacity-90 sm:inline">
                · NGN
              </span>
            )}
          </Badge>
        </Link>

        {/* Notifications */}
        <Link to="/notifications">
          <Button variant="ghost" size="icon" className="relative size-11 sm:size-9" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unreadCount !== undefined && unreadCount > 0 && (
              <motion.span
                key={unreadCount}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
                className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-background"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </Button>
        </Link>

        {/* Theme Toggle */}
        <Button variant="ghost" size="icon" className="hidden size-11 sm:inline-flex sm:size-9" onClick={toggle} aria-label="Toggle theme">
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>

        {/* Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-11 gap-2 px-1 sm:h-9 sm:w-auto sm:px-2" aria-label="Open profile menu">
              <Avatar className="size-7">
                <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm font-medium max-w-[120px] truncate">
                {user?.name || user?.email || "User"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/personal")}>
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/buy-points")}>
              <Wallet className="mr-2 h-4 w-4" /> Wallet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
