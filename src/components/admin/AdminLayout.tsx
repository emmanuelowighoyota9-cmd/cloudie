import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
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

const ADMIN_GROUPS = [
  { label: "Command Center", items: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin/system-health", label: "System Health", icon: Activity },
    { to: "/admin/risk", label: "Risk Operations", icon: ShieldAlert },
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
    { to: "/admin/template-classifier", label: "AI Classifier", icon: Sparkles },
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
] as const;  const navList = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Admin navigation">
      {ADMIN_GROUPS.map((group) => {
        const hasActive = group.items.some((item) => location.pathname === item.to || (!item.exact && location.pathname.startsWith(item.to + "/")));
        const expanded = expandedGroup === group.label || hasActive;
        return (
          <div key={group.label} className="mb-1">
            <button
              type="button"
              onClick={() => setExpandedGroup(expandedGroup === group.label ? null : group.label)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 hover:bg-muted/60"
              aria-expanded={expanded}
            >
              <span className="flex-1 text-left">{group.label}</span>
              <span className={cn("transition-transform", expanded && "rotate-90")}>›</span>
            </button>
            {expanded && (
              <div className="space-y-0.5 pb-1">
                {group.items.map((item) => {
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
                          "flex min-h-10 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
                          isActive
                            ? "border-primary/15 bg-primary/10 text-primary shadow-sm"
                            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/60 dark:text-red-300">{count}</span>}
                      {pendingCount > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">{pendingCount}</span>}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
