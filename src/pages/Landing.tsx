import { motion } from "framer-motion";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Cloud,
  Package,
  FileText,
  Building2,
  Layers,
  ShoppingBag,
  Users,
  Wallet,
  Shield,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";

const features = [
  { icon: Package, title: "Shipment Management", desc: "Create, track, and manage shipments with real-time status updates and public tracking." },
  { icon: FileText, title: "Document Generation", desc: "Generate flight itineraries, hotel reservations, invoices, and customs documents." },
  { icon: Building2, title: "Business Suite", desc: "White-label tenant portal for banking and investment platforms with KYC." },
  { icon: Layers, title: "Email & Rendering", desc: "Run email campaigns and create stunning images with our rendering studio." },
  { icon: ShoppingBag, title: "Marketplace", desc: "Buy and sell point packages from verified vendors in our marketplace." },
  { icon: Users, title: "Referral System", desc: "Invite friends and earn 50 points for every successful referral." },
];

const stats = [
  { label: "Points Ledger", value: "Unified" },
  { label: "Security", value: "Enterprise" },
  { label: "Multi-tenant", value: "Isolated" },
  { label: "Realtime", value: "Live" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[var(--nb-bg)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--nb-rule)] bg-[var(--nb-surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
              <Cloud className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">Cloudie</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="gap-1">
                Get Started <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}              <section className="relative overflow-hidden bg-white dark:bg-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-32 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-500 mb-6 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              All-in-one digital operations platform
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              Run your business
              <br />
              on <span className="text-blue-600 dark:text-blue-400">Cloudie</span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
              Shipments, documents, email campaigns, marketplace, and a unified points ledger — everything you need in one premium platform.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="gap-2 px-8">
                  Start for Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg">Sign In</Button>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Decorative lines - Notebook feel */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-full h-px bg-[var(--nb-rule)]/40"
              style={{ top: `${120 + i * 32}px` }}
            />
          ))}
          {/* Margin line */}
          <div className="absolute left-[72px] top-0 bottom-0 w-px bg-red-300/30 dark:bg-red-800/20" />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{s.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}            <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-[var(--nb-ink)]">Everything you need</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              A complete SaaS platform built for modern businesses. No hacks, no workarounds.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.4 }}
              >
                <div className="h-full rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-700">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
                    <f.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="mt-4 font-semibold text-[var(--nb-ink)]">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Points Economy */}            <section className="py-20 bg-white border-y border-slate-200 dark:bg-slate-800 dark:border-slate-700">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--nb-ink)]">Unified Points Economy</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Every operation in Cloudie is powered by a transparent, immutable points ledger. Shipments, documents, emails, and marketplace purchases all draw from your points balance.
              </p>
              <ul className="mt-6 space-y-3">
                {["Immutable ledger records", "Idempotent transactions", "Real-time balance updates", "Admin adjustment tools"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-[var(--nb-ink)]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[var(--nb-rule)] bg-[var(--nb-bg)] p-6 font-mono text-sm">
              <div className="space-y-2">
                <div className="flex justify-between text-green-600"><span>Deposit</span><span>+5,000</span></div>
                <div className="flex justify-between text-red-500"><span>Shipment</span><span>-100</span></div>
                <div className="flex justify-between text-red-500"><span>Document</span><span>-150</span></div>
                <div className="flex justify-between text-red-500"><span>Email Campaign</span><span>-50</span></div>
                <div className="flex justify-between text-green-600"><span>Referral Reward</span><span>+50</span></div>
                <div className="border-t border-[var(--nb-rule)] pt-2 flex justify-between font-bold text-[var(--nb-ink)]"><span>Balance</span><span>4,750</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}            <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--nb-ink)]">
            Ready to get started?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join Cloudie and start managing your operations today.
          </p>
          <Link to="/auth" className="mt-8 inline-block">
            <Button size="lg" className="gap-2 px-8">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--nb-rule)] bg-[var(--nb-surface)] py-8">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-[var(--nb-ink)]">Cloudie</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Cloudie. Built for modern operations.</p>
        </div>
      </footer>
    </div>
  );
}
