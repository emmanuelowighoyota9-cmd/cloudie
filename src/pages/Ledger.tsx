import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { format as formatDate } from "date-fns";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Coins,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Mail,
  Package,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { notifyNeonQueries } from "@/lib/neonClient";
import { formatNgn } from "@/lib/pricing";
import { workspaceFromLedgerType } from "@/components/LedgerRow";
import { downloadCsv } from "@/components/admin/shared";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* ── Model ─────────────────────────────────────────────────────── */

type Tab = "all" | "credits" | "debits";

type Entry = {
  id: string;
  amountNgn: number;
  balanceAfterNgn: number;
  description: string;
  type: string;
  reference: string | null;
  createdAt: number;
  workspace: string;
};

const PAGE_SIZE = 12;
/** The ledger endpoint caps a page at 100 rows and exposes no cursor. */
const FETCH_LIMIT = 100;

const TYPE_LABELS: Record<string, string> = {
  credit: "Wallet credit",
  bonus: "Bonus",
  refund: "Refund",
  purchase: "Purchase",
  admin_adjust: "Admin adjustment",
  deposit: "Deposit",
  service_charge: "Service charge",
  referral_reward: "Referral reward",
  shipment_creation: "Shipment",
  document_generation: "Document",
  email_dispatch: "Email",
  image_rendering: "Render",
  vtu_purchase: "VTU purchase",
  vtu_refund: "VTU refund",
  marketplace_purchase: "Marketplace",
};

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Shipments: Package,
  Documents: FileText,
  VTU: Smartphone,
  Email: Mail,
  Marketplace: ShoppingBag,
  Referrals: UserPlus,
  Admin: ShieldCheck,
  Wallet,
};

const ENTITY_ROUTES: Record<string, { to: string; label: string }> = {
  Shipments: { to: "/shipments", label: "Shipments" },
  Documents: { to: "/documents", label: "Documents" },
  VTU: { to: "/vtu/history", label: "VTU history" },
  Email: { to: "/services/email", label: "Email campaigns" },
  Marketplace: { to: "/orders", label: "Orders" },
  Referrals: { to: "/referrals", label: "Referrals" },
  Admin: { to: "/settings", label: "Settings" },
  Wallet: { to: "/personal/wallet", label: "Wallet" },
};

function parseEntries(rows: unknown): Entry[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((raw: Record<string, unknown>, index: number) => {
      const description = String(raw.description ?? "Wallet activity");
      const type = String(raw.type ?? "");
      const reference = raw.reference == null ? "" : String(raw.reference).trim();
      return {
        id: String(raw._id ?? raw.id ?? `entry_${index}`),
        amountNgn: Number(raw.amountNgn ?? 0),
        balanceAfterNgn: Number(raw.balanceAfterNgn ?? 0),
        description,
        type,
        reference: reference || null,
        createdAt: Number(raw.createdAt ?? 0),
        workspace: workspaceFromLedgerType(type, description),
      };
    })
    .filter((entry) => Number.isFinite(entry.amountNgn) && entry.createdAt > 0)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Same "last N days" presets that the range popover offers. */
function presetRange(days: number): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/* ── Small pieces ──────────────────────────────────────────────── */

function amountClasses(credit: boolean) {
  return credit
    ? "text-emerald-600 dark:text-emerald-300"
    : "text-red-600 dark:text-red-400";
}

function signedAmount(amountNgn: number) {
  return `${amountNgn >= 0 ? "+" : "−"}₦${Math.abs(amountNgn).toLocaleString("en-NG")}`;
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-muted/60 py-1 pl-2.5 pr-2 text-[11px] font-medium text-foreground transition-colors duration-200 hover:border-primary/30 hover:bg-muted"
      aria-label={`Remove filter ${label}: ${value}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-40 truncate">{value}</span>
      <X className="size-3 text-muted-foreground" />
    </button>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function Ledger() {
  const ledger = useQuery(api.wallet.getLedger, { limit: FETCH_LIMIT });
  const shipments = useQuery(api.trackingUser.myShipments, {});

  const entries = useMemo(() => parseEntries(ledger), [ledger]);

  const [tab, setTab] = useState<Tab>("all");
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Entry | null>(null);

  /*
   * Error state: a failed request collapses to an empty array, so the only
   * observable failure is a query that never answers. After 8s we stop
   * calling it "loading" and offer a retry.
   */
  const [retryTick, setRetryTick] = useState(0);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (ledger !== undefined) {
      setStuck(false);
      return;
    }
    const timer = window.setTimeout(() => setStuck(true), 8000);
    return () => window.clearTimeout(timer);
  }, [ledger, retryTick]);
  const retry = () => {
    notifyNeonQueries();
    setRetryTick((t) => t + 1);
  };

  const allWorkspaces = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.workspace, (counts.get(entry.workspace) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [entries]);

  const minAmount = amountMin.trim() === "" ? null : Number(amountMin);
  const maxAmount = amountMax.trim() === "" ? null : Number(amountMax);
  const hasAmountFilter =
    (minAmount !== null && Number.isFinite(minAmount)) || (maxAmount !== null && Number.isFinite(maxAmount));

  const tabbed = useMemo(
    () =>
      tab === "all"
        ? entries
        : entries.filter((entry) => (tab === "credits" ? entry.amountNgn >= 0 : entry.amountNgn < 0)),
    [entries, tab],
  );

  /** Totals for the page subtitle: money in / out across the selected range. */
  const rangeTotals = useMemo(() => {
    const from = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : null;
    const to = range?.to ? new Date(range.to).setHours(23, 59, 59, 999) : null;
    let totalIn = 0;
    let totalOut = 0;
    for (const entry of entries) {
      if (from !== null && entry.createdAt < from) continue;
      if (to !== null && entry.createdAt > to) continue;
      if (entry.amountNgn >= 0) totalIn += entry.amountNgn;
      else totalOut += Math.abs(entry.amountNgn);
    }
    return { totalIn, totalOut };
  }, [entries, range]);

  const filtered = useMemo(() => {
    const from = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : null;
    const to = range?.to ? new Date(range.to).setHours(23, 59, 59, 999) : null;
    return tabbed.filter((entry) => {
      if (workspaces.length > 0 && !workspaces.includes(entry.workspace)) return false;
      if (from !== null && entry.createdAt < from) return false;
      if (to !== null && entry.createdAt > to) return false;
      const absolute = Math.abs(entry.amountNgn);
      if (minAmount !== null && Number.isFinite(minAmount) && absolute < minAmount) return false;
      if (maxAmount !== null && Number.isFinite(maxAmount) && absolute > maxAmount) return false;
      return true;
    });
  }, [tabbed, workspaces, range, minAmount, maxAmount]);

  // Any filter or tab change restarts the page window — a stale "Load more"
  // position would silently hide the rows that just matched.
  const filterKey = `${tab}|${workspaces.join(",")}|${range?.from?.toISOString() ?? ""}|${range?.to?.toISOString() ?? ""}|${amountMin}|${amountMax}`;
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filterKey]);

  const visibleRows = filtered.slice(0, visible);

  const toggleWorkspace = (name: string) =>
    setWorkspaces((current) =>
      current.includes(name) ? current.filter((w) => w !== name) : [...current, name],
    );

  const clearFilters = () => {
    setWorkspaces([]);
    setRange(undefined);
    setAmountMin("");
    setAmountMax("");
  };

  const rangeLabel = range?.from
    ? range.to
      ? `${formatDate(range.from, "d MMM yyyy")} – ${formatDate(range.to, "d MMM yyyy")}`
      : `From ${formatDate(range.from, "d MMM yyyy")}`
    : "All time";

  const amountLabel = hasAmountFilter
    ? `₦${minAmount !== null && Number.isFinite(minAmount) ? minAmount.toLocaleString("en-NG") : "0"}${
        maxAmount !== null && Number.isFinite(maxAmount) ? ` – ₦${maxAmount.toLocaleString("en-NG")}` : "+"
      }`
    : "Any amount";

  const chips: { key: string; label: string; value: string; onRemove: () => void }[] = [
    ...workspaces.map((name) => ({
      key: `ws-${name}`,
      label: "Workspace",
      value: name,
      onRemove: () => toggleWorkspace(name),
    })),
    ...(range?.from || range?.to
      ? [{ key: "range", label: "Date", value: rangeLabel, onRemove: () => setRange(undefined) }]
      : []),
    ...(hasAmountFilter
      ? [
          {
            key: "amount",
            label: "Amount",
            value: amountLabel,
            onRemove: () => {
              setAmountMin("");
              setAmountMax("");
            },
          },
        ]
      : []),
  ];

  const shipmentIndex = useMemo(() => {
    if (!Array.isArray(shipments)) return new Map<string, { id: string; status: string }>();
    const map = new Map<string, { id: string; status: string }>();
    for (const raw of shipments as Record<string, unknown>[]) {
      const trackingNumber = String(raw.trackingNumber ?? raw.tracking_number ?? "");
      const id = String(raw._id ?? raw.id ?? "");
      if (trackingNumber && id) {
        map.set(trackingNumber, { id, status: String(raw.status ?? "pending") });
      }
    }
    return map;
  }, [shipments]);

  const entityFor = (entry: Entry) => {
    if (entry.reference) {
      const match = shipmentIndex.get(entry.reference);
      if (match) {
        return {
          label: `Shipment ${entry.reference}`,
          hint: match.status.replace(/_/g, " "),
          to: `/shipments/${match.id}`,
          icon: Package,
        };
      }
    }
    const route = ENTITY_ROUTES[entry.workspace] ?? ENTITY_ROUTES.Wallet;
    return {
      label: route.label,
      hint: entry.reference ?? `Linked from the ${entry.workspace} workspace`,
      to: route.to,
      icon: ENTITY_ICONS[entry.workspace] ?? Wallet,
    };
  };

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const rows: (string | number)[][] = [
      ["Date", "Description", "Workspace", "Type", "Amount (NGN)", "Balance before", "Balance after", "Reference"],
      ...filtered.map((entry) => [
        new Date(entry.createdAt).toISOString(),
        entry.description,
        entry.workspace,
        TYPE_LABELS[entry.type] ?? entry.type,
        entry.amountNgn,
        entry.balanceAfterNgn - entry.amountNgn,
        entry.balanceAfterNgn,
        entry.reference ?? "",
      ]),
    ];
    downloadCsv(`cloudie-ledger-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`);
  };

  const loading = ledger === undefined;
  const isEmpty = !loading && entries.length === 0;
  const isFilteredEmpty = !loading && entries.length > 0 && filtered.length === 0;
  const atFetchCap = entries.length >= FETCH_LIMIT;
  const activeFilterCount = chips.length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="section-label text-primary">Personal workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Ledger</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-emerald-600 dark:text-emerald-300">
              {formatNgn(rangeTotals.totalIn)} in
            </span>
            <span aria-hidden>·</span>
            <span className="font-medium text-red-600 dark:text-red-400">
              {formatNgn(rangeTotals.totalOut)} out
            </span>
            <span aria-hidden>·</span>
            <span>{rangeLabel}</span>
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 gap-2"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="size-4" /> Export CSV
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
          <TabsTrigger value="debits">Debits</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter bar */}
      <Reveal>
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Workspace multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between gap-2 sm:w-auto">
                  <span className="flex items-center gap-2">
                    <Layers className="size-3.5" />
                    {workspaces.length > 0
                      ? `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
                      : "All workspaces"}
                  </span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <Command>
                  <CommandInput placeholder="Filter workspaces…" />
                  <CommandList>
                    <CommandEmpty>No workspace found.</CommandEmpty>
                    <CommandGroup>
                      {allWorkspaces.map((name) => (
                        <CommandItem key={name} value={name} onSelect={() => toggleWorkspace(name)} className="gap-2">
                          <Checkbox
                            checked={workspaces.includes(name)}
                            className="pointer-events-none size-3.5"
                            aria-hidden
                          />
                          <span className="flex-1 text-sm">{name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {workspaces.length > 0 && (
                  <div className="border-t border-border p-1.5">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => setWorkspaces([])}>
                      Clear workspaces
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Date range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between gap-2 sm:w-auto">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-3.5" />
                    {range?.from ? rangeLabel : "Date range"}
                  </span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <div className="flex flex-col sm:flex-row">
                  <div className="flex flex-row gap-1 border-b border-border p-2 sm:flex-col sm:border-b-0 sm:border-r">
                    {[
                      { label: "Last 7 days", days: 7 },
                      { label: "Last 30 days", days: 30 },
                      { label: "Last 90 days", days: 90 },
                    ].map((preset) => (
                      <Button
                        key={preset.label}
                        variant="ghost"
                        size="sm"
                        className="justify-start whitespace-nowrap text-xs"
                        onClick={() => setRange(presetRange(preset.days))}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start whitespace-nowrap text-xs text-muted-foreground"
                      onClick={() => setRange(undefined)}
                    >
                      All time
                    </Button>
                  </div>
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    defaultMonth={range?.from ?? new Date()}
                    numberOfMonths={1}
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* Amount range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between gap-2 sm:w-auto">
                  <span className="flex items-center gap-2">
                    <Coins className="size-3.5" />
                    {amountLabel}
                  </span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-3">
                <p className="text-xs font-semibold text-foreground">Amount range (₦)</p>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    placeholder="Min"
                    aria-label="Minimum amount"
                    value={amountMin}
                    onChange={(event) => setAmountMin(event.target.value.replace(/[^\d.]/g, ""))}
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    inputMode="numeric"
                    placeholder="Max"
                    aria-label="Maximum amount"
                    value={amountMax}
                    onChange={(event) => setAmountMax(event.target.value.replace(/[^\d.]/g, ""))}
                    className="h-9"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Matched against the absolute value, so debits compare as positive amounts.
                </p>
                {hasAmountFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setAmountMin("");
                      setAmountMax("");
                    }}
                  >
                    Reset amount
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            <div className="flex flex-1 items-center justify-between gap-2 sm:justify-end">
              <span className="text-[11px] text-muted-foreground">
                {loading ? "Counting…" : `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`}
                {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}`}
              </span>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                  Clear all
                </Button>
              )}
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} value={chip.value} onRemove={chip.onRemove} />
              ))}
            </div>
          )}
        </div>
      </Reveal>

      {/* Error banner */}
      {stuck && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>We couldn&apos;t load your ledger. Check your connection and try again.</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {/* States / table */}
      {!stuck && (
        <Card className="overflow-hidden p-0 py-0">
          {loading ? (
            <div role="status" aria-label="Loading ledger entries">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[130px]">Workspace</TableHead>
                      <TableHead className="w-[140px] text-right">Amount</TableHead>
                      <TableHead className="w-[80px] text-right">Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-2/3" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="ml-auto h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="ml-auto size-6 rounded-md" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y divide-border md:hidden">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ) : isEmpty ? (
            <Empty className="border-border py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Wallet />
                </EmptyMedia>
                <EmptyTitle>No ledger entries yet</EmptyTitle>
                <EmptyDescription>Your first charge will appear here.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild variant="outline">
                  <Link to="/buy-points">
                    <Coins className="size-4" /> Add points
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : isFilteredEmpty ? (
            <Empty className="border-border py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Layers />
                </EmptyMedia>
                <EmptyTitle>No entries match these filters</EmptyTitle>
                <EmptyDescription>
                  {tab === "all"
                    ? "Try a wider date range, a different workspace, or a broader amount range."
                    : `You're viewing ${tab} only — clear the filters or switch back to All.`}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {/* The tab can leave this view empty on its own, so the action
                    has to reset the tab as well as the filter chips. */}
                <Button
                  variant="outline"
                  onClick={() => {
                    clearFilters();
                    setTab("all");
                  }}
                >
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[130px]">Workspace</TableHead>
                      <TableHead className="w-[140px] text-right">Amount</TableHead>
                      <TableHead className="w-[80px] text-right">Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((entry) => {
                      const credit = entry.amountNgn >= 0;
                      const entity = entityFor(entry);
                      return (
                        <TableRow
                          key={entry.id}
                          tabIndex={0}
                          onClick={() => setSelected(entry)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              setSelected(entry);
                            }
                          }}
                          className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
                        >
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(new Date(entry.createdAt), "d MMM yyyy")}
                            <span className="mt-0.5 block text-[11px] opacity-80">
                              {formatDate(new Date(entry.createdAt), "HH:mm")}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[360px]">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {entry.description}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="rounded-full border-border px-2 py-0 text-[10px] font-medium text-muted-foreground"
                            >
                              {entry.workspace}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono text-sm font-semibold tabular-nums",
                              amountClasses(credit),
                            )}
                          >
                            {signedAmount(entry.amountNgn)}
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.reference ? (
                              <Button
                                asChild
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-primary"
                              >
                                <Link
                                  to={entity.to}
                                  aria-label={`Open ${entity.label}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <ExternalLink className="size-3.5" />
                                </Link>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-border md:hidden">
                {visibleRows.map((entry) => {
                  const credit = entry.amountNgn >= 0;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(entry)}
                        className="flex w-full items-start gap-3 p-3 text-left transition-colors duration-200 active:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {formatDate(new Date(entry.createdAt), "d MMM yyyy · HH:mm")}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">
                            {entry.description}
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-1.5 rounded-full border-border px-2 py-0 text-[10px] font-medium text-muted-foreground"
                          >
                            {entry.workspace}
                          </Badge>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 pt-3 font-mono text-sm font-semibold tabular-nums",
                            amountClasses(credit),
                          )}
                        >
                          {signedAmount(entry.amountNgn)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Pagination footer */}
              <div className="flex flex-col items-center gap-2 border-t border-border px-3 py-3 sm:flex-row sm:justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Showing {visibleRows.length} of {filtered.length}{" "}
                  {filtered.length === 1 ? "entry" : "entries"}
                  {atFetchCap && " · latest 100 loaded"}
                </p>
                {visible < filtered.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setVisible((current) => current + PAGE_SIZE)}
                  >
                    <ChevronDown className="size-3.5" />
                    Load more
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Entry drawer */}
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <EntryDrawer entry={selected} entity={entityFor(selected)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── Drawer body ───────────────────────────────────────────────── */

function EntryDrawer({
  entry,
  entity,
}: {
  entry: Entry;
  entity: { label: string; hint: string; to: string; icon: React.ComponentType<{ className?: string }> };
}) {
  const credit = entry.amountNgn >= 0;
  const before = entry.balanceAfterNgn - entry.amountNgn;
  const EntityIcon = entity.icon;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8 text-base leading-snug">{entry.description}</SheetTitle>
        <SheetDescription>
          {formatDate(new Date(entry.createdAt), "d MMM yyyy 'at' HH:mm")}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-border bg-surface-2/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-2xl font-bold tabular-nums",
              amountClasses(credit),
            )}
          >
            {signedAmount(entry.amountNgn)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-card/80 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Before</p>
              <p className="mt-0.5 font-mono text-xs font-medium text-foreground">{formatNgn(before)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/80 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">After</p>
              <p className="mt-0.5 font-mono text-xs font-medium text-foreground">
                {formatNgn(entry.balanceAfterNgn)}
              </p>
            </div>
          </div>
        </div>

        <dl className="space-y-3">
          <DetailRow label="Workspace">
            <Badge
              variant="outline"
              className="rounded-full border-border px-2 py-0 text-[10px] font-medium text-muted-foreground"
            >
              {entry.workspace}
            </Badge>
          </DetailRow>
          <DetailRow label="Type">
            <span className="text-xs">{TYPE_LABELS[entry.type] ?? entry.type ?? "Wallet activity"}</span>
          </DetailRow>
          <DetailRow label="Idempotency reference">
            {entry.reference ? (
              <span className="break-all font-mono text-[11px]">{entry.reference}</span>
            ) : (
              <span className="text-[11px] text-muted-foreground">Not recorded for this entry</span>
            )}
          </DetailRow>
          <DetailRow label="Entry ID">
            <span className="break-all font-mono text-[11px] text-muted-foreground">{entry.id}</span>
          </DetailRow>
          <DetailRow label="Timestamp">
            <span className="text-xs">
              {formatDate(new Date(entry.createdAt), "d MMM yyyy, HH:mm:ss")}
            </span>
          </DetailRow>
        </dl>

        <div className="rounded-2xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Linked entity
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <EntityIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{entity.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{entity.hint}</p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1">
              <Link to={entity.to}>
                Open <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
