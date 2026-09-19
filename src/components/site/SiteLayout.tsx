import { Link, useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Building2, LogIn, UserPlus, Landmark, ShieldCheck, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

type LayoutProps = {
  children: React.ReactNode;
  active?: string;
  /** Show auth-aware nav (logged in user) */
  authenticated?: boolean;
};

export function useTenantSite() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  return { siteId: siteId as Id<"tenantSites"> | undefined, site };
}

export function SiteLayout({ children, active, authenticated }: LayoutProps) {
  const { site } = useTenantSite();
  const [mobileOpen, setMobileOpen] = useState(false);
  const primary = site?.branding?.primaryColor || "#003087";
  const accent = site?.branding?.accentColor || "#0050a0";

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const navItems = authenticated
    ? [
        { href: `/site/${site._id}/dashboard`, label: "Dashboard", icon: Building2 },
        { href: `/site/${site._id}/accounts`, label: "Accounts", icon: Landmark },
        { href: `/site/${site._id}/transactions`, label: "Transactions", icon: ShieldCheck },
      ]
    : [
        { href: `/site/${site._id}`, label: "Home" },
        { href: `/site/${site._id}/about`, label: "About" },
        { href: `/site/${site._id}/services`, label: "Services" },
        { href: `/site/${site._id}/contact`, label: "Contact" },
      ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top Bar ── */}
      <nav className="text-white shadow-lg" style={{ backgroundColor: primary }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <Link to={`/site/${site._id}`} className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: accent }}>
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight">{site.siteName}</span>
                <span className="hidden sm:inline text-[10px] ml-2 text-white/60 uppercase tracking-wider">
                  {site.siteType === "bank" ? "Digital Banking" : "Investment Platform"}
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active === item.label.toLowerCase()
                      ? "bg-white/20 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-2">
              {authenticated ? (
                <Link
                  to={`/site/${site._id}/login`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </Link>
              ) : (
                <>
                  <Link
                    to={`/site/${site._id}/login`}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <LogIn className="h-4 w-4" /> Sign In
                  </Link>
                  <Link
                    to={`/site/${site._id}/signup`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                    style={{ backgroundColor: accent }}
                  >
                    <UserPlus className="h-4 w-4" /> Open Account
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-white p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 pb-3 px-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block py-2.5 px-3 rounded-lg text-sm font-medium ${
                  active === item.label.toLowerCase()
                    ? "bg-white/20 text-white"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-white/10 mt-2 pt-2 space-y-1">
              {authenticated ? (
                <Link to={`/site/${site._id}/login`} className="block py-2.5 px-3 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10">
                  Sign Out
                </Link>
              ) : (
                <>
                  <Link to={`/site/${site._id}/login`} className="block py-2.5 px-3 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10">
                    Sign In
                  </Link>
                  <Link to={`/site/${site._id}/signup`} className="block py-2.5 px-3 rounded-lg text-sm font-bold text-white text-center" style={{ backgroundColor: accent }}>
                    Open Account
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Content ── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Landmark className="h-5 w-5" style={{ color: primary }} />
                <span className="font-bold text-gray-900">{site.siteName}</span>
              </div>
              <p className="text-sm text-gray-500">
                {site.siteType === "bank"
                  ? "Secure digital banking for the modern world."
                  : "Smart investment platform for your financial future."}
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">Quick Links</h4>
              <div className="space-y-2">
                <Link to={`/site/${site._id}`} className="block text-sm text-gray-500 hover:text-gray-900">Home</Link>
                <Link to={`/site/${site._id}/services`} className="block text-sm text-gray-500 hover:text-gray-900">Services</Link>
                <Link to={`/site/${site._id}/contact`} className="block text-sm text-gray-500 hover:text-gray-900">Contact</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-3">Contact</h4>
              <div className="space-y-1 text-sm text-gray-500">
                {site.contactEmail && <p>{site.contactEmail}</p>}
                {site.contactPhone && <p>{site.contactPhone}</p>}
                <p className="mt-2">Member FDIC · Equal Housing Lender</p>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} {site.siteName}. All rights reserved. Powered by Cloudie.
          </div>
        </div>
      </footer>
    </div>
  );
}
