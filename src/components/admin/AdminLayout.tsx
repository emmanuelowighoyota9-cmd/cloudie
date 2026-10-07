import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { usePendingChanges } from "@/lib/pendingChanges";
import { toast } from "sonner";
import {
  Activity,
  BadgeDollarSign,
  Brain,
  CreditCard,
  Bell,
  BarChart3,
  Boxes,
  Building2,
  X,
  ClipboardCheck,
  FileText,
  Gavel,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Package,
  Palette,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  Tags,
  Truck,
  Users,
  Zap,
  Waypoints,
} from "lucide-react";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/administrators", label: "Administrators", icon: ShieldCheck },
  { to: "/admin/vendors", label: "Vendors", icon: Boxes, badge: "pendingVendors" as const },
  { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingCart },
  { to: "/admin/orders", label: "Orders", icon: Package },
  { to: "/admin/disputes", label: "Disputes", icon: Gavel, badge: "openDisputes" as const },
  { to: "/admin/transactions", label: "Wallet & Ledger", icon: BadgeDollarSign },
  { to: "/admin/shipments", label: "Shipments", icon: Truck },
  { to: "/admin/locations", label: "Locations", icon: MapPin },
  { to: "/admin/facilities", label: "Facilities", icon: Building2 },
  { to: "/admin/documents", label: "Documents", icon: FileText },
  { to: "/admin/document-templates", label: "Doc Templates", icon: Layers },
  { to: "/admin/template-classifier", label: "AI Classifier", icon: Sparkles },
  { to: "/admin/document-templates/classify", label: "Classify Studio", icon: Brain },
  { to: "/admin/tenants", label: "Business Tenants", icon: Building2, badge: "openFlags" as const },
  { to: "/admin/kyc", label: "KYC", icon: ClipboardCheck, badge: "pendingKyc" as const },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/audit", label: "Audit Logs", icon: ShieldAlert },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/system-health", label: "System Health", icon: Activity },
  { to: "/admin/catalog", label: "Catalog & Prices", icon: Tags, pendingScope: "catalog" as const },
  { to: "/admin/pricing", label: "Pricing", icon: BadgeDollarSign, pendingScope: "pricing" as const },
  { to: "/admin/payments", label: "Payment Providers", icon: CreditCard },
  { to: "/admin/vtu/providers", label: "VTU Providers", icon: Zap },
  { to: "/admin/vtu/catalog", label: "VTU Catalog & Routing", icon: Waypoints },
  { to: "/admin/vtu/unresolved", label: "VTU Unresolved", icon: Inbox },
  { to: "/admin/settings/email", label: "Email Settings", icon: Mail },
  { to: "/admin/appearance", label: "Appearance & Support", icon: Palette },
  { to: "/admin/settings", label: "Settings", icon: Settings, exact: true },
];

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Debounce the server query to avoid a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery(
    api.adminApi.globalSearch,
    debounced.trim().length >= 2 ? { q: debounced.trim() } : "skip",
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };

  const hasResults =
    results && (results.users.length || results.shipments.length || results.vendors.length || results.tenants.length || results.orders.length);

  return (
    <div ref={boxRef} className="relative min-w-0 w-full max-w-md">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search users, shipments, vendors, tenants, orders…"
        className="pl-9"
        aria-label="Admin global search"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {results === undefined ? (
            <p className="p-3 text-sm text-slate-400">Searching…</p>
          ) : !hasResults ? (
            <p className="p-3 text-sm text-slate-400">No matches.</p>
          ) : (
            <>
              {results!.users.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Users</p>
                  {results!.users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => go(`/admin/users/${u.id}`)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="truncate">{u.label}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">₦{u.walletBalanceNgn.toLocaleString("en-NG")}</span>
                    </button>
                  ))}
                </>
              )}
              {results!.shipments.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Shipments</p>
                  {results!.shipments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => go(`/admin/shipments?tracking=${encodeURIComponent(s.label)}`)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="truncate font-mono text-xs">{s.label}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">{s.sub}</span>
                    </button>
                  ))}
                </>
              )}
              {results!.vendors.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Vendors</p>
                  {results!.vendors.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => go(`/admin/vendors/${v.id}`)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="truncate">{v.label}</span>
                      <span className="ml-2 shrink-0 text-xs capitalize text-slate-400">{v.sub}</span>
                    </button>
                  ))}
                </>
              )}
              {results!.tenants.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tenants</p>
                  {results!.tenants.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => go(`/admin/tenants?search=${encodeURIComponent(t.label)}`)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="truncate">{t.label}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">{t.sub}</span>
                    </button>
                  ))}
                </>
              )}
              {results!.orders.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Orders</p>
                  {results!.orders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => go(`/admin/orders`)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="truncate font-mono text-xs">{o.label}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">{o.sub}</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AdminShell() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const badges = useQuery(api.adminApi.adminBadgeCounts);
  const pendingCatalogChanges = usePendingChanges("catalog");
  const pendingPricingChanges = usePendingChanges("pricing");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Signed out");
      navigate("/");
    } catch {
      toast.error("Sign out failed");
    }
  };

  const badgeFor = (
    key?: "pendingVendors" | "openDisputes" | "openFlags" | "pendingKyc",
  ) => {
    if (!key || !badges) return 0;
    return badges[key] ?? 0;
  };

  const pendingCountFor = (scope?: "catalog" | "pricing") => {
    if (scope === "catalog") return pendingCatalogChanges;
    if (scope === "pricing") return pendingPricingChanges;
    return 0;
  };

  const navList = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
      {NAV.map((item) => {
        const count = badgeFor(item.badge);
        const pendingCount = pendingCountFor(item.pendingScope);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                        "flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold " +
                        "transition-[background-color,color,transform,border-color] duration-200 " +
                        "ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                isActive
                  ? "border-primary/15 bg-primary/10 text-primary shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {count > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/60 dark:text-red-300">
                {count}
              </span>
            )}
            {pendingCount > 0 && (
              <span
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                title={`${pendingCount} unpublished change${pendingCount === 1 ? "" : "s"}`}
                aria-label={`${pendingCount} unpublished changes`}
              >
                {pendingCount}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  const profile = (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {(user?.name || user?.email || "A")[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{user?.name || "Admin"}</p>
          <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-11 sm:size-9" onClick={handleLogout} aria-label="Log out">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_6%,transparent),transparent_30%),var(--background)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-[272px] shrink-0 flex-col border-r border-border/70 bg-card/95 shadow-[10px_0_35px_-30px_hsl(var(--shadow-color)/0.7)] backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-border/70 px-4">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Cloudie Command Center</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Master Super Admin</p>
          </div>
        </div>
        {navList}
        {profile}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[88vw] max-w-80 flex-col border-r border-border bg-card shadow-2xl">
            <div className="flex h-16 items-center gap-2 border-b border-border/70 px-4">
              <Shield className="size-5 text-primary" />
              <p className="flex-1 text-sm font-bold text-foreground">Cloudie Operations Admin</p>
              <Button variant="ghost" size="icon" className="size-11" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </Button>
            </div>
            {navList}
            {profile}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-card/80 px-3 shadow-[0_8px_30px_-24px_hsl(var(--shadow-color)/0.55)] backdrop-blur-xl sm:h-14 sm:gap-3 sm:px-5">
          <Button variant="ghost" size="icon" className="size-11 shrink-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary sm:flex">
              <ShieldCheck className="h-3 w-3" /> Super Admin
            </span>
            <span className="mr-2 hidden items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Secure session
            </span>
            <Button variant="ghost" size="icon" className="size-11 sm:size-9" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link to="/dashboard" className="hidden sm:block">
              <Button variant="ghost" size="sm" className="text-xs">Back to app</Button>
            </Link>
          </div>
        </header>
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="mx-auto w-full max-w-[1440px] page-gutter py-5 sm:py-7 lg:py-9">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Admin-area layout: requires authentication AND the admin role server-side via queries. */
export function AdminLayout() {
  return (
    <RequireAuth>
      <AdminShell />
    </RequireAuth>
  );
}
