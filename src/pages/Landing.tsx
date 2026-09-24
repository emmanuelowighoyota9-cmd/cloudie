import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPreviewSvg, categoryDef, defaultValues, svgToDataUrl } from "@/lib/docTemplateEngine";
import { STARTER_TEMPLATES } from "@/lib/starterTemplates";
import { PwaInstallBanner, PwaInstallButton } from "@/components/PwaInstallPrompt";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { toast } from "sonner";
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
  Search,
  MapPin,
  QrCode,
  Truck,
  Landmark,
  FileStack,
} from "lucide-react";

const features = [
  { icon: Landmark, title: "Banking Tenants", desc: "Provision islands like Crestline Capital — ledger-backed accounts, deposits, transfers, KYC & statements." },
  { icon: Package, title: "Shipment Management", desc: "Create, track, and manage shipments with real-time status updates and public tracking." },
  { icon: FileStack, title: "SoftBaker Document Studio", desc: "Dynamic templates with live preview, high-resolution PNG and multi-page PDF export, storage and share links." },
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
  const navigate = useNavigate();
  const { brand, support } = usePlatformConfig();
  const [trackingNumber, setTrackingNumber] = useState("");

  // Real template previews, rendered by the same engine the studio uses.
  const softbakerShowcase = useMemo(
    () =>
      STARTER_TEMPLATES.slice(0, 3).map((template) => ({
        name: template.name,
        category: categoryDef(template.documentType).label,
        src: svgToDataUrl(
          buildPreviewSvg(template.configuration, template.schema, defaultValues(template.schema), {
            sensitive: template.sensitivity === "sensitive",
          }),
        ),
      })),
    [],
  );

  const handleTrack = (event: React.FormEvent) => {
    event.preventDefault();
    const value = trackingNumber.trim();
    if (!value) {
      toast.error("Enter a tracking number to continue");
      return;
    }
    navigate(`/track/${encodeURIComponent(value)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Cloud className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-foreground">{brand.name}</span>
          </div>            <div className="flex items-center gap-2">
            <PwaInstallButton />
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
            <form onSubmit={handleTrack} className="mt-8 flex max-w-md flex-col gap-2 sm:flex-row">
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Track a shipment · e.g. TRK-nGkx2V20260210"
                aria-label="Tracking number"
                className="h-11 flex-1"
              />
              <Button type="submit" size="lg" className="gap-2">
                <Search className="h-4 w-4" />
                Track
              </Button>
            </form>
            <div className="mt-3 flex gap-2">
              <Link to="/auth?returnTo=/business"><Button variant="outline" size="sm">Logistics suite</Button></Link>
              <Link to="/auth?returnTo=/business"><Button variant="outline" size="sm" className="bg-slate-900 text-white border-slate-900">Business banking</Button></Link>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link to="/auth">
                <Button size="lg" className="w-full gap-2 px-8 sm:w-auto">
                  Start for Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">Sign In</Button>
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

      {/* SoftBaker document studio */}
      <section className="border-y border-border bg-card py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                <FileStack className="h-3.5 w-3.5 text-primary" />
                SoftBaker document studio
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Dynamic templates in, print-ready documents out
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Pick a template and fill a schema-driven form — the preview re-renders on every keystroke from the
                same engine that produces the export. Cloudie rasterizes a high-resolution PNG and assembles a
                multi-page PDF, stores both, and returns an unguessable share link.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Live preview sharing one render engine with exports",
                  "Versioned templates — generated documents never change",
                  "Non-removable DEMO watermark on sensitive layouts",
                  "Share links with expiry, revocation and view counts",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-chart-2" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/documents">
                    Open the document studio <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/documents/templates">Browse templates</Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {softbakerShowcase.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i, duration: 0.4 }}
                  className={i === 0 ? "sm:col-span-2" : ""}
                >
                  <div className="overflow-hidden rounded-xl border border-border bg-background p-3 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                    <img
                      src={item.src}
                      alt={`${item.name} template preview`}
                      loading="lazy"
                      className="mx-auto block h-auto w-full rounded-lg"
                      style={{ maxHeight: i === 0 ? 300 : 200, objectFit: "contain" }}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2 px-1">
                      <p className="truncate text-[11px] font-medium text-foreground">{item.name}</p>
                      <p className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.category}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Native tracking platform */}
      <section className="bg-background py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Native tracking — no third-party services
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Self-contained shipment tracking
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Cloudie generates tracking numbers, routes, timelines, QR codes,
                barcodes, and printable labels entirely inside the platform — with a
                privacy-filtered public tracking page anyone can open.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/tracking">
                  <Button variant="outline" className="gap-2">
                    <Truck className="h-4 w-4" />
                    Open public tracking
                  </Button>
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tracking</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">TRK-nGkx2V20260210</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">In transit</span>
              </div>
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/2 rounded-full bg-primary" />
              </div>
              <div className="mt-6 space-y-4">
                {[
                  { icon: MapPin, title: "Damascus, Syria", meta: "Departed origin facility" },
                  { icon: Truck, title: "Aberdeen, United Kingdom", meta: "Current location" },
                  { icon: Package, title: "Houston, United States", meta: "Destination · ETA Feb 12" },
                ].map((stop) => (
                  <div key={stop.title} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <stop.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{stop.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{stop.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background p-3">
                <QrCode className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">
                  QR, Code 128 barcode, and print-ready labels generated in-app
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Ready to get started?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join {brand.name} and start managing your operations today.
          </p>
          <Link to="/auth" className="mt-8 inline-block">
            <Button size="lg" className="gap-2 px-8">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <PwaInstallBanner />

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">{brand.name}</span>
          </div>
          {(support.email || support.phone || support.helpCenterUrl) && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {support.email && (
                <a href={`mailto:${support.email}`} className="transition-colors hover:text-foreground">
                  {support.email}
                </a>
              )}
              {support.phone && (
                <a href={`tel:${support.phone.replace(/[^0-9+]/g, "")}`} className="transition-colors hover:text-foreground">
                  {support.phone}
                </a>
              )}
              {support.helpCenterUrl && (
                <a href={support.helpCenterUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
                  Help centre
                </a>
              )}
              {support.hours && <span className="hidden sm:inline">{support.hours}</span>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand.name}. {brand.footerNote}
          </p>
        </div>
      </footer>
    </div>
  );
}
