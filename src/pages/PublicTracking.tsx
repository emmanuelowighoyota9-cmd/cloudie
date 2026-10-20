import { Component, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Cloud,
  Clock,
  Package,
  PackageSearch,
  Search,
  ShieldCheck,
  TriangleAlert,
  Trophy,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { ShipmentEvent } from "@/components/tracking/ShipmentEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { notifyNeonQueries } from "@/lib/neonClient";
import { toViewEvents, toViewShipment } from "@/lib/shipmentView";
import { statusLabel } from "@/lib/trackingUi";
import { cn } from "@/lib/utils";

/* ── Route stages ──────────────────────────────────────────────── */

const STAGES = [
  { key: "created", label: "Created" },
  { key: "dispatched", label: "Dispatched" },
  { key: "transit", label: "In transit" },
  { key: "delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
] as const;

const STAGE_BY_STATUS: Record<string, number> = {
  PENDING: 0,
  CREATED: 0,
  BOOKED: 0,
  PICKED_UP: 1,
  PROCESSING: 1,
  AT_ORIGIN_FACILITY: 1,
  DEPARTED_ORIGIN: 1,
  IN_TRANSIT: 2,
  ARRIVED_DESTINATION_COUNTRY: 2,
  CUSTOMS_CLEARANCE: 2,
  CUSTOMS_CLEARED: 2,
  AT_DESTINATION_FACILITY: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERY_ATTEMPTED: 3,
  DELIVERED: 4,
  FAILED: 2,
};

/** States that mean the shipment is not progressing as planned. */
const TROUBLE = ["EXCEPTION", "ON_HOLD", "CANCELLED", "RETURNED", "FAILED"];

function stageFor(status: string): number {
  return STAGE_BY_STATUS[status] ?? 2;
}

function etaLabel(estimated: number | null, delivered: boolean, deliveredAt: number | null) {
  if (delivered) {
    return deliveredAt
      ? `Delivered ${new Date(deliveredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "Delivered";
  }
  if (!estimated) return "ETA pending";
  const days = Math.ceil((estimated - Date.now()) / 86_400_000);
  if (days <= 0) return "ETA: due today";
  return `ETA: ${days} day${days === 1 ? "" : "s"}`;
}

/* ── Shell ─────────────────────────────────────────────────────── */

function PublicShell({ children }: { children: ReactNode }) {
  const { brand } = usePlatformConfig();
  const wordmark = brand.name.split(" ")[0] || "Cloudie";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/20">
              <Cloud className="size-3.5" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight">{wordmark}</span>
          </Link>
          <Link
            to="/track"
            className="text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Track another
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6 sm:py-8">{children}</main>

      <footer className="mx-auto w-full max-w-[640px] px-4 pb-8 pt-2 text-center">
        <p className="text-[11px] text-muted-foreground">Powered by {wordmark}</p>
      </footer>
    </div>
  );
}

/* ── Search (no tracking number in the URL) ────────────────────── */

function TrackingSearch() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-6 pt-6 text-center sm:pt-12"
    >
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <PackageSearch className="size-7 text-primary" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Track a shipment</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Enter the reference from your confirmation to follow the parcel.
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const ref = String(data.get("ref") ?? "").trim();
          if (ref) navigate(`/track/${encodeURIComponent(ref)}`);
        }}
      >
        <Input
          name="ref"
          placeholder="TRK-XXXXXXXXXXXX"
          aria-label="Tracking number"
          className="h-11 flex-1 rounded-xl text-center font-mono text-xs sm:text-left"
          autoFocus
          required
        />
        <Button type="submit" className="h-11 gap-1.5 rounded-xl px-6">
          <Search className="size-4" aria-hidden /> Track
        </Button>
      </form>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden /> Public tracking never shows addresses or contact details.
      </p>
    </motion.div>
  );
}

/* ── Tracking view ─────────────────────────────────────────────── */

function TrackingView({ reference }: { reference: string }) {
  const tracking = useQuery(api.trackingQueries.publicTracking, { trackingNumber: reference });
  const [showAll, setShowAll] = useState(false);

  if (tracking === undefined) return <TrackingSkeleton />;

  // The adapter flags a 429 instead of a missing shipment, so the page can
  // explain the wait rather than claiming the reference is unknown.
  if (tracking && (tracking as { __rateLimited?: boolean }).__rateLimited) {
    return (
      <FailurePanel
        error={{ message: "429 rate limit" }}
        onRetry={() => notifyNeonQueries()}
      />
    );
  }

  if (!tracking) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8"
      >
        <Package className="mx-auto size-9 text-muted-foreground/40" aria-hidden />
        <h1 className="mt-3 text-base font-semibold text-foreground">No shipment matches this reference</h1>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          <span className="font-mono text-foreground">{reference.toUpperCase()}</span> isn't in our system yet.
          References look like TRK-XXXXXXXXXXXX, and new labels can take a few minutes to register.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
          <Link to="/track">
            <Search className="size-3.5" /> Try another reference
          </Link>
        </Button>
      </motion.div>
    );
  }

  const view = toViewShipment(tracking);
  const delivered = view.status === "DELIVERED";
  const trouble = TROUBLE.includes(view.status);
  const stage = delivered ? 4 : stageFor(view.status);
  const originCity = view.originCity || "Origin";
  const destinationCity = view.destinationCity || "Destination";
  const events = toViewEvents(tracking.events);
  const visible = showAll ? events : events.slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5 sm:p-6",
          delivered
            ? "border-success/30 bg-success/[0.06]"
            : trouble
              ? "border-warning/40 bg-warning/[0.07]"
              : "border-border bg-card",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md border border-border bg-background/70 px-2 py-1 font-mono text-[11px] tracking-tight text-foreground">
            {tracking.trackingNumber}
          </span>
          <span className="text-[11px] text-muted-foreground">{view.service}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {delivered ? (
            <Trophy className="size-6 text-success" aria-hidden />
          ) : trouble ? (
            <TriangleAlert className="size-6 text-warning" aria-hidden />
          ) : null}
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
              delivered
                ? "border-success/30 bg-success/12 text-success"
                : trouble
                  ? "border-warning/40 bg-warning/12 text-warning"
                  : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                delivered ? "bg-success" : trouble ? "bg-warning" : "bg-primary",
              )}
              aria-hidden
            />
            {statusLabel(view.status)}
          </span>
        </div>

        <p className="mt-3 text-lg font-bold tracking-tight text-foreground">
          {etaLabel(view.estimatedDelivery, delivered, view.deliveredAt)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {delivered
            ? "Signed for at the destination address"
            : trouble
              ? "The carrier has flagged this shipment — check the timeline below."
              : "Updates are posted as the parcel is scanned"}
        </p>

        <RouteTrack origin={originCity} destination={destinationCity} stage={stage} />
      </motion.section>

      {/* Timeline */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-label text-primary">Timeline</h2>
          <p className="text-[11px] text-muted-foreground">
            {view.recipientMasked ? (
              <>
                Recipient <span className="font-semibold text-foreground">{view.recipientMasked}</span>
              </>
            ) : (
              "Recipient details are private"
            )}
          </p>
        </div>

        {events.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No scans yet — the first update appears as soon as the carrier handles the parcel.
          </p>
        ) : (
          <>
            <ol className="mt-4">
              {visible.map((event, index) => (
                <ShipmentEvent
                  key={event.id}
                  status={event.status}
                  title={event.title}
                  description={event.description}
                  locationLabel={event.location}
                  timestamp={event.timestamp}
                  latest={index === 0}
                  last={index === visible.length - 1}
                />
              ))}
            </ol>
            {events.length > 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full gap-1.5 text-[11px]"
                onClick={() => setShowAll((value) => !value)}
              >
                <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} aria-hidden />
                {showAll ? "Show latest only" : `Show all ${events.length} updates`}
              </Button>
            )}
          </>
        )}
      </section>

      <p className="flex items-start gap-1.5 px-1 text-[10px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
        Public view: status, route and timeline only. No names, phone numbers, emails or addresses are shown.
      </p>
    </div>
  );
}

/* ── Route progress ────────────────────────────────────────────── */

function RouteTrack({ origin, destination, stage }: { origin: string; destination: string; stage: number }) {
  const reduced = useReducedMotion();

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{origin}</p>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-right text-xs font-semibold text-foreground">{destination}</p>
      </div>

      <div className="relative mt-4">
        <div className="absolute left-[10%] right-[10%] top-[5px] h-px bg-border" aria-hidden />
        <motion.div
          className="absolute left-[10%] top-[5px] h-px w-[80%] origin-left bg-primary"
          initial={false}
          animate={{ scaleX: stage / (STAGES.length - 1) }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          aria-hidden
        />

        <ol className="relative flex">
          {STAGES.map((item, index) => {
            const done = index < stage;
            const current = index === stage;
            return (
              <li key={item.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="relative flex size-2.5 items-center justify-center">
                  {current && !reduced && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-primary/50"
                      animate={{ scale: [1, 2.4, 1], opacity: [0.55, 0, 0.55] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "relative size-2.5 rounded-full border transition-colors",
                      done || current ? "border-primary bg-primary" : "border-border bg-card",
                    )}
                    aria-hidden
                  />
                </span>
                <span
                  className={cn(
                    "px-0.5 text-center text-[9px] leading-tight sm:text-[10px]",
                    current
                      ? "font-semibold text-foreground"
                      : done
                        ? "text-foreground/80"
                        : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ── Loading / failure states ──────────────────────────────────── */

function TrackingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading tracking">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="mt-4 h-8 w-36 rounded-full" />
        <Skeleton className="mt-3 h-5 w-28" />
        <div className="mt-7 flex justify-between">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex flex-col items-center gap-2">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-2 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-3 w-24" />
        <div className="mt-5 space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isRateLimited(error: unknown): boolean {
  const message = `${(error as Error)?.message ?? ""} ${JSON.stringify((error as { data?: unknown })?.data ?? "")}`.toLowerCase();
  return message.includes("429") || message.includes("rate limit") || message.includes("too many");
}

function FailurePanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const limited = isRateLimited(error);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border p-6 text-center sm:p-8",
        limited ? "border-warning/40 bg-warning/[0.07]" : "border-border bg-card",
      )}
    >
      {limited ? (
        <Clock className="mx-auto size-9 text-warning" aria-hidden />
      ) : (
        <CircleAlert className="mx-auto size-9 text-muted-foreground/50" aria-hidden />
      )}
      <h1 className="mt-3 text-base font-semibold text-foreground">
        {limited ? "Too many tracking lookups" : "We couldn't load this shipment"}
      </h1>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {limited
          ? "Tracking is rate limited to keep the service fast for everyone. Wait a minute, then try again — your reference is unchanged."
          : "Something went wrong while fetching this shipment. Try again in a moment."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={onRetry}>
          Try again
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/track">
            <Search className="size-3.5" /> Search another reference
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}

/** Catches query failures so a 429 or backend hiccup renders a friendly page. */
class TrackingBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <FailurePanel error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function PublicTracking() {
  const params = useParams<{ trackingNumber?: string; id?: string }>();
  const reference = useMemo(
    () => (params.trackingNumber ?? params.id ?? "").trim(),
    [params.trackingNumber, params.id],
  );

  return (
    <PublicShell>
      {reference ? (
        <TrackingBoundary resetKey={reference}>
          <TrackingView reference={reference} />
        </TrackingBoundary>
      ) : (
        <TrackingSearch />
      )}
    </PublicShell>
  );
}
