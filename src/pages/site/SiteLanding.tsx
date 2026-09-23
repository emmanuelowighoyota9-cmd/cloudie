import { useParams, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@//convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ShieldCheck, Landmark, CreditCard, ArrowRight, Lock, Eye, Zap, Globe } from "lucide-react";
import { bankTheme } from "@/lib/tenantBankTheme";

export default function SiteLanding() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const stats = useQuery(api.tenants.publicStats, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");

  // Design kit from the banking template applied at tenancy creation.
  const theme = bankTheme(site?.branding);
  const { primary, accent, text, muted, panel, border, radius } = theme;

  if (site === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }
  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Landmark className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Site not found</h1>
          <p className="mt-2 text-gray-500">No tenant is provisioned for this site.</p>
        </div>
      </div>
    );
  }
  const lifecycleSite = (site as any).lifecycleStatus;
  const isUnavailableSite = !site.isActive || (lifecycleSite && lifecycleSite !== "active");
  if (isUnavailableSite) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 px-4 py-10">
        <div className="max-w-xl w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Lock className="h-5 w-5" /></div>
          <h1 className="mt-3 text-xl font-bold">{site.siteName} is {lifecycleSite ?? "unavailable"}</h1>
          <p className="mt-2 text-sm text-slate-600">Frontend routes for this tenant are temporarily suspended from public traffic. Backend API processing is paused. All ledger history and user state remain preserved for restoration.</p>
          <p className="mt-3 text-xs text-slate-400">{site.subdomain ? `${site.subdomain}.g0ki.com` : ""} · {lifecycleSite ?? ""}</p>
        </div>
      </div>
    );
  }

  return (
    <SiteLayout>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden text-white" style={{ backgroundColor: primary }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28 lg:py-36">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm font-medium mb-6">
              <ShieldCheck className="h-4 w-4" />
              {site.siteType === "bank" ? "FDIC Insured" : "SEC Registered"}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight max-w-2xl">
              {theme.heroHeadline ?? (site.siteType === "bank" ? "Banking, reimagined" : "Investing, simplified")}
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-xl leading-relaxed">
              {theme.tagline ??
                (site.siteType === "bank"
                  ? "Experience seamless digital banking with real-time transfers, smart account management, and enterprise-grade security — all from one platform."
                  : "Access professional investment tools, portfolio management, and real-time market data designed for modern investors.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={`/site/${site._id}/signup`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all hover:scale-105 shadow-lg"
                style={{ backgroundColor: accent }}
              >
                Open Account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={`/site/${site._id}/login`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-white/10 text-white hover:bg-white/20 transition-all backdrop-blur-sm"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      {stats && stats.totalAccounts > 0 && (
        <section style={{ backgroundColor: panel, borderBottom: `1px solid ${border}` }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-2xl font-bold" style={{ color: accent }}>{stats.totalAccounts}</p>
                <p className="text-sm" style={{ color: muted }}>Active Accounts</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: accent }}>${stats.totalBalance.toLocaleString()}</p>
                <p className="text-sm" style={{ color: muted }}>Total Balance</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: accent }}>{stats.checking + stats.savings}</p>
                <p className="text-sm" style={{ color: muted }}>Deposit Accounts</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: accent }}>{stats.credit}</p>
                <p className="text-sm" style={{ color: muted }}>Credit Accounts</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Features ── */}
      <section className="py-20" style={{ backgroundColor: theme.surface }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold" style={{ color: text }}>Why Choose {site.siteName}?</h2>
            <p className="mt-3 max-w-lg mx-auto" style={{ color: muted }}>
              {theme.customerAppStyle ?? "Built for the way you bank today. Fast, secure, and always accessible."}
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Zap, title: "Instant Transfers", desc: "Send and receive money in seconds, not days. Real-time processing with zero delays." },
              { icon: ShieldCheck, title: "Bank-Grade Security", desc: "256-bit encryption, biometric auth, and real-time fraud monitoring protect every transaction." },
              { icon: Eye, title: "Full Transparency", desc: "See all transactions, balances, and statements in real time. No hidden fees, no surprises." },
              { icon: CreditCard, title: "Multiple Accounts", desc: "Manage checking, savings, and credit accounts from a single unified dashboard." },
              { icon: Lock, title: "KYC & Compliance", desc: "Streamlined identity verification that meets regulatory requirements without the hassle." },
              { icon: Globe, title: "Anywhere Access", desc: "Fully responsive web platform that works beautifully on desktop, tablet, and mobile." },
            ].map((f) => (
              <div
                key={f.title}
                className="group p-6 transition-all duration-300 hover:shadow-lg"
                style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: theme.accentSoft }}>
                  <f.icon className="h-6 w-6" style={{ color: accent }} />
                </div>
                <h3 className="mt-4 font-bold" style={{ color: text }}>{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: muted }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16" style={{ backgroundColor: theme.isDark ? theme.panel : theme.accentSoft }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold" style={{ color: text }}>Ready to Get Started?</h2>
          <p className="mt-3" style={{ color: muted }}>Open your account in minutes. No paperwork, no waiting.</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              to={`/site/${site._id}/signup`}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-white transition-all hover:scale-105 shadow-lg"
              style={{ backgroundColor: primary }}
            >
              Open Account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
