import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPreviewSvg, categoryDef, defaultValues, svgToDataUrl } from "@/lib/docTemplateEngine";
import { PLATFORM_TEMPLATES } from "@/lib/platformTemplates";
import { PwaInstallBanner, PwaInstallButton } from "@/components/PwaInstallPrompt";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Package,
  Users,
  Wallet,
  Shield,
  ArrowRight,
  Check,
  Sparkles,
  RadioTower,
  Route,
  Plane,
  ReceiptText,
  Search,
  MapPin,
  QrCode,
  Truck,
  FileStack,
  ClipboardList,
  Link2,
  FileCheck2,
  Quote,
  Star,
  Mail,
  Phone,
  LayoutDashboard,
  ScrollText,
  LifeBuoy,
  Clock,
} from "lucide-react";

/** Template previews shown on the landing page, in the order listed here. */
const SHOWCASE_SLUGS = [
  "shipment-tracking-card",
  "packing-list",
  "quotation",
  "commercial-invoice",
  "statement-of-account",
];

/** In-page anchors, shared by the desktop nav row and the mobile chip strip. */
const SECTIONS = [
  { id: "platform", label: "Workspaces" },
  { id: "studio", label: "Documents" },
  { id: "tracking", label: "Tracking" },
  { id: "faq", label: "FAQ" },
];

const steps = [
  {
    icon: ClipboardList,
    title: "Book the shipment",
    desc: "Capture sender, receiver and package details once. A tracking number is minted on save — no third-party service involved.",
  },
  {
    icon: Link2,
    title: "Share one tracking link",
    desc: "Send a privacy-filtered link your customer can open without an account. Milestones, scans and ETAs update as your team works.",
  },
  {
    icon: FileCheck2,
    title: "Produce the paperwork",
    desc: "Turn the same shipment into customs packets, invoices or delivery notes — preview, export and share from one studio.",
  },
];

const testimonials = [
  {
    quote:
      "We used to reconcile four spreadsheets before answering a customer. Now one screen answers it, and the tracking link speaks for us.",
    name: "Adaeze Okonkwo",
    role: "Head of Operations",
    company: "Northfold Trading",
  },
  {
    quote:
      "The document studio replaced a folder of templates. Customs packets come out of the same record we already booked.",
    name: "Marcus Reyes",
    role: "Customs Lead",
    company: "Lakeview Interiors",
  },
  {
    quote:
      "Our desk stopped fielding \"where is my parcel?\" calls. Customers track it themselves and we get the credit.",
    name: "Priya Ramanathan",
    role: "Customer Care Manager",
    company: "Harbour Works Logistics",
  },
];

/** Used only when the platform has no admin-configured FAQs yet. */
const FALLBACK_FAQ = [
  {
    question: "Do I need an account to track a shipment?",
    answer:
      "No. The public tracking page takes a tracking number and returns milestones, current location and the estimated delivery date — no sign-in required.",
  },
  {
    question: "Where do shipments, documents and points meet?",
    answer:
      "One ledger. Booking a shipment, rendering a document or buying a service all draw from the same live points balance, so there is never a second set of books to reconcile.",
  },
  {
    question: "Can we run this for our own customers?",
    answer:
      "Yes. The business suite lets you publish a branded customer portal and issue banking-style accounts to the customers you serve, all from the same workspace.",
  },
  {
    question: "What happens when a carrier update goes wrong?",
    answer:
      "Every status change is written to an audit trail and can be corrected from the shipment timeline, so the history stays accurate rather than overwritten.",
  },
];

const features = [
  { icon: Package, title: "Shipment control", desc: "Book, organize, and update every shipment from one calm command center." },
  { icon: RadioTower, title: "Live tracking", desc: "Share a privacy-safe tracking link with real-time milestones and ETAs." },
  { icon: Route, title: "Route intelligence", desc: "See every handoff, facility scan, and delivery signal in a clear timeline." },
  { icon: FileStack, title: "Customs-ready documents", desc: "Create polished commercial invoices and shipping documents without leaving the flow." },
  { icon: Wallet, title: "Simple points ledger", desc: "Transparent, real-time credits for shipments, documents, and partner services." },
  { icon: Users, title: "Built for teams", desc: "Give customers, operations teams, and partners a shared source of shipment truth." },
];

const stats = [
  { label: "Shipment visibility", value: "Live" },
  { label: "Carrier updates", value: "Real-time" },
  { label: "Document flows", value: "Ready" },
  { label: "Platform security", value: "Enterprise" },
];

const proofPoints = [
  { icon: LayoutDashboard, value: "One workspace", label: "Operations, documents and points in a single sign-in" },
  { icon: ScrollText, value: "Audit-ready", label: "Every status change and render is recorded" },
  { icon: Shield, value: "Role aware", label: "Admins, customers and partners see only their slice" },
  { icon: LifeBuoy, value: "Human support", label: "Support for your workspace" },
];

export default function Landing() {
  const navigate = useNavigate();
  const { brand, support } = usePlatformConfig();
  const [trackingNumber, setTrackingNumber] = useState("");

  // Admin-editable FAQs win; the built-in set keeps the section useful on a
  // fresh install where nothing has been configured yet.
  const faqs = support.faqs.length > 0 ? support.faqs : FALLBACK_FAQ;

  // Real template previews, rendered by the same engine the studio uses.
  const documentShowcase = useMemo(
    () =>
      PLATFORM_TEMPLATES.filter((template) => SHOWCASE_SLUGS.includes(template.slug)).map((template) => ({
        name: template.name,
        category: categoryDef(template.documentType).label,
        src: svgToDataUrl(
          buildPreviewSvg(template.configuration, template.schema, defaultValues(template.schema)),
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
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Truck className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-foreground">{brand.name}</span>
          </div>
          <nav aria-label="Page sections" className="hidden items-center gap-7 lg:flex">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
            {/* Direct route into the signed-in workspace. Signed-out visitors
                are bounced through RequireAuth, which preserves this path as
                /auth?returnTo=/dashboard — so either way the click ends here. */}
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary/80"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </nav>
          <div className="flex items-center gap-2">
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
        {/* Same anchors, scrollable, where the desktop row is hidden. */}
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
          <Link
            to="/dashboard"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors duration-200 hover:bg-primary/20"
          >
            <LayoutDashboard className="h-3 w-3" />
            Dashboard
          </Link>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </div>
      </header>

      {/* Clear simulation notice, visible before visitors enter any workspace. */}
      <div className="border-b border-amber-500/25 bg-amber-500/[0.07]">
        <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground sm:items-center">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 sm:mt-0" />
          <span><strong className="text-foreground">Simulation only.</strong> Documents, bookings, shipment records, sites, and balances are fictional and intended for training, demonstration, and testing.</span>
        </div>
      </div>

      {/* Hero */}
      <section className="landing-hero relative overflow-hidden border-b border-border">
        <div className="mx-auto grid min-h-[82vh] max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1fr_0.9fr] md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              One account. Five workspaces. All connected.
            </div>
            <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground md:text-7xl">
              Everything your business runs on, <span className="text-primary">in one workspace</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {brand.name} brings shipments, travel documents, invoices, customer-facing banking and investment sites, and everyday tools together behind one sign-in. This is a simulation and training environment: nothing is really shipped, booked, or banked.
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
              <Link to="/auth?returnTo=/business"><Button variant="outline" size="sm" className="border-sidebar bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent">Business banking</Button></Link>
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
              <Link to="/dashboard">
                <Button variant="outline" size="lg" className="w-full gap-2 sm:w-auto">
                  <LayoutDashboard className="h-4 w-4" /> Open dashboard
                </Button>
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[
                { icon: Route, label: "Active lanes", value: "24" },
                { icon: Shield, label: "On-time rate", value: "98%" },
                { icon: Wallet, label: "Updates", value: "Live" },
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
                { icon: Plane, label: "Priority desk", value: "12 shipments need review" },
                { icon: ReceiptText, label: "Document ops", value: "Customs packets ready to send" },
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
            <div className="surface-lift rounded-2xl border border-border bg-background/95 p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Shipment control</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">Priority delivery queue</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <RadioTower className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { label: "CLX-8241 · Rotterdam", meta: "Customs packet attached", value: "On time", icon: Package },
                  { label: "CLX-8238 · Singapore", meta: "Departed origin facility", value: "In transit", icon: RadioTower },
                  { label: "CLX-8229 · New York", meta: "Delivery window confirmed", value: "Today", icon: Truck },
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
                  <p className="text-xs text-muted-foreground">Delivered this month</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">1,284</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">On-time rate</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">98.4%</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="landing-grid pointer-events-none absolute inset-0 -z-10 opacity-80" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px landing-rule" />
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

      {/* How it works */}
      <section id="platform" className="scroll-mt-24 bg-background py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl page-gutter">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Three steps from booking to proof of delivery
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              No integration project, no migration weekend. Start with the shipment you already have and grow into
              the rest of the platform when the volume justifies it.
            </p>
          </div>
          <div className="relative">
            {/* Connector runs behind the cards on wide screens only. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-11 hidden h-px bg-border md:block"
            />
            <ol className="relative grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <motion.li
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: 0.08 * index, duration: 0.45 }}
                  className="relative"
                >
                  <div className="interactive-card h-full rounded-2xl border border-border bg-card p-6 elev-1">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 font-display text-base font-bold text-primary">
                        {index + 1}
                      </span>
                      <step.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="mt-5 font-display text-lg font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-background py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl page-gutter">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">A better way to ship</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Everything your team needs to turn a booking into a delivered experience.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ delay: 0.08 * i, duration: 0.4 }}
              >
                <div className="interactive-card h-full rounded-2xl border border-border bg-card p-6 elev-1">
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
      <section className="border-y border-border bg-card py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl page-gutter">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Unified Points Economy</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Every shipment in {brand.name} is powered by a transparent, immutable points ledger. Booking, documents, and partner services draw from the same clear balance.
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

      {/* Crestline document studio */}
      <section id="studio" className="scroll-mt-24 border-y border-border bg-card py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl page-gutter">
          <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                <FileStack className="h-3.5 w-3.5 text-primary" />
                {brand.name} document studio
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Dynamic templates in, print-ready documents out
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Pick a template and fill a schema-driven form — the preview re-renders on every keystroke from the
                same engine that produces the export. {brand.name} rasterizes a high-resolution PNG and assembles a
                multi-page PDF, stores both, and returns an unguessable share link.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Live preview sharing one render engine with exports",
                  "Versioned templates — generated documents never change",
                  "Share links with expiry, revocation and view counts",
                  "Clean output — no watermarks",
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
              {documentShowcase.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ delay: 0.06 * i, duration: 0.4 }}
                  className={i === 0 ? "sm:col-span-2" : ""}
                >
                  <div className="group overflow-hidden rounded-xl border border-border bg-background p-3 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                    <img
                      src={item.src}
                      alt={`${item.name} template preview`}
                      loading="lazy"
                      className="mx-auto block h-auto w-full rounded-lg transition-transform duration-300 ease-out group-hover:scale-[1.02]"
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
      <section id="tracking" className="scroll-mt-24 bg-background py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl page-gutter">
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
                {brand.name} generates tracking numbers, routes, timelines, QR codes,
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

      {/* Proof points */}
      <section className="border-y border-border bg-card py-12 sm:py-16">
        <div className="mx-auto max-w-6xl page-gutter">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {proofPoints.map((point, i) => (
              <motion.div
                key={point.value}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: 0.06 * i, duration: 0.4 }}
                className="flex items-start gap-3 rounded-xl border border-border bg-background p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <point.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{point.value}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{point.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-background py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl page-gutter">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Teams already running on {brand.name}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Calmer desks, faster answers
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((item, i) => (
              <motion.figure
                key={item.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ delay: 0.08 * i, duration: 0.45 }}
                className="interactive-card flex h-full flex-col rounded-2xl border border-border bg-card p-6 elev-1"
              >
                <Quote className="h-5 w-5 text-primary" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                  {item.quote}
                </blockquote>
                <div className="mt-4 flex items-center gap-1 text-accent" aria-label="Five out of five">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star key={star} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-display text-xs font-bold text-primary">
                    {item.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.role} · {item.company}
                    </span>
                  </span>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-y border-border bg-card py-16 sm:py-20 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 page-gutter lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Questions</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Answers before you sign up
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Still stuck on something specific? Our operations desk replies within one business day.
            </p>
            <div className="mt-6 space-y-2 text-sm">
              {support.email && (
                <a
                  href={`mailto:${support.email}`}
                  className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Mail className="h-4 w-4 text-primary" />
                  {support.email}
                </a>
              )}
              {support.phone && (
                <a
                  href={`tel:${support.phone.replace(/[^0-9+]/g, "")}`}
                  className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Phone className="h-4 w-4 text-primary" />
                  {support.phone}
                </a>
              )}
              {support.hours && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  {support.hours}
                </p>
              )}
            </div>
          </div>
          <Accordion type="single" collapsible className="rounded-2xl border border-border bg-background px-5 elev-1">
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger className="gap-4 text-left font-medium text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Ready to get started?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Join {brand.name} and start moving shipments smarter today.
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
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl page-gutter py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Truck className="h-4 w-4" />
                </span>
                <span className="font-display text-base font-bold tracking-tight text-foreground">
                  {brand.name}
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {brand.tagline}. {brand.footerNote}
              </p>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                {support.email && (
                  <a
                    href={`mailto:${support.email}`}
                    className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Mail className="h-4 w-4 text-primary" />
                    {support.email}
                  </a>
                )}
                {support.phone && (
                  <a
                    href={`tel:${support.phone.replace(/[^0-9+]/g, "")}`}
                    className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Phone className="h-4 w-4 text-primary" />
                    {support.phone}
                  </a>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Platform</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[
                  { label: "Open dashboard", href: "/dashboard" },
                  { label: "Create an account", href: "/auth" },
                  { label: "Track a shipment", href: "/tracking" },
                  { label: "Document studio", href: "/auth?returnTo=/documents" },
                  { label: "Business suite", href: "/auth?returnTo=/business" },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Services</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[
                  { label: "Shipment control", href: "/auth?returnTo=/shipments" },
                  { label: "Airtime and bills", href: "/auth?returnTo=/vtu" },
                  { label: "Marketplace", href: "/auth?returnTo=/marketplace" },
                  { label: "Ticketing documents", href: "/auth?returnTo=/ticketing" },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">This page</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
                {support.helpCenterUrl && (
                  <li>
                    <a
                      href={support.helpCenterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      Help centre
                    </a>
                  </li>
                )}
              </ul>
              {support.hours && (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {support.hours}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 page-gutter py-5 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {brand.name}. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              Built by the {brand.name} operations team.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
