import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Factory,
  Landmark,
  MapPin,
  Moon,
  Package,
  PackageCheck,
  PackageSearch,
  Plane,
  ShieldCheck,
  Sun,
  Truck,
  Warehouse,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { RouteMap, type RouteMapStop } from "@/components/tracking/RouteMap";
import { QrCodeSvg } from "@/components/tracking/Codes";
import { useTheme } from "@/components/ThemeProvider";
import { statusBadgeClass, statusLabel, trackingUrl } from "@/lib/trackingUi";

// ─── Milestones ──────────────────────────────────────────────────────────────

const STAGES = [
  { key: "booked", label: "Booked", icon: Package },
  { key: "picked", label: "Picked up", icon: PackageCheck },
  { key: "transit", label: "In transit", icon: Plane },
  { key: "customs", label: "Customs", icon: Landmark },
  { key: "arrived", label: "Arrived", icon: Building2 },
  { key: "delivery", label: "Out for delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: Check },
] as const;

const STATUS_STAGE: Record<string, number> = {
  CREATED: 0,
  BOOKED: 0,
  PICKED_UP: 1,
  PROCESSING: 2,
  AT_ORIGIN_FACILITY: 2,
  DEPARTED_ORIGIN: 2,
  IN_TRANSIT: 2,
  ARRIVED_DESTINATION_COUNTRY: 2,
  CUSTOMS_CLEARANCE: 3,
  CUSTOMS_CLEARED: 3,
  AT_DESTINATION_FACILITY: 4,
  OUT_FOR_DELIVERY: 5,
  DELIVERY_ATTEMPTED: 5,
  DELIVERED: 6,
};

const ISSUE_STATUSES = ["EXCEPTION", "ON_HOLD", "CANCELLED", "RETURNED"];

const STOP_ICONS: Record<string, typeof MapPin> = {
  warehouse: Warehouse,
  airport: Plane,
  sorting_center: Factory,
  distribution_center: Building2,
  customs_facility: Landmark,
  delivery_hub: Truck,
};

function cityCountry(o: { city?: string | null; country?: string | null; label?: string } | null | undefined) {
  if (!o) return "—";
  const parts = [o.city, o.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (o.label ?? "—");
}

function fmtDate(ts: number | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, opts ?? { month: "long", day: "numeric", year: "numeric" });
}

function fmtDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// ─── Theme toggle ────────────────────────────────────────────────────────────

/**
 * Public pages are reachable signed-out, so the toggle reads/writes the same
 * `cloudie-theme` preference as the rest of the app via ThemeProvider.
 */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "light" ? "Dark" : "Light";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${next.toLowerCase()} theme`}
      title={`Switch to ${next.toLowerCase()} theme`}
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  );
}

// ─── Search screen ───────────────────────────────────────────────────────────

function TrackingSearch() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="space-y-8 text-center"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <PackageSearch className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Track your shipment</h1>
          <p className="text-sm text-muted-foreground">
            Enter a tracking number to see live status, route map and the full timeline.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const tn = String(data.get("tn") ?? "").trim();
            if (tn) window.location.href = `/tracking/${encodeURIComponent(tn)}`;
          }}
        >
          <Input name="tn" placeholder="e.g. TRK-XXXXXXXXXXXX" className="h-12 flex-1 text-center sm:text-left" autoFocus required />
          <Button type="submit" size="lg" className="h-12 px-8">
            Track
          </Button>
        </form>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Only intentionally public information is shown — never addresses or contact details.
        </p>
      </motion.div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PublicTracking() {
  const { trackingNumber } = useParams<{ trackingNumber: string }>();
  const tracking = useQuery(
    api.trackingQueries.publicTracking,
    trackingNumber ? { trackingNumber } : "skip",
  );
  const [copied, setCopied] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const stageIndex = tracking ? (STATUS_STAGE[tracking.status] ?? 0) : 0;
  const isDelivered = tracking?.status === "DELIVERED";
  const hasIssue = tracking ? ISSUE_STATUSES.includes(tracking.status) : false;

  const mapStops = useMemo<RouteMapStop[]>(() => {
    if (!tracking) return [];
    const out: RouteMapStop[] = [];
    const seen: { lon: number; lat: number }[] = [];
    const push = (s: RouteMapStop) => {
      if (!Number.isFinite(s.lon) || !Number.isFinite(s.lat)) return;
      const dup = seen.some((p) => Math.abs(p.lon - s.lon) < 0.6 && Math.abs(p.lat - s.lat) < 0.6);
      if (dup) return;
      seen.push({ lon: s.lon, lat: s.lat });
      out.push(s);
    };

    if (tracking.origin?.latitude != null && tracking.origin?.longitude != null) {
      push({
        label: tracking.origin.city ?? tracking.origin.country ?? "Origin",
        sublabel: tracking.origin.country,
        lon: tracking.origin.longitude,
        lat: tracking.origin.latitude,
        state: "done",
        kind: "origin",
      });
    }
    for (const s of tracking.route) {
      if (s.latitude == null || s.longitude == null) continue;
      push({
        label: s.city ?? s.label,
        sublabel: s.country ?? s.label,
        lon: s.longitude,
        lat: s.latitude,
        state: s.status === "arrived" || s.status === "departed" ? "done" : "todo",
        kind: "stop",
      });
    }
    const cur = tracking.currentLocation;
    if (cur?.latitude != null && cur?.longitude != null) {
      push({
        label: cur.city ?? cur.label,
        sublabel: cur.country ?? undefined,
        lon: cur.longitude,
        lat: cur.latitude,
        state: isDelivered ? "done" : "current",
        kind: "stop",
      });
    }
    if (tracking.destination?.latitude != null && tracking.destination?.longitude != null) {
      push({
        label: tracking.destination.city ?? tracking.destination.country ?? "Destination",
        sublabel: tracking.destination.country,
        lon: tracking.destination.longitude,
        lat: tracking.destination.latitude,
        state: isDelivered ? "done" : "todo",
        kind: "destination",
      });
    }
    return out;
  }, [tracking, isDelivered]);

  const groups = useMemo(() => {
    type Events = NonNullable<typeof tracking>["events"];
    if (!tracking) return [] as { day: string; items: Events }[];
    const out: { day: string; items: Events }[] = [];
    for (const e of tracking.events) {
      const day = fmtDay(e.eventTimestamp);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [tracking]);

  const visibleGroups = showAllEvents ? groups : groups.slice(0, 2);

  const copyTn = () => {
    if (!tracking) return;
    navigator.clipboard?.writeText(tracking.trackingNumber).then(
      () => {
        setCopied(true);
        toast.success("Tracking number copied");
        setTimeout(() => setCopied(false), 1800);
      },
      () => toast.error("Could not copy"),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <PackageCheck className="h-4 w-4 text-primary" />
            </span>
            <span className="text-sm font-bold tracking-tight text-foreground">
              Crestline Express<span className="text-muted-foreground"> Tracking</span>
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-1.5">
            {trackingNumber ? (
              <form
                className="hidden min-w-0 flex-1 items-center gap-2 sm:flex md:max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const tn = String(data.get("tn") ?? "").trim();
                  if (tn) window.location.href = `/tracking/${encodeURIComponent(tn)}`;
                }}
              >
                <Input name="tn" placeholder="Track another number" className="h-9" />
                <Button type="submit" size="sm" variant="outline" className="h-9">
                  Track
                </Button>
              </form>
            ) : (
              <span className="hidden text-xs text-muted-foreground sm:inline">Live shipment visibility</span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div role="note" className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Demonstration tracking page.</span> Shipment records and delivery events on this platform may be simulated and are not proof of carrier custody or delivery. Confirm real shipments directly with the carrier.</div>
        {!trackingNumber ? (
          <div className="py-10 sm:py-16">
            <TrackingSearch />
          </div>
        ) : tracking === undefined ? (
          <div className="space-y-5">
            <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
            <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
          </div>
        ) : !tracking ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-10 text-center"
          >
            < Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-base font-semibold text-foreground">Shipment not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Double-check the tracking number — they look like TRK-XXXXXXXXXXXX.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link to="/tracking">Try another number</Link>
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* ── Status hero ───────────────────────────────────────────── */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary ring-1 ring-primary/15">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verified shipment
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(tracking.status)}`}>
                      {statusLabel(tracking.status)}
                    </span>
                  </div>

                  <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                    {hasIssue ? "There is an update on your shipment" : isDelivered ? "Your shipment was delivered" : statusLabel(tracking.status)}
                  </h1>

                  <button
                    type="button"
                    onClick={copyTn}
                    className="group inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
                  >
                    {tracking.trackingNumber}
                    {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />}
                  </button>
                </div>

                <div className="shrink-0 rounded-xl border border-border bg-background/60 p-4 lg:min-w-[220px]">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {tracking.actualDelivery ? "Delivered on" : "Estimated delivery"}
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {tracking.actualDelivery
                      ? fmtDate(tracking.actualDelivery)
                      : tracking.estimatedDelivery
                        ? fmtDate(tracking.estimatedDelivery)
                        : "Pending"}
                  </p>
                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {tracking.serviceName && (
                      <div className="flex justify-between gap-3">
                        <dt>Service</dt>
                        <dd className="font-medium text-foreground">{tracking.serviceName}</dd>
                      </div>
                    )}
                    {tracking.carrierName && (
                      <div className="flex justify-between gap-3">
                        <dt>Carrier</dt>
                        <dd className="font-medium text-foreground">{tracking.carrierName}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt>Progress</dt>
                      <dd className="font-medium text-foreground">{tracking.progress}%</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Progress */}
              <div className="border-t border-border px-5 py-4 sm:px-7">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${tracking.progress}%` }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                </div>

                {/* Milestone stepper */}
                <ol className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {STAGES.map((s, i) => {
                    const done = i < stageIndex || (i === stageIndex && isDelivered);
                    const active = i === stageIndex && !isDelivered;
                    const Icon = s.icon;
                    return (
                      <li key={s.key} className="flex min-w-[104px] flex-1 flex-col items-center gap-1.5 text-center">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                            done
                              ? "border-primary bg-primary text-primary-foreground"
                              : active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className={`text-[11px] leading-tight ${done || active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>

            {/* ── Map + summary ─────────────────────────────────────────── */}
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                {mapStops.length >= 2 ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Live route</h2>
                      </div>
                      {tracking.currentLocation && (
                        <span className="truncate text-xs text-muted-foreground">
                          Now: <span className="font-medium text-foreground">{cityCountry(tracking.currentLocation)}</span>
                        </span>
                      )}
                    </div>
                    <RouteMap
                      stops={mapStops}
                      inTransit={!isDelivered && !hasIssue}
                      className="h-[260px] rounded-none border-0 sm:h-[320px] lg:h-[380px]"
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Route</h2>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Coordinates have not been recorded for this shipment yet, so a map cannot be drawn. The stop list below
                      reflects the planned journey.
                    </p>
                  </div>
                )}

                {/* Route stop list */}
                {(tracking.route.length > 0 || tracking.currentLocation) && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-sm font-semibold text-foreground">Journey</h2>
                    <ol className="mt-4 space-y-4">
                      {[
                        ...(tracking.origin
                          ? [{ label: cityCountry(tracking.origin), status: "origin", ts: tracking.shippedAt, kind: "origin" }]
                          : []),
                        ...tracking.route.map((s) => ({
                          label: cityCountry({ city: s.city, country: s.country, label: s.label }),
                          status: s.status,
                          ts: s.departureAt ?? s.arrivalAt,
                          kind: s.label,
                        })),
                        ...(tracking.destination
                          ? [{ label: cityCountry(tracking.destination), status: isDelivered ? "arrived" : "destination", ts: tracking.actualDelivery, kind: "destination" }]
                          : []),
                      ].map((stop, i, arr) => {
                        const Icon = STOP_ICONS[stop.kind] ?? MapPin;
                        const done = stop.status === "arrived" || stop.status === "departed" || stop.status === "origin";
                        return (
                          <li key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                                  done ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                            </div>
                            <div className="pb-1">
                              <p className={`text-sm ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}>{stop.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {stop.ts ? new Date(stop.ts).toLocaleString() : statusLabel(stop.status)}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>

              {/* Details + QR */}
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold text-foreground">Shipment details</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    {[
                      { label: "From", value: cityCountry(tracking.origin) },
                      { label: "To", value: tracking.destination ? cityCountry(tracking.destination) : [tracking.destinationCity, tracking.destinationCountry].filter(Boolean).join(", ") || "—" },
                      { label: "Service", value: tracking.serviceName ?? "—" },
                      { label: "Carrier", value: tracking.carrierName ?? "—" },
                      {
                        label: "Weight",
                        value: tracking.totalWeight ? `${tracking.totalWeight} ${tracking.weightUnit ?? ""}` : "—",
                      },
                      { label: "Contents", value: tracking.packageDescription ?? "—" },
                      { label: "Shipped", value: fmtDate(tracking.shippedAt ?? tracking.createdAt) ?? "—" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-4 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className="max-w-[60%] text-right font-medium text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-4">
                    <div className="shrink-0 rounded-xl border border-border bg-background p-2">
                      <QrCodeSvg value={trackingUrl(tracking.trackingNumber)} size={84} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Share tracking</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Scan to open this page on any device — useful for the recipient.
                      </p>
                    </div>
                  </div>
                </div>


              </div>
            </section>

            {/* ── Timeline ──────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Tracking history</h2>
                <span className="text-xs text-muted-foreground">
                  {tracking.events.length} update{tracking.events.length === 1 ? "" : "s"}
                </span>
              </div>

              {tracking.events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No events recorded yet.</p>
              ) : (
                <div className="mt-5 space-y-6">
                  {visibleGroups.map((g, gi) => (
                    <div key={g.day}>
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.day}</p>
                      <div className="relative ml-2 space-y-5 border-l border-border pl-6">
                        {g.items.map((e, i) => {
                          const latest = gi === 0 && i === 0;
                          return (
                            <motion.div
                              key={`${g.day}-${i}`}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.2) }}
                              className="relative"
                            >
                              <span
                                className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 ${
                                  latest ? "border-primary bg-primary" : "border-border bg-card"
                                }`}
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{e.title}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(e.status)}`}>
                                  {statusLabel(e.status)}
                                </span>
                              </div>
                              {e.description && <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>}
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                <span>{new Date(e.eventTimestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                                {e.locationLabel && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {e.locationLabel}
                                  </span>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {groups.length > 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowAllEvents((v) => !v)}
                    >
                      <ChevronDown className={`mr-1.5 h-3.5 w-3.5 transition-transform ${showAllEvents ? "rotate-180" : ""}`} />
                      {showAllEvents ? "Show less" : `Show all ${tracking.events.length} updates`}
                    </Button>
                  )}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </main>
    </div>
  );
}
