import { useParams, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@//convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ShieldCheck, Landmark, CreditCard, ArrowRight, Lock, Eye, Zap, Globe } from "lucide-react";

export default function SiteLanding() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const stats = useQuery(api.tenants.publicStats, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");

  const primary = site?.branding?.primaryColor || "#003087";
  const accent = site?.branding?.accentColor || "#0050a0";

  if (site === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }
  if (!site || !site.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Landmark className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">{site?.siteName || "Site"}</h1>
          <p className="mt-2 text-gray-500">This site is currently unavailable.</p>
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
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              Banking
              <br />
              <span style={{ color: accent }}>Reimagined</span>
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-xl leading-relaxed">
              {site.siteType === "bank"
                ? "Experience seamless digital banking with real-time transfers, smart account management, and enterprise-grade security — all from one platform."
                : "Access professional investment tools, portfolio management, and real-time market data designed for modern investors."}
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
        <section className="bg-white border-b border-gray-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-2xl font-bold" style={{ color: primary }}>{stats.totalAccounts}</p>
                <p className="text-sm text-gray-500">Active Accounts</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: primary }}>${stats.totalBalance.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Total Balance</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: primary }}>{stats.checking + stats.savings}</p>
                <p className="text-sm text-gray-500">Deposit Accounts</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: primary }}>{stats.credit}</p>
                <p className="text-sm text-gray-500">Credit Accounts</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Features ── */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Why Choose {site.siteName}?</h2>
            <p className="mt-3 text-gray-500 max-w-lg mx-auto">
              Built for the way you bank today. Fast, secure, and always accessible.
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
              <div key={f.title} className="group rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-lg transition-all duration-300 hover:border-gray-300">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${primary}10` }}>
                  <f.icon className="h-6 w-6" style={{ color: primary }} />
                </div>
                <h3 className="mt-4 font-bold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16" style={{ backgroundColor: `${primary}08` }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900">Ready to Get Started?</h2>
          <p className="mt-3 text-gray-500">Open your account in minutes. No paperwork, no waiting.</p>
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
