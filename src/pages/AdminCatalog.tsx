import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageHeader, AdminSkeleton, StatCard, StatusBadge, fmtDate } from "@/components/admin/shared";
import { formatNgn, formatUsd } from "@/lib/pricing";
import { usePublishPendingChanges } from "@/lib/pendingChanges";
import { toast } from "sonner";
import { Download, FileJson, FileSpreadsheet, Layers, Plus, Save, Search, Store, Tags, Undo2, Upload, Wrench } from "lucide-react";

/**
 * Admin catalog: every sellable thing on the platform and what it costs.
 *
 * Three real catalogs live behind the tabs — platform services priced in
 * points (with optional ₦/$ overrides), the document template library priced
 * per template, and vendor marketplace listings. All prices are written
 * through audited admin mutations, never from client-side trust.
 */

type ServiceRow = {
  service: string;
  label: string;
  description: string;
  workspace: string;
  unit: string;
  defaultPoints: number;
  pointsCost: number;
  priceNgn?: number;
  priceUsd?: number;
  isActive: boolean;
  configured: boolean;
  updatedAt: number;
  custom: boolean;
};

type ServiceDraft = {
  label: string;
  description: string;
  pointsCost: string;
  priceNgn: string;
  priceUsd: string;
  isActive: boolean;
};

type TemplateRow = {
  _id: string;
  name: string;
  slug: string;
  documentType: string;
  categoryLabel: string;
  status: string;
  requiredCredits: number;
  currentVersion: number;
  fieldCount: number;
  pageCount: number;
  updatedAt: number;
};

type ProductRow = {
  _id: string;
  name: string;
  category: string;
  pointsPrice: number;
  totalSold: number;
  isApproved: boolean;
  isActive: boolean;
  createdAt: number;
};

function toDraft(row: ServiceRow): ServiceDraft {
  return {
    label: row.label,
    description: row.description,
    pointsCost: String(row.pointsCost),
    priceNgn: row.priceNgn != null ? String(row.priceNgn) : "",
    priceUsd: row.priceUsd != null ? String(row.priceUsd) : "",
    isActive: row.isActive,
  };
}

/** Blank means "derive from the point rate" — never send NaN to the server. */
function priceOrUndefined(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}

export default function AdminCatalog() {
  const catalog = useQuery(api.catalog.getCatalog) as
    | { services: ServiceRow[]; workspaces: { key: string; label: string }[] }
    | undefined;
  const billing = useQuery(api.pricing.getBillingConfig);
  const templates = useQuery(api.docTemplateAdmin.adminListTemplates) as TemplateRow[] | undefined;
  const products = useQuery(api.marketplace.adminListAllProducts, { limit: 200 }) as
    | ProductRow[]
    | undefined;

  const saveBatch = useMutation(api.adminApi.bulkUpsertPricing);
  const createService = useMutation(api.adminApi.upsertPricing);
  const seedDefaults = useMutation(api.adminApi.seedDefaultPricing);
  const setTemplatePrice = useMutation(api.docTemplateAdmin.adminSetTemplatePrice);
  const setProductPrice = useMutation(api.marketplace.adminSetProductPrice);
  const bulkImportProducts = useMutation(api.marketplace.adminBulkImportProducts);
  const adminCreateProduct = useMutation(api.marketplace.adminCreateProduct);
  const bulkImportTemplates = useMutation(api.docTemplateAdmin.adminBulkImportTemplates);

  const ngnPerPoint = billing?.ngnPerPoint ?? 15;
  const usdPerPoint = billing?.usdPerPoint ?? 0.01;

  const services = catalog?.services ?? [];
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    service: "",
    label: "",
    description: "",
    workspace: "services",
    pointsCost: "",
    priceNgn: "",
  });
  const [templateEdits, setTemplateEdits] = useState<Record<string, string>>({});
  const [productEdits, setProductEdits] = useState<Record<string, string>>({});

  // ── Upload / import state ─────────────────────────────────────────────
  const [svcImportOpen, setSvcImportOpen] = useState(false);
  const [svcImportBusy, setSvcImportBusy] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", category: "", pointsPrice: "", description: "", imageUrl: "" });
  const [productImportOpen, setProductImportOpen] = useState(false);
  const [productImportBusy, setProductImportBusy] = useState(false);
  const [templateImportOpen, setTemplateImportOpen] = useState(false);
  const [templateImportBusy, setTemplateImportBusy] = useState(false);
  const [templatePaste, setTemplatePaste] = useState("");

  const dirty = Object.keys(drafts).length;

  // Unpublished = anything edited here but not yet written to the database.
  // Publishes to the sidebar badge; cleared automatically when this page closes.
  const pendingChanges =
    dirty +
    Object.values(templateEdits).filter((v) => v.trim() !== "").length +
    Object.values(productEdits).filter((v) => v.trim() !== "").length;
  usePublishPendingChanges("catalog", pendingChanges);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return services;
    return services.filter(
      (s) =>
        s.label.toLowerCase().includes(needle) ||
        s.service.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle),
    );
  }, [services, query]);

  const grouped = useMemo(() => {
    const order = catalog?.workspaces ?? [];
    const known = new Map(order.map((w, i) => [w.key, i]));
    const buckets = new Map<string, ServiceRow[]>();
    for (const row of filtered) {
      const list = buckets.get(row.workspace) ?? [];
      list.push(row);
      buckets.set(row.workspace, list);
    }
    return [...buckets.entries()]
      .map(([key, rows]) => ({
        key,
        label: order.find((w) => w.key === key)?.label ?? key,
        rows,
      }))
      .sort((a, b) => (known.get(a.key) ?? 99) - (known.get(b.key) ?? 99));
  }, [filtered, catalog]);

  const activeServices = services.filter((s) => s.isActive).length;
  const pricedTemplates = (templates ?? []).filter((t) => t.requiredCredits > 0).length;

  const edit = (row: ServiceRow, patch: Partial<ServiceDraft>) => {
    setDrafts((current) => ({
      ...current,
      [row.service]: { ...(current[row.service] ?? toDraft(row)), ...patch },
    }));
  };

  const discard = () => {
    setDrafts({});
    toast("Unsaved catalog changes discarded");
  };

  const saveAll = async () => {
    const entries = Object.entries(drafts).map(([service, draft]) => {
      const row = services.find((s) => s.service === service);
      return {
        service,
        workspace: row?.workspace ?? "platform",
        label: draft.label,
        description: draft.description,
        pointsCost: Number(draft.pointsCost),
        priceNgn: priceOrUndefined(draft.priceNgn),
        priceUsd: priceOrUndefined(draft.priceUsd),
        isActive: draft.isActive,
      };
    });

    if (entries.length > 100) {
      toast.error("Save in smaller batches — 100 items at a time");
      return;
    }
    const bad = entries.find(
      (e) =>
        !Number.isFinite(e.pointsCost) ||
        e.pointsCost < 0 ||
        (e.priceNgn !== undefined && (!Number.isFinite(e.priceNgn) || e.priceNgn < 0)) ||
        (e.priceUsd !== undefined && (!Number.isFinite(e.priceUsd) || e.priceUsd < 0)),
    );
    if (bad) {
      toast.error(`${bad.service}: points and prices must be numbers (blank price = auto from rate)`);
      return;
    }

    setBusy("__services");
    try {
      const res = await saveBatch({ entries });
      setDrafts({});
      toast.success(`${res.updated} catalog item${res.updated === 1 ? "" : "s"} re-priced`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const syncDefaults = async () => {
    setBusy("__seed");
    try {
      const res = await seedDefaults({});
      toast.success(
        res.created > 0
          ? `Added ${res.created} platform service${res.created === 1 ? "" : "s"} — enable the ones you charge for`
          : "Every platform service is already in the catalog",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sync defaults");
    } finally {
      setBusy(null);
    }
  };

  const addService = async () => {
    const service = newItem.service.trim().toLowerCase().replace(/\s+/g, "_");
    const pointsCost = Number(newItem.pointsCost);
    const priceNgn = priceOrUndefined(newItem.priceNgn);
    if (!service) {
      toast.error("Give the service a key, e.g. sms_send");
      return;
    }
    if (!Number.isFinite(pointsCost) || pointsCost < 0) {
      toast.error("Points cost must be a non-negative number");
      return;
    }
    if (priceNgn !== undefined && (!Number.isFinite(priceNgn) || priceNgn < 0)) {
      toast.error("Naira price must be a non-negative number (or blank for auto)");
      return;
    }
    setBusy("__new");
    try {
      await createService({
        service,
        workspace: newItem.workspace,
        label: newItem.label || undefined,
        description: newItem.description || undefined,
        pointsCost,
        priceNgn,
        isActive: true,
      });
      toast.success(`${newItem.label || service} added to the catalog at ${pointsCost} pts`);
      setNewItem({ service: "", label: "", description: "", workspace: "services", pointsCost: "", priceNgn: "" });
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the item");
    } finally {
      setBusy(null);
    }
  };

  const saveTemplatePrice = async (row: TemplateRow) => {
    const raw = templateEdits[row._id];
    if (raw === undefined || raw === "") return;
    setBusy(row._id);
    try {
      const res = await setTemplatePrice({ templateId: row._id as never, requiredCredits: Number(raw) });
      setTemplateEdits((t) => ({ ...t, [row._id]: "" }));
      toast.success(`${row.name} now costs ${res.requiredCredits} pts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not re-price the template");
    } finally {
      setBusy(null);
    }
  };

  const saveProductPrice = async (row: ProductRow) => {
    const raw = productEdits[row._id];
    if (raw === undefined || raw === "") return;
    setBusy(row._id);
    try {
      const res = await setProductPrice({ productId: row._id as never, pointsPrice: Number(raw) });
      setProductEdits((p) => ({ ...p, [row._id]: "" }));
      toast.success(`${row.name} now lists at ${res.pointsPrice} pts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not re-price the listing");
    } finally {
      setBusy(null);
    }
  };

  // ── CSV helpers (services) — columns: service,label,workspace,pointsCost,priceNgn,isActive ──
  function parseCsv(text: string): string[][] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      // naive CSV split that honours quoted commas
      const cells: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' ) { inQuote = !inQuote; continue; }
        if (c === "," && !inQuote) { cells.push(cur.trim()); cur = ""; continue; }
        cur += c;
      }
      cells.push(cur.trim());
      return cells;
    });
  }

  const onSvcCsvFile = async (file: File | null) => {
    if (!file) return;
    setSvcImportBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
      const hasHeader = header.includes("service") || header.includes("label");
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const entries = dataRows.slice(0, 100).map((r) => {
        const [service, label, workspace, pointsCost, priceNgn, isActive, description] = r;
        return {
          service: (service ?? "").trim(),
          label: (label ?? "").trim() || undefined,
          workspace: (workspace ?? "services").trim() || "services",
          description: (description ?? "").trim() || undefined,
          pointsCost: Number(pointsCost ?? 0),
          priceNgn: priceOrUndefined(priceNgn ?? ""),
          isActive: String(isActive ?? "true").toLowerCase() !== "false" && String(isActive ?? "").toLowerCase() !== "0",
        };
      }).filter((e) => e.service);
      if (entries.length === 0) { toast.error("No valid rows found — include a 'service' column"); return; }
      const res = await saveBatch({ entries });
      toast.success(`${res.updated} service(s) imported`);
      setSvcImportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "CSV import failed");
    } finally {
      setSvcImportBusy(false);
    }
  };

  const onCreateProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.category.trim()) { toast.error("Name and category are required"); return; }
    const price = Number(newProduct.pointsPrice);
    if (!Number.isFinite(price) || price < 0) { toast.error("Points price must be a number"); return; }
    setBusy("__newProduct");
    try {
      await adminCreateProduct({
        name: newProduct.name.trim(),
        description: newProduct.description.trim() || newProduct.name.trim(),
        category: newProduct.category.trim(),
        pointsPrice: price,
        imageUrl: newProduct.imageUrl.trim() || undefined,
      });
      toast.success(`${newProduct.name} added to the marketplace`);
      setNewProduct({ name: "", category: "", pointsPrice: "", description: "", imageUrl: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add product");
    } finally {
      setBusy(null);
    }
  };

  const onProductCsvFile = async (file: File | null) => {
    if (!file) return;
    setProductImportBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
      const hasHeader = header.includes("name") || header.includes("pointsprice");
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const products = dataRows.slice(0, 50).map((r) => {
        const [name, category, pointsPrice, description, imageUrl] = r;
        return {
          name: (name ?? "").trim(),
          category: (category ?? "general").trim() || "general",
          pointsPrice: Number(pointsPrice ?? 0),
          description: (description ?? name ?? "").trim(),
          imageUrl: (imageUrl ?? "").trim() || undefined,
        };
      }).filter((p) => p.name);
      if (products.length === 0) { toast.error("No valid product rows — include name,category,pointsPrice"); return; }
      const res = await bulkImportProducts({ products });
      toast.success(`${res.created} product(s) imported`);
      setProductImportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setProductImportBusy(false);
    }
  };

  const onTemplateJsonImport = async (file: File | null, pasted?: string) => {
    const raw = pasted ?? (file ? await file.text() : "");
    if (!raw.trim()) { toast.error("Paste JSON or choose a file"); return; }
    setTemplateImportBusy(true);
    try {
      const j = JSON.parse(raw);
      const arr = Array.isArray(j) ? j : [j];
      if (arr.length > 20) { toast.error("Up to 20 templates per import"); return; }
      const res = await bulkImportTemplates({ templates: arr as never });
      toast.success(res.created > 0 ? `Imported ${res.created} template(s)${res.skipped ? ` · ${res.skipped} skipped` : ""}` : `No templates imported — ${res.errors.join("; ").slice(0, 160)}`);
      if (res.created > 0) setTemplateImportOpen(false);
      if (res.errors.length) toast.error(res.errors.slice(0, 3).join("; "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "JSON import failed");
    } finally {
      setTemplateImportBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <AdminPageHeader
        title="Catalog & Prices"
        description="Everything customers can buy, in one place: platform services, document templates and marketplace listings — with the price on each."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/pricing">Point rate & packages</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Service catalog" value={services.length} icon={Wrench} color="indigo" hint={`${activeServices} actively charged`} />
        <StatCard title="Document templates" value={templates?.length} icon={Layers} color="blue" hint={`${pricedTemplates} priced above 0`} />
        <StatCard title="Marketplace listings" value={products?.length} icon={Store} color="amber" />
        <StatCard
          title="Point value"
          value={billing ? formatNgn(ngnPerPoint) : undefined}
          icon={Tags}
          color="green"
          hint={billing ? `${formatUsd(usdPerPoint)} per point` : undefined}
        />
      </div>

      <Tabs defaultValue="services" className="gap-4">
        <TabsList className="h-10 w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="services" className="gap-1.5 text-xs sm:text-sm">
            <Wrench className="h-3.5 w-3.5" /> Services
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-xs sm:text-sm">
            <Layers className="h-3.5 w-3.5" /> Document templates
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="gap-1.5 text-xs sm:text-sm">
            <Store className="h-3.5 w-3.5" /> Marketplace
          </TabsTrigger>
        </TabsList>

        {/* ── Services ─────────────────────────────────────────────────────── */}
        <TabsContent value="services" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a service…"
                className="pl-9"
                aria-label="Filter services"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={syncDefaults} disabled={busy === "__seed"}>
                {busy === "__seed" ? "Syncing…" : "Sync platform defaults"}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSvcImportOpen(true)}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Import CSV
              </Button>
              <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add service
              </Button>
            </div>
          </div>

          {catalog === undefined ? (
            <AdminSkeleton rows={6} />
          ) : grouped.length === 0 ? (
            <Card className="rounded-xl border-border">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No service matches “{query}”.
              </CardContent>
            </Card>
          ) : (
            grouped.map((group, gi) => (
              <motion.div
                key={group.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(gi * 0.05, 0.2), duration: 0.25 }}
              >
                <Card className="rounded-xl border-border shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-semibold tracking-wide text-foreground">{group.label}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    {group.rows.map((row) => {
                      const draft = drafts[row.service] ?? toDraft(row);
                      const isDirty = drafts[row.service] !== undefined;
                      const points = Number(draft.pointsCost);
                      const shownNgn =
                        draft.priceNgn.trim() !== ""
                          ? Number(draft.priceNgn)
                          : (Number.isFinite(points) ? points : 0) * ngnPerPoint;
                      const shownUsd =
                        draft.priceUsd.trim() !== ""
                          ? Number(draft.priceUsd)
                          : (Number.isFinite(points) ? points : 0) * usdPerPoint;
                      return (
                        <div
                          key={row.service}
                          className={`border-b border-border p-4 last:border-0 ${isDirty ? "bg-primary/5" : ""}`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  value={draft.label}
                                  onChange={(e) => edit(row, { label: e.target.value })}
                                  className="h-8 max-w-[16rem] text-sm font-medium"
                                  aria-label={`Catalog name for ${row.service}`}
                                />
                                {row.custom && (
                                  <Badge variant="outline" className="text-[10px]">
                                    custom
                                  </Badge>
                                )}
                                {!row.configured && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    default
                                  </Badge>
                                )}
                              </div>
                              <Input
                                value={draft.description}
                                onChange={(e) => edit(row, { description: e.target.value })}
                                className="h-8 text-xs"
                                aria-label={`Description for ${row.service}`}
                              />
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {row.service} · {row.unit} · platform default {row.defaultPoints} pts
                              </p>
                            </div>

                            <div className="flex flex-wrap items-end gap-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={draft.pointsCost}
                                  onChange={(e) => edit(row, { pointsCost: e.target.value })}
                                  className="h-8 w-20"
                                  aria-label={`Points cost for ${row.service}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">₦ price</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  placeholder="auto"
                                  value={draft.priceNgn}
                                  onChange={(e) => edit(row, { priceNgn: e.target.value })}
                                  className="h-8 w-24"
                                  aria-label={`Naira price for ${row.service}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">$ price</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.001"
                                  inputMode="decimal"
                                  placeholder="auto"
                                  value={draft.priceUsd}
                                  onChange={(e) => edit(row, { priceUsd: e.target.value })}
                                  className="h-8 w-20"
                                  aria-label={`Dollar price for ${row.service}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Charge</Label>
                                <div className="flex h-8 items-center">
                                  <Switch
                                    checked={draft.isActive}
                                    onCheckedChange={(checked) => edit(row, { isActive: checked })}
                                    aria-label={`Charge for ${row.service}`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{formatNgn(shownNgn)}</span>
                            <span>{formatUsd(shownUsd)}</span>
                            <span>
                              {draft.priceNgn.trim() === "" ? "auto from point rate" : "custom naira price"} ·{" "}
                              {draft.isActive ? "charged to customers" : "platform default applies"}
                            </span>
                            {isDirty && <span className="text-primary">unsaved</span>}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}

          <Card className="rounded-xl border-dashed border-border">
            <CardContent className="p-4 text-xs text-muted-foreground">
              A service only overrides its platform default while it is <strong>charged</strong>. Leave the ₦/$ boxes
              blank to derive the price from the point rate set on the{" "}
              <Link to="/admin/pricing" className="text-primary underline-offset-2 hover:underline">
                pricing page
              </Link>
              .
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Document templates ──────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4">
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Layers className="h-4 w-4 text-primary" /> Document template library
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    What a customer pays to generate each document. Layout, fields and artwork are edited in the template
                    studio. Bulk-import from JSON to add many templates at once.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setTemplateImportOpen(true)}>
                  <FileJson className="h-3.5 w-3.5" /> Import JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {templates === undefined ? (
                <div className="p-4">
                  <AdminSkeleton rows={5} />
                </div>
              ) : templates.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No templates yet — the starter library installs on first use.
                </p>
              ) : (
                templates.map((row) => {
                  const editValue = templateEdits[row._id];
                  const dirtyRow = editValue !== undefined && editValue !== "";
                  const current = dirtyRow ? Number(editValue) : row.requiredCredits;
                  return (
                    <div
                      key={row._id}
                      className="flex flex-col gap-3 border-b border-border p-4 last:border-0 md:flex-row md:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {row.categoryLabel} · v{row.currentVersion} · {row.fieldCount} field
                          {row.fieldCount === 1 ? "" : "s"} · {row.pageCount} page{row.pageCount === 1 ? "" : "s"} ·{" "}
                          {row.updatedAt ? `updated ${fmtDate(row.updatedAt)}` : "not published"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={row.status} />
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</Label>
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={editValue ?? String(row.requiredCredits)}
                            onChange={(e) => setTemplateEdits((t) => ({ ...t, [row._id]: e.target.value }))}
                            className="h-8 w-20"
                            aria-label={`Points price for ${row.name}`}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          <p className="font-medium text-foreground">{formatNgn((Number.isFinite(current) ? current : 0) * ngnPerPoint)}</p>
                          <p>{formatUsd((Number.isFinite(current) ? current : 0) * usdPerPoint)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={dirtyRow ? "default" : "outline"}
                          disabled={!dirtyRow || busy === row._id}
                          onClick={() => saveTemplatePrice(row)}
                        >
                          {busy === row._id ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1" asChild>
                          <Link to={`/admin/document-templates/${row._id}/edit`}>Open studio</Link>
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Marketplace ─────────────────────────────────────────────────── */}
        <TabsContent value="marketplace" className="space-y-4">
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Store className="h-4 w-4 text-primary" /> Vendor listings
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setProductImportOpen(true)}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Import CSV
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin/marketplace">Approve & enable products</Link>
                </Button>
              </div>
            </CardHeader>
            {/* Inline add-product */}
            <div className="mx-4 mb-3 grid gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Upload a catalog product</Label>
                <Input placeholder="Name — e.g. DHL Express Envelope" value={newProduct.name} onChange={(e) => setNewProduct((n) => ({ ...n, name: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Category — e.g. logistics" value={newProduct.category} onChange={(e) => setNewProduct((n) => ({ ...n, category: e.target.value }))} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Points price</Label>
                <Input type="number" min={0} inputMode="numeric" placeholder="e.g. 120" value={newProduct.pointsPrice} onChange={(e) => setNewProduct((n) => ({ ...n, pointsPrice: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Image URL (optional)" value={newProduct.imageUrl} onChange={(e) => setNewProduct((n) => ({ ...n, imageUrl: e.target.value }))} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Input placeholder="Description (optional — defaults to name)" value={newProduct.description} onChange={(e) => setNewProduct((n) => ({ ...n, description: e.target.value }))} className="h-8 text-xs" />
                <Button size="sm" className="gap-1 w-full" disabled={busy === "__newProduct"} onClick={onCreateProduct}>
                  <Plus className="h-3.5 w-3.5" /> {busy === "__newProduct" ? "Adding…" : "Upload product"}
                </Button>
              </div>
            </div>
            <CardContent className="p-0">
              {products === undefined ? (
                <div className="p-4">
                  <AdminSkeleton rows={5} />
                </div>
              ) : products.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No vendor listings yet — prices appear here once vendors publish products.
                </p>
              ) : (
                products.map((row) => {
                  const editValue = productEdits[row._id];
                  const dirtyRow = editValue !== undefined && editValue !== "";
                  const current = dirtyRow ? Number(editValue) : row.pointsPrice;
                  return (
                    <div
                      key={row._id}
                      className="flex flex-col gap-3 border-b border-border p-4 last:border-0 md:flex-row md:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {row.category} · {row.totalSold} sold · listed {fmtDate(row.createdAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={row.isApproved ? (row.isActive ? "active" : "paused") : "draft"} />
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Points</Label>
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={editValue ?? String(row.pointsPrice)}
                            onChange={(e) => setProductEdits((p) => ({ ...p, [row._id]: e.target.value }))}
                            className="h-8 w-24"
                            aria-label={`Points price for ${row.name}`}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          <p className="font-medium text-foreground">{formatNgn((Number.isFinite(current) ? current : 0) * ngnPerPoint)}</p>
                          <p>{formatUsd((Number.isFinite(current) ? current : 0) * usdPerPoint)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={dirtyRow ? "default" : "outline"}
                          disabled={!dirtyRow || busy === row._id}
                          onClick={() => saveProductPrice(row)}
                        >
                          {busy === row._id ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar for unsaved service pricing */}
      {dirty > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {dirty} unsaved catalog change{dirty === 1 ? "" : "s"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {Object.keys(drafts).slice(0, 4).join(", ")}
              {dirty > 4 ? ` +${dirty - 4} more` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={discard} disabled={busy === "__services"}>
              <Undo2 className="h-3.5 w-3.5" /> Discard
            </Button>
            <Button size="sm" className="gap-1" onClick={saveAll} disabled={busy === "__services"}>
              <Save className="h-3.5 w-3.5" /> {busy === "__services" ? "Saving…" : "Save prices"}
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── Service CSV import ── */}
      <Dialog open={svcImportOpen} onOpenChange={setSvcImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /> Import services from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns <span className="font-mono text-xs">service,label,workspace,pointsCost,priceNgn,isActive,description</span>. First row may be a header. Up to 100 rows per upload — re-run for more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">Example: <span className="font-mono">sms_send,SMS delivery,services,15,225,true,Sends one SMS</span></p>
              <p className="mt-1 text-[11px] text-muted-foreground">Download a template then edit it and re-upload.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  const csv = "service,label,workspace,pointsCost,priceNgn,isActive,description\nsms_send,SMS delivery,services,15,,true,Sends one transactional SMS\nemail_per_recipient,Email delivery,services,10,150,true,Deliver one campaign email\n";
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "cloudie-services-template.csv"; document.body.appendChild(a); a.click(); a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                }}>
                  <Download className="h-3.5 w-3.5" /> Download CSV template
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">CSV file</Label>
              <Input type="file" accept=".csv,text/csv" className="mt-1" onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) void onSvcCsvFile(f);
                e.target.value = "";
              }} disabled={svcImportBusy} />
              {svcImportBusy && <p className="mt-2 text-xs text-muted-foreground">Importing…</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcImportOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Marketplace product CSV import ── */}
      <Dialog open={productImportOpen} onOpenChange={setProductImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> Import marketplace products from CSV</DialogTitle>
            <DialogDescription>
              Columns: <span className="font-mono text-xs">name,category,pointsPrice,description,imageUrl</span>. First row may be a header. Up to 50 products per upload.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">Example: <span className="font-mono text-[11px]">DHL Envelope,logistics,120,Next-day courier envelope,https://…</span></p>
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  const csv = "name,category,pointsPrice,description,imageUrl\nDHL Express Envelope,logistics,120,Next-day courier envelope,\nPriority Parcel,logistics,250,Tracked priority parcel,\n";
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "cloudie-products-template.csv"; document.body.appendChild(a); a.click(); a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                }}>
                  <Download className="h-3.5 w-3.5" /> Download CSV template
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">CSV file</Label>
              <Input type="file" accept=".csv,text/csv" className="mt-1" onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) void onProductCsvFile(f);
                e.target.value = "";
              }} disabled={productImportBusy} />
              {productImportBusy && <p className="mt-2 text-xs text-muted-foreground">Importing…</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductImportOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Template JSON import (catalog) ── */}
      <Dialog open={templateImportOpen} onOpenChange={setTemplateImportOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileJson className="h-4 w-4 text-primary" /> Import document templates (JSON)</DialogTitle>
            <DialogDescription>Paste or upload the same JSON array used on the Templates page. Up to 20 templates per import; validates layout and category server-side.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input type="file" accept="application/json,.json" className="max-w-xs" onChange={async (e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) {
                  const text = await f.text();
                  setTemplatePaste(text);
                }
                e.target.value = "";
              }} />
              <Button variant="outline" size="sm" onClick={() => {
                const sample = JSON.stringify([{
                  name: "Sample Invoice", slug: "sample-invoice", documentType: "corporate",
                  description: "A minimal template.",
                  requiredCredits: 20, supportedFormats: ["png","pdf"],
                  schema: { fields: [{ id: "title", type: "text", label: "Title", default: "Invoice", required: true }] },
                  configuration: { renderScale: 2, pages: [{ width: 794, height: 1123, background: "#ffffff", elements: [] }] }
                }], null, 2);
                const blob = new Blob([sample], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "cloudie-template-sample.json"; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              }}>Download sample</Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">JSON array or single object</Label>
              <Textarea value={templatePaste} onChange={(e) => setTemplatePaste(e.target.value)} placeholder='[{"name":"Invoice","documentType":"corporate","schema":{"fields":[]},"configuration":{"pages":[]}}]' className="min-h-[180px] font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateImportOpen(false)} disabled={templateImportBusy}>Cancel</Button>
            <Button onClick={() => onTemplateJsonImport(null, templatePaste)} disabled={templateImportBusy || !templatePaste.trim()} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> {templateImportBusy ? "Importing…" : "Import JSON"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add a catalog service */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a catalog service</DialogTitle>
            <DialogDescription>
              Register a new billable service key. Its points cost is what customers are charged once it is live.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="catKey">Service key</Label>
                <Input
                  id="catKey"
                  value={newItem.service}
                  onChange={(e) => setNewItem((n) => ({ ...n, service: e.target.value }))}
                  placeholder="sms_send"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catGroup">Catalog group</Label>
                <select
                  id="catGroup"
                  aria-label="Catalog group"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  value={newItem.workspace}
                  onChange={(e) => setNewItem((n) => ({ ...n, workspace: e.target.value }))}
                >
                  {(catalog?.workspaces ?? [{ key: "services", label: "Services" }]).map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catName">Customer-facing name</Label>
              <Input
                id="catName"
                value={newItem.label}
                onChange={(e) => setNewItem((n) => ({ ...n, label: e.target.value }))}
                placeholder="SMS notification"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catDesc">What it covers</Label>
              <Textarea
                id="catDesc"
                rows={3}
                value={newItem.description}
                onChange={(e) => setNewItem((n) => ({ ...n, description: e.target.value }))}
                placeholder="One transactional SMS sent to a customer."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="catPoints">Points cost</Label>
                <Input
                  id="catPoints"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={newItem.pointsCost}
                  onChange={(e) => setNewItem((n) => ({ ...n, pointsCost: e.target.value }))}
                  placeholder="15"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catNgn">₦ price (blank = auto)</Label>
                <Input
                  id="catNgn"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={newItem.priceNgn}
                  onChange={(e) => setNewItem((n) => ({ ...n, priceNgn: e.target.value }))}
                  placeholder="auto"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addService} disabled={busy === "__new"} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> {busy === "__new" ? "Adding…" : "Add to catalog"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
