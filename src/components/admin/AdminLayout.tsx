import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequireAdmin } from "@/components/RequireAdmin";
import { cn } from "@/lib/utils";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { usePendingChanges } from "@/lib/pendingChanges";
import { toast } from "sonner";
import {
  Activity, BadgeDollarSign, BarChart3, Bell, Boxes, Brain, Building2,
  ClipboardCheck, CreditCard, FileText, Gavel, Inbox, Layers, LayoutDashboard,
  LogOut, Mail, MapPin, Menu, Package, Palette, Search, Settings, ShieldAlert,
  ShieldCheck, ShoppingCart, Sun, Moon, Tags, Truck, Users, X, Zap, Waypoints, Wrench,
  type LucideIcon,
} from "lucide-react";

type AdminItem = { to: string; label: string; icon: LucideIcon; exact?: boolean; badge?: "openFlags" | "pendingKyc" | "pendingVendors" | "openDisputes"; pendingScope?: "pricing" | "catalog" };
type AdminGroup = { label: GroupLabel; items: AdminItem[] };
type GroupLabel = "Command Center" | "Users & Access" | "Finance" | "VTU & Providers" | "Marketplace" | "Logistics" | "Documents & AI" | "Communications" | "Configuration";

const ADMIN_GROUPS: AdminGroup[] = [
  { label: "Command Center", items: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin/system-health", label: "System Health", icon: Activity },
    { to: "/admin/risk", label: "Risk Operations", icon: ShieldAlert },
    { to: "/admin/maintenance", label: "Maintenance Mode", icon: Wrench },
  ]},
  { label: "Users & Access", items: [
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/administrators", label: "Administrators", icon: ShieldCheck },
    { to: "/admin/tenants", label: "Business Tenants", icon: Building2, badge: "openFlags" as const },
    { to: "/admin/kyc", label: "KYC", icon: ClipboardCheck, badge: "pendingKyc" as const },
    { to: "/admin/audit", label: "Audit Logs", icon: ShieldAlert },
  ]},
  { label: "Finance", items: [
    { to: "/admin/transactions", label: "Wallet & Ledger", icon: BadgeDollarSign },
    { to: "/admin/payments", label: "Payment Providers", icon: CreditCard },
    { to: "/admin/pricing", label: "Pricing", icon: BadgeDollarSign, pendingScope: "pricing" as const },
  ]},
  { label: "VTU & Providers", items: [
    { to: "/admin/vtu/providers", label: "VTU Providers", icon: Zap },
    { to: "/admin/vtu/catalog", label: "VTU Catalog & Routing", icon: Waypoints, pendingScope: "catalog" as const },
    { to: "/admin/catalog", label: "Catalog & Prices", icon: Tags },
    { to: "/admin/vtu/unresolved", label: "VTU Unresolved", icon: Inbox },
  ]},
  { label: "Marketplace", items: [
    { to: "/admin/vendors", label: "Vendors", icon: Boxes, badge: "pendingVendors" as const },
    { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingCart },
    { to: "/admin/orders", label: "Orders", icon: Package },
    { to: "/admin/disputes", label: "Disputes", icon: Gavel, badge: "openDisputes" as const },
  ]},
  { label: "Logistics", items: [
    { to: "/admin/shipments", label: "Shipments", icon: Truck },
    { to: "/admin/locations", label: "Locations", icon: MapPin },
    { to: "/admin/facilities", label: "Facilities", icon: Building2 },
  ]},
  { label: "Documents & AI", items: [
    { to: "/admin/documents", label: "Documents", icon: FileText },
    { to: "/admin/document-templates", label: "Doc Templates", icon: Layers },
    { to: "/admin/template-classifier", label: "AI Classifier", icon: Brain },
    { to: "/admin/document-templates/classify", label: "Classify Studio", icon: Brain },
  ]},
  { label: "Communications", items: [
    { to: "/admin/notifications", label: "Notifications", icon: Bell },
    { to: "/admin/settings/email", label: "Email Settings", icon: Mail },
  ]},
  { label: "Configuration", items: [
    { to: "/admin/appearance", label: "Appearance & Support", icon: Palette },
    { to: "/admin/settings", label: "Settings", icon: Settings, exact: true },
  ]},
] as const;

function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<GroupLabel | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const badgeCounts = useQuery(api.adminApi.adminBadgeCounts) ?? {
    pendingVendors: 0, pendingKyc: 0, openDisputes: 0, openFlags: 0,
  };
  const pendingPricing = usePendingChanges("pricing");
  const pendingCatalog = usePendingChanges("catalog");

  useEffect(() => {
    setMobileOpen(false);
    const active = ADMIN_GROUPS.find((group) =>
      group.items.some((item) => location.pathname === item.to || location.pathname.startsWith(item.to + "/")),
    );
    if (active) setExpandedGroup(active.label);
  }, [location.pathname]);

  const pendingCountFor = (scope: "pricing" | "catalog" | undefined) =>
    scope === "pricing" ? pendingPricing : scope === "catalog" ? pendingCatalog : 0;

  const badgeFor = (badge: keyof typeof badgeCounts | undefined) =>
    badge ? badgeCounts[badge] : 0;

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("cloudie-theme", next ? "dark" : "light"); } catch {}
  };

  const navList = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Admin navigation">
      {ADMIN_GROUPS.map((group) => {
        const hasActive = group.items.some((item) =>
          location.pathname === item.to || (!item.exact && location.pathname.startsWith(item.to + "/")),
        );
        const expanded = expandedGroup === group.label || hasActive;
        return (
          <div key={group.label} className="mb-1">
            <button type="button" onClick={() => setExpandedGroup(expandedGroup === group.label ? null : group.label)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 hover:bg-muted/60"
              aria-expanded={expanded}>
              <span className="flex-1 text-left">{group.label}</span>
              <span className={cn("transition-transform", expanded && "rotate-90")}>›</span>
            </button>
            {expanded && <div className="space-y-0.5 pb-1">
              {group.items.map((item) => {
                const count = badgeFor(item.badge);
                const pendingCount = pendingCountFor(item.pendingScope);
                return (
                  <NavLink key={item.to} to={item.to} end={item.exact} onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => cn(
                      "flex min-h-10 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-all active:scale-[0.98]",
                      isActive ? "border-primary/15 bg-primary/10 text-primary shadow-sm" :
                        "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/60 dark:text-red-300">{count}</span>}
                    {pendingCount > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">{pendingCount}</span>}
                  </NavLink>
                );
              })}
            </div>}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open admin menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Cloudie Command Center</p>
            <h1 className="truncate text-sm font-semibold">Master Super Admin</h1>
          </div>
          <div className="hidden max-w-sm flex-1 md:flex">
            <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input className="w-full bg-transparent text-sm outline-none" placeholder="Search admin workspace…" aria-label="Search admin workspace" />
            </div>
          </div>
          <button onClick={toggleTheme} className="hidden h-10 w-10 items-center justify-center rounded-xl border border-border sm:flex" aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => navigate("/admin/settings")} className="hidden h-10 w-10 items-center justify-center rounded-xl border border-border sm:flex" aria-label="Settings"><Settings className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card/50 lg:flex lg:flex-col">
          <div className="border-b border-border px-4 py-4">
            <p className="text-xs font-semibold">LIVE CONTROL PLANE</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Privileged platform operations</p>
          </div>
          {navList}
          <div className="border-t border-border p-3">
            <button onClick={() => { toast.info("Use the administrator sign-out flow from your account session."); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </aside>

        {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-[86vw] max-w-sm flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div><p className="text-xs font-bold">Cloudie Command Center</p><p className="text-[10px] text-muted-foreground">Master Super Admin</p></div>
              <button onClick={() => setMobileOpen(false)} className="h-9 w-9 rounded-lg border border-border" aria-label="Close menu"><X className="mx-auto h-4 w-4" /></button>
            </div>
            {navList}
          </aside>
        </div>}

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return <RequireAdmin><AdminShell /></RequireAdmin>;
}
