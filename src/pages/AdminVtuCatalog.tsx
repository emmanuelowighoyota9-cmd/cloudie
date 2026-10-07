import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminPageHeader, AdminSkeleton } from "@/components/admin/shared";
import { Reveal } from "@/components/motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Trash2,
  Tv,
  Waypoints,
  Wifi,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Admin management for the VTU catalog and its routing table.
 *
 * Two ideas hold this screen together:
 *
 *   1. Routing is a DECISION, not a constant. What an operator edits here is
 *      read at purchase time by `routeProduct` in `vtuServiceRouting.ts`, and
 *      that decision is snapshotted onto the transaction so changing this page
 *      never moves a purchase that is already in flight.
 *
 *   2. The preview runs the REAL algorithm. It calls the same `routeProduct`
 *      the purchase mutation calls, so what an operator verifies here is what
 *      will actually happen. A reimplemented "simulation" would drift from the
 *      rule the first time the rule changed, and would be worse than no
 *      preview at all.
 *
 * The two warnings below are the ones that cost a customer money if ignored:
 * a product with no active route, and a route pointing at a provider that can
 * never be chosen.
 */

/** Sync failure codes, in the operator's language rather than the transport's.
 *  Each is a different problem with a different fix, so they are never
 *  collapsed into one generic message. */
const SYNC_ERROR_HINT: Record<string, string> = {
  ADMIN_REQUIRED: "Only an administrator can sync the catalog.",
  PROVIDER_NOT_CONFIGURED: "AidaPay is not set up yet. Connect it on the VTU Providers page first.",
  CREDENTIAL_MISSING: "AidaPay has no API key saved. Reconnect it on the VTU Providers page.",
  CREDENTIAL_CORRUPT: "The saved AidaPay API key could not be read. Re-enter it on the VTU Providers page.",
  CREDENTIALS_REJECTED: "AidaPay rejected the API key. Check it on the VTU Providers page.",
  NETWORK_ERROR: "Could not reach AidaPay. Check the connection and try again.",
};

/**
 * Plain English for the per-service failure codes, appended to the code rather
 * than replacing it: the code is what gets quoted back, and the phrase is what
 * makes it actionable without a lookup.
 */
const SYNC_SERVICE_HINT: Record<string, string> = {
  HTTP_404: "AidaPay does not serve that endpoint — check the provider's base URL",
  HTTP_429: "AidaPay rate-limited the look-up — wait a moment and try again",
  HTTP_500: "AidaPay had a server error on that service",
  HTTP_502: "AidaPay was unreachable behind its gateway",
  HTTP_503: "AidaPay was temporarily unavailable",
  AUTH_REDIRECT: "AidaPay sent the look-up to its sign-in page instead of answering — the saved API key was not accepted",
  UNREADABLE_RESPONSE: "AidaPay answered with something that is not JSON",
  NETWORK_ERROR: "the request timed out or did not connect",
};

const SERVICE_TYPES = [
  "airtime",
  "data",
  "cable",
  "electricity",
  "exam",
  "betting",
] as const;

type ProductRow = {
  _id: string;
  serviceType: string;
  productCode: string;
  displayName: string;
  customerIdentifierLabel: string;
  requiresAmount: boolean;
  requiresPackageCode: boolean;
  minAmount: number | null;
  maxAmount: number | null;
  /** The provider's fixed naira price, for products the customer does not
   *  price (a data plan, a cable bouquet). Null for amount-priced ones. */
  priceNgn: number | null;
  active: boolean;
  activeRouteCount: number;
};

type RouteRow = {
  _id: string;
  productCode: string;
  provider: string;
  providerDisplayName: string;
  providerStatus: "active" | "sandbox" | "disabled" | "missing";
  providerProductCode: string;
  providerPackageCode: string | null;
  pointsCostOverride: number | null;
  priority: number;
  active: boolean;
};

type PreviewCandidate = {
  provider: string;
  providerProductCode: string;
  providerPackageCode: string | null;
  pointsCostOverride: number | null;
  routePriority: number;
  providerPriority: number;
  providerStatus: string;
  eligible: boolean;
  skippedBecause?: string;
};

function providerStatusBadge(status: RouteRow["providerStatus"]) {
  if (status === "active")
    return <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">active</Badge>;
  if (status === "sandbox")
    return (
      <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
        sandbox
      </Badge>
    );
  if (status === "disabled")
    return (
      <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        disabled
      </Badge>
    );
  return (
    <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      no provider row
    </Badge>
  );
}

const SKIP_REASON: Record<string, string> = {
  provider_missing: "there is no provider row with this name",
  provider_sandbox: "it is a sandbox provider, which never takes live money",
  provider_disabled: "it is disabled",
  route_inactive: "the route is switched off",
};

export default function AdminVtuCatalog() {
  const products = useQuery(api.vtuServiceAdmin.listProducts, {});
  const routes = useQuery(api.vtuServiceAdmin.listRoutes, {});
  const providers = useQuery(api.vtuProviderAdmin.listProviders, {});
  const seedAirtime = useMutation(api.vtuServiceAdmin.seedAirtimeCatalog);
  const [seeding, setSeeding] = useState(false);
  const syncCatalog = useAction(api.vtuCatalogSync.syncAidaPayCatalog);
  const [syncing, setSyncing] = useState(false);
  const autoSyncVersion = useRef<string | null>(null);

  // Once AidaPay has a saved credential, keep the catalog page self-managing:
  // the first load after provider configuration performs the same read-only
  // sync as the button. `updatedAt` is the provider configuration version, so
  // replacing the key/base URL causes exactly one fresh sync on the next load.
  // This never invents products or runs for an unconfigured provider.
  useEffect(() => {
    const aidapay = (providers ?? []).find((p) => p.name === "aidapay");
    if (!aidapay?.hasApiKey) return;
    const version = `${aidapay.updatedAt}:${aidapay.status}:${aidapay.baseUrl}`;
    if (autoSyncVersion.current === version) return;
    autoSyncVersion.current = version;

    let cancelled = false;
    setSyncing(true);
    syncCatalog({ dryRun: false })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          toast.warning(SYNC_ERROR_HINT[res.error ?? ""] ?? "AidaPay catalog sync could not complete.");
          return;
        }
        const billTypes = new Set<string>();
        for (const key of Object.keys(res.serviceErrors)) billTypes.add(key.split(":")[0]);
        const changed = res.productsCreated + res.productsUpdated + res.routesCreated + res.routesUpdated;
        if (changed > 0) {
          toast.success(`Catalog refreshed automatically — ${changed} catalog update${changed === 1 ? "" : "s"}.`);
        } else if (billTypes.size > 0) {
          toast.warning(`Catalog refresh completed with service issues: ${[...billTypes].join(", ")}.`);
        }
      })
      .catch((error) => {
        if (!cancelled) toast.warning(error instanceof Error ? error.message : "Automatic catalog sync failed.");
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [providers, syncCatalog]);

  const [tab, setTab] = useState("products");
  const [productDialog, setProductDialog] = useState<ProductRow | "new" | null>(null);
  const [routeDialog, setRouteDialog] = useState<RouteRow | "new" | null>(null);
  const [routeFilter, setRouteFilter] = useState("all");
  const [previewCode, setPreviewCode] = useState("");

  const providerNames = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of routes ?? []) {
      if (!set.has(r.provider)) set.set(r.provider, r.providerDisplayName);
    }
    return [...set.entries()];
  }, [routes]);

  const visibleRoutes = useMemo(
    () => (routes ?? []).filter((r) => routeFilter === "all" || r.productCode === routeFilter),
    [routes, routeFilter],
  );

  /** A product that cannot be routed is a product a customer can be refused. */
  const unroutable = (products ?? []).filter((p) => p.active && p.activeRouteCount === 0);
  /** A route to a provider that can never be chosen is a silent no-op. */
  const deadRoutes = visibleRoutes.filter(
    (r) => r.active && r.providerStatus !== "active",
  );

  const aidapay = useMemo(
    () => (providers ?? []).find((p) => p.name === "aidapay") ?? null,
    [providers],
  );

  const catalogCards = useMemo(
    () => [
      { key: "data", label: "Data", icon: Wifi, tone: "text-cyan-400", count: (products ?? []).filter((p) => p.serviceType === "data").length },
      { key: "electricity", label: "Electricity", icon: Lightbulb, tone: "text-amber-400", count: (products ?? []).filter((p) => p.serviceType === "electricity").length },
      { key: "cable", label: "Cable TV", icon: Tv, tone: "text-violet-400", count: (products ?? []).filter((p) => p.serviceType === "cable").length },
      { key: "exam", label: "Exam Pins", icon: GraduationCap, tone: "text-emerald-400", count: (products ?? []).filter((p) => p.serviceType === "exam").length },
    ],
    [products],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="VTU Catalog & Routing"
        description="Which products can be bought, and which provider serves each one. After AidaPay is configured, this page automatically refreshes Data, Electricity, Cable and Exam Pins from the provider catalog."
        actions={
          <>
            <Button
              variant="outline"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  const res = await seedAirtime({});
                  if (res.action === "noop") {
                    toast.success("Airtime is already in the catalog. Nothing changed.");
                  } else {
                    toast.success(
                      `Added ${res.productsInserted} product${res.productsInserted === 1 ? "" : "s"} and ${res.routesInserted} route${res.routesInserted === 1 ? "" : "s"}.`,
                    );
                  }
                  // A provider with a row but no known code convention cannot be
                  // routed automatically, and the operator has to add those by
                  // hand — so say so here rather than leaving a product that
                  // fails closed with no visible reason.
                  if (res.unroutableProviders.length > 0) {
                    toast.warning(
                      `No route was created for ${res.unroutableProviders.join(", ")} — add its provider code by hand.`,
                    );
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Seeding failed");
                } finally {
                  setSeeding(false);
                }
              }}
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap />}
              Seed airtime
            </Button>
            <Button
              variant="outline"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const res = await syncCatalog({ dryRun: false });
                  if (!res.ok) {
                    toast.error(SYNC_ERROR_HINT[res.error ?? ""] ?? "The sync did not complete.");
                    return;
                  }
                  const parts: string[] = [];
                  if (res.productsCreated > 0) parts.push(`${res.productsCreated} new products`);
                  if (res.productsUpdated > 0) parts.push(`${res.productsUpdated} prices refreshed`);
                  if (res.routesCreated > 0) parts.push(`${res.routesCreated} new routes`);
                  toast.success(
                    parts.length > 0
                      ? `AidaPay catalog synced — ${parts.join(", ")}.`
                      : "AidaPay catalog is already up to date.",
                  );
                  // A service type that could not be read is a SILENT hole in
                  // the shop: those bill types simply will not appear for
                  // customers, so it is named rather than swallowed.
                  const failed = Object.entries(res.serviceErrors);
                  if (failed.length > 0) {
                    toast.warning(
                      `Could not read ${failed
                        .map(([k, v]) =>
                          SYNC_SERVICE_HINT[v] ? `${k} (${v} — ${SYNC_SERVICE_HINT[v]})` : `${k} (${v})`,
                        )
                        .join(", ")}. Those services were left unchanged.`,
                    );
                  }
                  if (res.skipped.length > 0) {
                    toast.warning(
                      `${res.skipped.length} plan(s) were skipped because they could not be made purchasable.`,
                    );
                  }
                  if (res.truncated > 0) {
                    toast.warning(
                      `${res.truncated} plan(s) exceeded the write limit and were not saved.`,
                    );
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "The sync failed");
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw />}
              Sync from AidaPay
            </Button>
            <Button onClick={() => setProductDialog("new")}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          </>
        }
      />

      <Reveal>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr]">
          <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-[#0b100e] to-[#07100d] shadow-lg">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                      <Zap className="h-4 w-4" />
                    </span>
                    <Badge className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                      {aidapay?.hasApiKey ? "AidaPay connected" : "Provider not connected"}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight text-white">
                    VTU catalog control center
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-slate-400">
                    Provider-owned Data, Electricity, Cable TV and Exam Pins are surfaced here
                    without inventing product codes or prices.
                  </p>
                </div>
                <Activity className={`mt-1 h-5 w-5 ${syncing ? "animate-pulse text-emerald-400" : "text-slate-500"}`} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Automatic catalog sync enabled
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-slate-400">
                  {syncing ? "Refreshing provider catalog…" : "Catalog ready"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0b100e]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Provider status</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {aidapay?.hasApiKey ? (aidapay.status === "active" ? "Live" : "Configured") : "Not configured"}
                  </p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${aidapay?.hasApiKey ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" : "bg-slate-600"}`} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-slate-500">Products</p>
                  <p className="mt-1 text-xl font-semibold text-white">{products?.length ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-slate-500">Routes</p>
                  <p className="mt-1 text-xl font-semibold text-white">{routes?.length ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {catalogCards.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.key} className="border-white/10 bg-[#0b100e] transition-transform duration-200 hover:-translate-y-0.5">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ${item.tone}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-2xl font-bold text-white">{products === undefined ? "—" : item.count}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-300">{item.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">provider catalog products</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Reveal>

      {/* The two warnings that matter. Both are cheap to fix and expensive to
          discover from a support ticket. */}
      {(unroutable.length > 0 || deadRoutes.length > 0) && (
        <Reveal>
          <div className="space-y-2">
            {unroutable.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <p className="text-sm text-rose-900 dark:text-rose-200">
                  <span className="font-semibold">
                    {unroutable.length} product{unroutable.length > 1 ? "s have" : " has"} no
                    active route
                  </span>{" "}
                  — {unroutable.map((p) => p.productCode).join(", ")}. Buyers will be refused with
                  NO_ROUTE_AVAILABLE.
                </p>
              </div>
            )}
            {deadRoutes.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  <span className="font-semibold">
                    {deadRoutes.length} active route{deadRoutes.length > 1 ? "s point" : " points"} at
                    a provider that can never be chosen
                  </span>{" "}
                  — {deadRoutes.map((r) => `${r.productCode} → ${r.provider} (${r.providerStatus})`).join(", ")}.
                </p>
              </div>
            )}
          </div>
        </Reveal>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="routing">Routing</TabsTrigger>
        </TabsList>

        {/* ─── Products ─────────────────────────────────────────────── */}
        <TabsContent value="products" className="mt-4 space-y-4">
          {products === undefined ? (
            <AdminSkeleton rows={4} />
          ) : products.length === 0 ? (
            <Card>
              <CardContent className="space-y-4 p-8 text-center">
                <p className="text-sm text-slate-500">
                  No products yet, so the customer shop is empty. Seed the four airtime networks
                  below — they are routed to whichever providers you have already configured — or
                  create a product by hand.
                </p>
                <Button disabled={seeding} onClick={async () => {
                  setSeeding(true);
                  try {
                    const res = await seedAirtime({});
                    toast.success(
                      res.action === "noop"
                        ? "Airtime is already in the catalog. Nothing changed."
                        : `Added ${res.productsInserted} products and ${res.routesInserted} routes.`,
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Seeding failed");
                  } finally {
                    setSeeding(false);
                  }
                }}>
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap />}
                  Seed airtime
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {products.map((p) => (
                <Card key={p._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                  <CardContent className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                          {p.productCode}
                        </p>
                        <Badge variant="secondary">{p.serviceType}</Badge>
                        {p.active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            active
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            switched off
                          </Badge>
                        )}
                        {p.active && p.activeRouteCount === 0 && (
                          <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                            no route
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {p.displayName} · {p.customerIdentifierLabel}
                        {p.requiresAmount &&
                          ` · ₦${p.minAmount ?? 0}–₦${p.maxAmount ?? "∞"}`}
                        {!p.requiresAmount &&
                          (p.priceNgn === null
                            ? " · no fixed price set"
                            : ` · ₦${p.priceNgn.toLocaleString()} fixed`)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Waypoints className="h-4 w-4" />
                      {p.activeRouteCount} active route{p.activeRouteCount === 1 ? "" : "s"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setProductDialog(p)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRouteDialog("new")}
                        title="Add a provider route for this product"
                      >
                        <RouteIcon className="h-3.5 w-3.5" /> Route
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Routing ──────────────────────────────────────────────── */}
        <TabsContent value="routing" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 space-y-1.5">
              <Label>Filter by product</Label>
              <Select value={routeFilter} onValueChange={setRouteFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  {(products ?? []).map((p) => (
                    <SelectItem key={p.productCode} value={p.productCode}>
                      {p.productCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setRouteDialog("new")}>
              <Plus className="h-4 w-4" /> New route
            </Button>
          </div>

          {routes === undefined ? (
            <AdminSkeleton rows={4} />
          ) : visibleRoutes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">
                No routes yet. A product with no route refuses every purchase.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {visibleRoutes.map((r) => (
                <Card
                  key={r._id}
                  className={`rounded-xl border-slate-200 shadow-sm dark:border-slate-700 ${
                    r.active && r.providerStatus !== "active" ? "border-amber-300 dark:border-amber-800" : ""
                  }`}
                >
                  <CardContent className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                          {r.productCode}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          {r.providerDisplayName}
                        </span>
                        {providerStatusBadge(r.providerStatus)}
                        {r.active ? null : (
                          <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            route off
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {r.providerProductCode}
                        {r.providerPackageCode ? ` · package ${r.providerPackageCode}` : ""}
                        {" · priority "}
                        {r.priority}
                        {r.pointsCostOverride != null
                          ? ` · ${r.pointsCostOverride} pts`
                          : " · default price"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRouteDialog(r)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <DeleteRouteButton route={r} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <RoutePreview
            products={(products ?? []).map((p) => p.productCode)}
            previewCode={previewCode}
            setPreviewCode={setPreviewCode}
          />
        </TabsContent>
      </Tabs>

      {productDialog !== null && (
        <ProductDialog
          product={productDialog === "new" ? null : productDialog}
          onClose={() => setProductDialog(null)}
        />
      )}
      {routeDialog !== null && (
        <RouteDialog
          route={routeDialog === "new" ? null : routeDialog}
          productCodes={(products ?? []).map((p) => p.productCode)}
          defaultProductCode={routeFilter === "all" ? undefined : routeFilter}
          providers={providerNames}
          onClose={() => setRouteDialog(null)}
        />
      )}
    </div>
  );
}

function DeleteRouteButton({ route }: { route: RouteRow }) {
  const del = useMutation(api.vtuServiceAdmin.deleteRoute);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Delete the route ${route.productCode} → ${route.provider}?`)) return;
        setBusy(true);
        try {
          await del({ productCode: route.productCode, provider: route.provider });
          toast.success("Route deleted.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Delete failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      <span className="sr-only">Delete route</span>
    </Button>
  );
}

/**
 * The dry-run. READ-ONLY by construction: it renders a query result and
 * offers no mutation anywhere in its subtree. Its job is to let an operator
 * see the full ordered candidate list — including the routes that are being
 * SKIPPED and why — before saving a change, rather than after a customer has
 * been refused.
 */
function RoutePreview({
  products,
  previewCode,
  setPreviewCode,
}: {
  products: string[];
  previewCode: string;
  setPreviewCode: (v: string) => void;
}) {
  const trimmed = previewCode.trim();
  const preview = useQuery(
    api.vtuServiceAdmin.previewRoute,
    trimmed ? { productCode: trimmed } : "skip",
  );

  const candidates: PreviewCandidate[] =
    preview && "candidates" in preview ? preview.candidates : [];

  return (
    <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Preview route</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Runs the real routing algorithm and changes nothing.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 space-y-1.5">
            <Label htmlFor="preview-code">Product code</Label>
            <Input
              id="preview-code"
              value={previewCode}
              onChange={(e) => setPreviewCode(e.target.value)}
              placeholder="airtime-mtn"
            />
          </div>
          {products.length > 0 && (
            <Select value={previewCode} onValueChange={setPreviewCode}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Pick a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!trimmed ? null : preview === undefined ? (
          <p className="text-sm text-slate-500">Checking…</p>
        ) : preview.ok === false ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            <Ban className="h-4 w-4" />
            <span className="font-mono font-semibold">{preview.code}</span>
            <span>
              {preview.code === "NO_ROUTE_AVAILABLE"
                ? "The product exists but no live provider serves it."
                : preview.code === "PRODUCT_INACTIVE"
                  ? "The product is switched off."
                  : "There is no such product in the catalog."}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Purchases go to <span className="font-semibold">{preview.winner.provider}</span>
                {preview.winner.pointsCostOverride != null
                  ? ` at ${preview.winner.pointsCostOverride} points (route override)`
                  : " at the default conversion price"}
                .
              </span>
            </div>
            <ol className="space-y-1.5">
              {candidates.map((c, i) => (
                <li
                  key={`${c.provider}-${i}`}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    c.eligible
                      ? "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      : "border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                  }`}
                >
                  <span className="w-5 font-mono text-xs text-slate-400">#{i + 1}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {c.provider}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {c.providerProductCode}
                  </span>
                  <span className="text-xs text-slate-400">
                    route {c.routePriority} · provider {c.providerPriority}
                  </span>
                  {c.eligible ? (
                    i === 0 ? (
                      <Badge className="ml-auto bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        chosen
                      </Badge>
                    ) : (
                      <Badge className="ml-auto" variant="secondary">
                        standby
                      </Badge>
                    )
                  ) : (
                    <span className="ml-auto text-xs text-amber-700 dark:text-amber-400">
                      skipped — {SKIP_REASON[c.skippedBecause ?? ""] ?? "not eligible"}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductDialog({
  product,
  onClose,
}: {
  product: ProductRow | null;
  onClose: () => void;
}) {
  const create = useMutation(api.vtuServiceAdmin.createProduct);
  const update = useMutation(api.vtuServiceAdmin.updateProduct);
  const del = useMutation(api.vtuServiceAdmin.deleteProduct);
  const [busy, setBusy] = useState(false);

  const [serviceType, setServiceType] = useState<string>(product?.serviceType ?? "airtime");
  const [productCode, setProductCode] = useState(product?.productCode ?? "");
  const [displayName, setDisplayName] = useState(product?.displayName ?? "");
  const [identifierLabel, setIdentifierLabel] = useState(
    product?.customerIdentifierLabel ?? "Phone number",
  );
  const [requiresAmount, setRequiresAmount] = useState(product?.requiresAmount ?? true);
  const [requiresPackageCode, setRequiresPackageCode] = useState(
    product?.requiresPackageCode ?? false,
  );
  const [minAmount, setMinAmount] = useState(String(product?.minAmount ?? 100));
  const [maxAmount, setMaxAmount] = useState(String(product?.maxAmount ?? 100000));
  const [priceNgn, setPriceNgn] = useState(
    product?.priceNgn === null || product?.priceNgn === undefined
      ? ""
      : String(product.priceNgn),
  );
  const [active, setActive] = useState(product?.active ?? true);

  const save = async () => {
    setBusy(true);
    // Empty means "no fixed price", NOT zero: a zero would price the product
    // at nothing and the purchase path refuses to charge for it anyway.
    const trimmedPrice = priceNgn.trim();
    const priceNgnValue =
      trimmedPrice === "" ? undefined : Number(trimmedPrice);
    if (priceNgnValue !== undefined && !(priceNgnValue > 0)) {
      toast.error("A fixed price must be greater than zero, or left empty.");
      setBusy(false);
      return;
    }
    try {
      if (product) {
        await update({
          productCode: product.productCode,
          displayName,
          customerIdentifierLabel: identifierLabel,
          requiresAmount,
          requiresPackageCode,
          minAmount: Number(minAmount),
          maxAmount: Number(maxAmount),
          priceNgn: priceNgnValue,
          active,
        });
        toast.success("Product updated.");
      } else {
        await create({
          serviceType: serviceType as (typeof SERVICE_TYPES)[number],
          productCode,
          displayName,
          customerIdentifierLabel: identifierLabel,
          requiresAmount,
          requiresPackageCode,
          minAmount: Number(minAmount),
          maxAmount: Number(maxAmount),
          priceNgn: priceNgnValue,
        });
        toast.success("Product created.");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            The product code is permanent — routing rows and price overrides reference it. Retire
            a product by switching it off instead of deleting it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!product && (
            <div className="space-y-1.5">
              <Label>Service type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pc">Product code</Label>
            <Input
              id="pc"
              value={productCode}
              disabled={!!product}
              onChange={(e) => setProductCode(e.target.value)}
              placeholder="data-mtn-1gb-30d"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dn">Display name</Label>
            <Input
              id="dn"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="MTN 1GB · 30 days"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ci">What the customer is asked for</Label>
            <Select value={identifierLabel} onValueChange={setIdentifierLabel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Phone number", "Smartcard number", "Meter number", "Customer ID"].map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Label htmlFor="ra">Customer picks an amount</Label>
              <Switch id="ra" checked={requiresAmount} onCheckedChange={setRequiresAmount} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Label htmlFor="rp">Customer picks a package</Label>
              <Switch
                id="rp"
                checked={requiresPackageCode}
                onCheckedChange={setRequiresPackageCode}
              />
            </div>
          </div>

          {requiresAmount && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mn">Min ₦</Label>
                <Input id="mn" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mx">Max ₦</Label>
                <Input id="mx" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
              </div>
            </div>
          )}

          {!requiresAmount && (
            // The customer has no amount to give, so the NAIRA price has to
            // live here: it is what the ledger's rate snapshot is built from,
            // and without it the purchase refuses rather than guessing.
            <div className="space-y-1.5">
              <Label htmlFor="pn">Fixed price ₦</Label>
              <Input
                id="pn"
                value={priceNgn}
                onChange={(e) => setPriceNgn(e.target.value)}
                inputMode="numeric"
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground">
                The provider's price for one of these — set it to the figure on
                the provider's own package list.
              </p>
            </div>
          )}

          {product && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Label htmlFor="ac">Active</Label>
              <Switch id="ac" checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          {product && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Delete ${product.productCode} and its routes?`)) return;
                setBusy(true);
                try {
                  const res = await del({ productCode: product.productCode });
                  toast.success(`Deleted, along with ${res.routesDeleted} route(s).`);
                  onClose();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {product ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RouteDialog({
  route,
  productCodes,
  defaultProductCode,
  providers,
  onClose,
}: {
  route: RouteRow | null;
  productCodes: string[];
  defaultProductCode?: string;
  providers: [string, string][];
  onClose: () => void;
}) {
  const create = useMutation(api.vtuServiceAdmin.createRoute);
  const update = useMutation(api.vtuServiceAdmin.updateRoute);
  const [busy, setBusy] = useState(false);

  const [productCode, setProductCode] = useState(
    route?.productCode ?? defaultProductCode ?? productCodes[0] ?? "",
  );
  const [provider, setProvider] = useState(route?.provider ?? providers[0]?.[0] ?? "");
  const [providerProductCode, setProviderProductCode] = useState(
    route?.providerProductCode ?? "",
  );
  const [providerPackageCode, setProviderPackageCode] = useState(
    route?.providerPackageCode ?? "",
  );
  const [override, setOverride] = useState(
    route?.pointsCostOverride != null ? String(route.pointsCostOverride) : "",
  );
  const [priority, setPriority] = useState(String(route?.priority ?? 1));
  const [active, setActive] = useState(route?.active ?? true);

  const save = async () => {
    setBusy(true);
    const overrideNumber = override.trim() === "" ? undefined : Number(override);
    try {
      if (route) {
        await update({
          productCode: route.productCode,
          provider: route.provider,
          providerProductCode,
          providerPackageCode: providerPackageCode || undefined,
          pointsCostOverride: overrideNumber,
          priority: Number(priority),
          active,
        });
        toast.success("Route updated.");
      } else {
        await create({
          productCode,
          provider,
          providerProductCode,
          providerPackageCode: providerPackageCode || undefined,
          pointsCostOverride: overrideNumber,
          priority: Number(priority),
        });
        toast.success("Route created.");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{route ? "Edit route" : "New route"}</DialogTitle>
          <DialogDescription>
            The provider product code is what this aggregator expects. Use{" "}
            <span className="font-mono">{"{amount}"}</span> where the purchase amount belongs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={productCode} onValueChange={setProductCode} disabled={!!route}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a product" />
              </SelectTrigger>
              <SelectContent>
                {productCodes.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider} disabled={!!route}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label} ({value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ppc">Provider product code</Label>
            <Input
              id="ppc"
              value={providerProductCode}
              onChange={(e) => setProviderProductCode(e.target.value)}
              placeholder="airtime.mtn.{amount}"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkc">Provider package code (optional)</Label>
            <Input
              id="pkc"
              value={providerPackageCode}
              onChange={(e) => setProviderPackageCode(e.target.value)}
              placeholder="1GB_30D"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ovr">Point price override</Label>
              <Input
                id="ovr"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="default conversion"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pri">Priority</Label>
              <Input id="pri" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Lower priority wins. A tie falls back to the provider's own priority, then its name.
            Leave the price override blank to use the standard conversion.
          </p>

          {route && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <Label htmlFor="rac">Active</Label>
              <Switch id="rac" checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {route ? "Save changes" : "Create route"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
