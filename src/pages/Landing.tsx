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
  RadioTower,
  Route,
  CircleDollarSign,
  Plane,
  ReceiptText,
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
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Cloud className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-foreground">Cloudie</span>
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

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-card">
        <div className="mx-auto grid min-h-[82vh] max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1fr_0.9fr] md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Live logistics, documents, and points in one workspace
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
              Coordinate every
              <br />
              operating line in <span className="text-primary">Cloudie</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Shipments, travel documents, email campaigns, marketplace orders, and a unified points ledger stay connected inside one operational command center.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/auth">
                <Button size="lg" className="gap-2 px-8">
                  Start for Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg">Sign In</Button>
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[
                { icon: Route, label: "Routes", value: "214" },
                { icon: Shield, label: "KYC files", value: "98%" },
                { icon: Wallet, label: "Ledger", value: "Live" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-background p-3">
                  <item.icon className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-base font-semibold text-foreground">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2">
              {[
                { icon: Plane, label: "Travel desk", value: "22 itineraries queued" },
                { icon: ReceiptText, label: "Document ops", value: "Invoices and customs ready" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border bg-accent/55 p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-card text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.55 }}
            className="relative"
          >
            <div className="rounded-xl border border-border bg-background p-4 shadow-2xl shadow-primary/10">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Ops Console</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">Transatlantic priority queue</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <RadioTower className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { label: "Shipment CLD-8241", meta: "Customs docs attached", value: "On time", icon: Package },
                  { label: "Vendor payout", meta: "Marketplace order bundle", value: "+2,450", icon: CircleDollarSign },
                  { label: "Flight document", meta: "Client itinerary generated", value: "Ready", icon: FileText },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Points available</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">48,920</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Active tenants</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">36</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="pointer-events-none absolute inset-0 -z-10">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute h-px w-full bg-border/40"
              style={{ top: `${120 + i * 32}px` }}
            />
          ))}
          <div className="absolute bottom-0 left-[72px] top-0 w-px bg-destructive/15" />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-background py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Everything you need</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
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
                <div className="h-full rounded-xl border border-border bg-card p-6 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Points Economy */}
      <section className="border-y border-border bg-card py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Unified Points Economy</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Every operation in Cloudie is powered by a transparent, immutable points ledger. Shipments, documents, emails, and marketplace purchases all draw from your points balance.
              </p>
              <ul className="mt-6 space-y-3">
                {["Immutable ledger records", "Idempotent transactions", "Real-time balance updates", "Admin adjustment tools"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-chart-2" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-background p-6 font-mono text-sm">
              <div className="space-y-2">
                <div className="flex justify-between text-chart-2"><span>Deposit</span><span>+5,000</span></div>
                <div className="flex justify-between text-destructive"><span>Shipment</span><span>-100</span></div>
                <div className="flex justify-between text-destructive"><span>Document</span><span>-150</span></div>
                <div className="flex justify-between text-destructive"><span>Email Campaign</span><span>-50</span></div>
                <div className="flex justify-between text-chart-2"><span>Referral Reward</span><span>+50</span></div>
                <div className="flex justify-between border-t border-border pt-2 font-bold text-foreground"><span>Balance</span><span>4,750</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-background py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
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
      <footer className="border-t border-border bg-card py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Cloudie</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Cloudie. Built for modern operations.</p>
        </div>
      </footer>
    </div>
  );
}
