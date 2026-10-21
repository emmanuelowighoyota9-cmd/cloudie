import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { format as formatDate } from "date-fns";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Truck,
  X,
  Ban,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { neonApi } from "@/lib/neonApi";
import { notifyNeonQueries } from "@/lib/neonClient";
import { trackingUrl } from "@/lib/trackingUi";
import { formatRelativeTime } from "@/components/LedgerRow";
import { JobProgress } from "@/components/JobProgress";
import { StatusBadge } from "@/components/admin/shared";
import { Reveal } from "@/components/motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* ── Model ─────────────────────────────────────────────────────── */

type Tab = "all" | "pending" | "in_transit" | "delivered" | "failed";

/**
 * Statuses are stored lowercase by the shipments table, so the tab groups map
 * straight onto them. Cancelled shipments intentionally appear under All only —
 * the Master Prompt's tab set has no cancelled bucket.
 */
const TAB_STATUSES: Record<Exclude<Tab, "all">, string[]> = {
  pending: ["pending"],
  in_transit: ["picked_up", "in_transit", "out_for_delivery"],
  delivered: ["delivered"],
  failed: ["failed"],
};

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
];

type Shipment = {
  id: string;
  trackingNumber: string;
  /** Lowercase DB status. */
  status: string;
  recipientName: string;
  recipientCity: string;
  recipientCountry: string;
  senderCity: string;
  senderCountry: string;
  serviceType: string;
  createdAt: number;
};

const CLOSED_STATUSES = new Set(["delivered", "cancelled", "failed"]);

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function parseShipments(rows: unknown): Shipment[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((raw: Record<string, unknown>, index: number) => {
      const origin = (raw.origin as Record<string, unknown> | undefined) ?? {};
      const destination = (raw.destination as Record<string, unknown> | undefined) ?? {};
      const id = text(raw._id ?? raw.id) || `shipment_${index}`;
      return {
        id,
        trackingNumber: text(raw.trackingNumber ?? raw.tracking_number),
        status: text(raw.status ?? "pending").toLowerCase(),
        recipientName: text(raw.recipientName ?? raw.recipient_name),
        recipientCity: text(raw.recipientCity ?? raw.recipient_city ?? destination.city),
        recipientCountry: text(raw.recipientCountry ?? raw.recipient_country ?? destination.country),
        senderCity: text(raw.senderCity ?? raw.sender_city ?? origin.city),
        senderCountry: text(raw.senderCountry ?? raw.sender_country ?? origin.country),
        serviceType: text(raw.serviceType ?? raw.service_type ?? "standard"),
        createdAt: Number(raw.createdAt ?? raw.created_at ?? 0),
      };
    })
    .filter((shipment) => shipment.id)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function serviceLabel(value: string): string {
  const clean = value.replace(/_/g, " ").trim();
  if (!clean) return "Standard";
  return clean.replace(/\b\w/g, (character) => character.toUpperCase());
}

function routeLabel(shipment: Shipment): string {
  const from = [shipment.senderCity, shipment.senderCountry].filter(Boolean).join(", ") || "Origin";
  const to = [shipment.recipientCity, shipment.recipientCountry].filter(Boolean).join(", ") || "Destination";
  return `${from} → ${to}`;
}

function presetRange(days: number): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function Shipments() {
  const navigate = useNavigate();
  const shipmentsQuery = useQuery(api.trackingUser.myShipments, {});
  const shipments = useMemo(() => parseShipments(shipmentsQuery), [shipmentsQuery]);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [types, setTypes] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Shipment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  /*
   * Error state: a failed request collapses to an empty list, so the only
   * observable failure is a query that never answers. After 8s we stop
   * calling it "loading" and offer a retry.
   */
  const [retryTick, setRetryTick] = useState(0);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (shipmentsQuery !== undefined) {
      setStuck(false);
      return;
    }
    const timer = window.setTimeout(() => setStuck(true), 8000);
    return () => window.clearTimeout(timer);
  }, [shipmentsQuery, retryTick]);
  const retry = () => {
    notifyNeonQueries();
    setRetryTick((tick) => tick + 1);
  };

  const stats = useMemo(() => {
    const inTransit = shipments.filter((s) => TAB_STATUSES.in_transit.includes(s.status)).length;
    const delivered = shipments.filter((s) => s.status === "delivered").length;
    const active = shipments.filter((s) => !CLOSED_STATUSES.has(s.status)).length;
    return { active, inTransit, delivered };
  }, [shipments]);

  const serviceTypes = useMemo(() => {
    const unique = new Set<string>();
    for (const shipment of shipments) unique.add(shipment.serviceType || "standard");
    return [...unique].sort();
  }, [shipments]);

  /** Shipments whose carrier number hasn't been issued yet (placeholder TRK- id). */
  const generating = useMemo(
    () => shipments.filter((shipment) => shipment.trackingNumber.startsWith("TRK-")).length,
    [shipments],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const from = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : null;
    const to = range?.to ? new Date(range.to).setHours(23, 59, 59, 999) : null;
    return shipments.filter((shipment) => {
      if (tab !== "all" && !TAB_STATUSES[tab].includes(shipment.status)) return false;
      if (types.length > 0 && !types.includes(shipment.serviceType || "standard")) return false;
      if (from !== null && shipment.createdAt < from) return false;
      if (to !== null && shipment.createdAt > to) return false;
      if (term) {
        const haystack = `${shipment.trackingNumber} ${shipment.recipientName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [shipments, tab, types, range, search]);

  const activeFilterCount = (types.length > 0 ? 1 : 0) + (range?.from || range?.to ? 1 : 0);
  const hasQuery = search.trim().length > 0;
  const isFiltered = activeFilterCount > 0 || hasQuery || tab !== "all";

  const clearFilters = () => {
    setTypes([]);
    setRange(undefined);
    setSearch("");
    setTab("all");
  };

  const copyTrackingLink = async (shipment: Shipment) => {
    try {
      await navigator.clipboard.writeText(trackingUrl(shipment.trackingNumber));
      toast.success("Tracking link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  /*
   * Cancelling writes through the app's own API client: the customer-facing
   * Convex mutation only accepts detail edits, while PATCH /api/shipments/:id
   * is the endpoint that owns the status transition (and records the event).
   */
  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await neonApi.updateShipment(cancelTarget.id, { status: "cancelled" });
      notifyNeonQueries();
      toast.success(`Shipment ${cancelTarget.trackingNumber} cancelled`);
      setCancelTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel this shipment");
    } finally {
      setCancelling(false);
    }
  };

  const loading = shipmentsQuery === undefined;
  const isEmpty = !loading && shipments.length === 0;
  const isFilteredEmpty = !loading && shipments.length > 0 && filtered.length === 0;

  const rangeLabel = range?.from
    ? range.to
      ? `${formatDate(range.from, "d MMM")} – ${formatDate(range.to, "d MMM")}`
      : `From ${formatDate(range.from, "d MMM")}`
    : "Any date";

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="section-label text-primary">Personal workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Shipments</h1>
          {loading ? (
            <Skeleton className="mt-2 h-4 w-64" />
          ) : (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{stats.active} active</span>
              <span aria-hidden>·</span>
              <span>{stats.inTransit} in transit</span>
              <span aria-hidden>·</span>
              <span>{stats.delivered} delivered</span>
            </p>
          )}
        </div>
        <Button asChild size="lg" className="shrink-0 gap-2">
          <Link to="/shipments/new">
            <Plus className="size-4" /> New shipment
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="whitespace-nowrap">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search + filters */}
      <Reveal>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tracking number or recipient"
              aria-label="Search shipments"
              className="h-10 pl-9 pr-9"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setFiltersOpen(true)}
            aria-label="Open shipment filters"
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </Reveal>

      {/* Pending job */}
      {!loading && generating > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Generating tracking link…</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {generating} shipment{generating === 1 ? "" : "s"} awaiting a carrier number.
              </p>
            </div>
          </div>
          <JobProgress className="w-full sm:w-40" />
        </div>
      )}

      {/* Error banner */}
      {stuck && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>We couldn&apos;t load your shipments. Check your connection and try again.</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {/* List */}
      {!stuck && (
        <Card className="overflow-hidden p-0 py-0">
          {loading ? (
            <div role="status" aria-label="Loading shipments">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[170px]">Tracking</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="w-[130px]">Status</TableHead>
                      <TableHead className="w-[110px]">Created</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="ml-auto size-7 rounded-md" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y divide-border md:hidden">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="size-8 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ) : isEmpty ? (
            <Empty className="border-border py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Package /></EmptyMedia>
                <EmptyTitle>No shipments yet</EmptyTitle>
                <EmptyDescription>
                  Create a shipment and a live tracking number is generated for it right away.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/shipments/new">
                    <Plus className="size-4" /> New shipment
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : isFilteredEmpty ? (
            <Empty className="border-border py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Truck /></EmptyMedia>
                <EmptyTitle>No shipments match these filters</EmptyTitle>
                <EmptyDescription>
                  Try a different tab, a wider date range, or clear the search.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[170px]">Tracking</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="w-[130px]">Status</TableHead>
                      <TableHead className="w-[110px]">Created</TableHead>
                      <TableHead className="w-[60px] text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((shipment) => (
                      <TableRow
                        key={shipment.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/shipments/${shipment.id}`)}
                      >
                        <TableCell className="whitespace-nowrap">
                          <Link
                            to={`/shipments/${shipment.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="font-mono text-xs font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {shipment.trackingNumber || "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {shipment.recipientName || "—"}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[shipment.recipientCity, shipment.recipientCountry].filter(Boolean).join(", ") || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="truncate">
                              {[shipment.senderCity, shipment.senderCountry].filter(Boolean).join(", ") || "Origin"}
                            </span>
                            <ArrowRight className="size-3 shrink-0 opacity-70" aria-hidden />
                            <span className="truncate text-foreground">
                              {[shipment.recipientCity, shipment.recipientCountry].filter(Boolean).join(", ") || "Destination"}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge domain="shipment" value={shipment.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatRelativeTime(shipment.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ShipmentActions
                            shipment={shipment}
                            onCopy={() => void copyTrackingLink(shipment)}
                            onCancel={() => setCancelTarget(shipment)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-border md:hidden">
                {filtered.map((shipment) => (
                  <li key={shipment.id} className="flex items-start gap-2 p-3">
                    <Link to={`/shipments/${shipment.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-foreground">
                          {shipment.trackingNumber || "—"}
                        </span>
                        <StatusBadge domain="shipment" value={shipment.status} />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {shipment.recipientName || "—"}
                        </span>
                        <span aria-hidden className="px-1">·</span>
                        {routeLabel(shipment)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatRelativeTime(shipment.createdAt)}
                      </p>
                    </Link>
                    <ShipmentActions
                      shipment={shipment}
                      onCopy={() => void copyTrackingLink(shipment)}
                      onCancel={() => setCancelTarget(shipment)}
                    />
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? "shipment" : "shipments"}
                  {isFiltered && ` · ${shipments.length} total`}
                </p>
                {isFiltered && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Tracking details reflect records entered into this workspace. Confirm carrier custody, delivery
        status, and shipment charges directly with the carrier.
      </p>

      {/* Filter sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filter shipments</SheetTitle>
            <SheetDescription>
              Narrow the list by creation date and service type.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date range
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "7 days", days: 7 },
                  { label: "30 days", days: 30 },
                  { label: "90 days", days: 90 },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setRange(presetRange(preset.days))}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setRange(undefined)}
                  disabled={!range?.from && !range?.to}
                >
                  Any date
                </Button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CalendarDays className="size-3.5" />
                {rangeLabel}
              </div>
              <div className="rounded-xl border border-border p-1">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  defaultMonth={range?.from ?? new Date()}
                  numberOfMonths={1}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Service type
              </p>
              {serviceTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No shipment types to filter yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {serviceTypes.map((type) => {
                    const active = types.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setTypes((current) =>
                            current.includes(type)
                              ? current.filter((value) => value !== type)
                              : [...current, type],
                          )
                        }
                        className={cn(
                          "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors duration-200",
                          active
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {serviceLabel(type)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto flex items-center gap-2 pt-6">
            <Button
              variant="outline"
              className="flex-1"
              onClick={clearFilters}
              disabled={activeFilterCount === 0 && !hasQuery && tab === "all"}
            >
              Clear all
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel confirmation */}
      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this shipment?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.trackingNumber} will be marked cancelled. Tracking stops immediately and this
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep shipment</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={cancelling}
              onClick={(event) => {
                event.preventDefault();
                void confirmCancel();
              }}
            >
              {cancelling ? "Cancelling…" : "Cancel shipment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Row actions ───────────────────────────────────────────────── */

function ShipmentActions({
  shipment,
  onCopy,
  onCancel,
}: {
  shipment: Shipment;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const closed = CLOSED_STATUSES.has(shipment.status);

  return (
    <div onClick={(event) => event.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${shipment.trackingNumber}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate font-mono text-[11px] text-muted-foreground">
            {shipment.trackingNumber}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={`/shipments/${shipment.id}`}>
              <Eye className="mr-2 size-4" /> View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopy}>
            <Copy className="mr-2 size-4" /> Copy tracking link
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/track/${encodeURIComponent(shipment.trackingNumber)}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 size-4" /> Open public page
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onCancel}
            disabled={closed}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="mr-2 size-4" /> Cancel shipment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
