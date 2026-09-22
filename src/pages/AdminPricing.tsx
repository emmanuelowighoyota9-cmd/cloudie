import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BadgeDollarSign, Plus, Trash2, Calculator, Package as PackageIcon } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { formatNgn, formatUsd, type PointPackage } from "@/lib/pricing";

type PricingRow = {
  _id: string;
  service: string;
  workspace: string;
  pointsCost: number;
  /** Optional per-service price overrides — blank means "derive from rate". */
  priceNgn?: number;
  priceUsd?: number;
  isActive: boolean;
  effectiveFrom: number;
  updatedAt: number;
};

type PackageDraft = {
  id: string;
  name: string;
  points: string;
  priceNgn: string;
  priceUsd: string;
  popular: boolean;
};

const WORKSPACES = ["shipments", "ticketing", "business", "services", "platform"] as const;

const SEED_SERVICES: { service: string; workspace: string }[] = [
  { service: "shipment_create", workspace: "shipments" },
  { service: "shipment_tracking_update", workspace: "shipments" },
  { service: "shipment_event_add", workspace: "shipments" },
  { service: "flight_pdf", workspace: "ticketing" },
  { service: "hotel_pdf", workspace: "ticketing" },
  { service: "commercial_invoice", workspace: "ticketing" },
  { service: "customs_document", workspace: "ticketing" },
  { service: "email_per_recipient", workspace: "services" },
  { service: "image_render", workspace: "services" },
];

function toDrafts(packages: PointPackage[]): PackageDraft[] {
  return packages.map((p) => ({
    id: p.id,
    name: p.name,
    points: String(p.points),
    priceNgn: String(p.priceNgn),
    priceUsd: String(p.priceUsd),
    popular: p.popular,
  }));
}

export default function AdminPricing() {
  const pricing = useQuery(api.adminApi.getPricing) as PricingRow[] | undefined;
  const billing = useQuery(api.pricing.getBillingConfig);
  const upsert = useMutation(api.adminApi.upsertPricing);
  const updateRate = useMutation(api.pricing.updatePointRate);
  const savePackages = useMutation(api.pricing.savePointPackages);
  const seedDefaults = useMutation(api.adminApi.seedDefaultPricing);

  const [draft, setDraft] = useState({ service: "", workspace: "platform", cost: "" });
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Per-service price overrides keyed `${service}|ngn` / `${service}|usd`. */
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Point conversion rate (₦ per point / $ per point)
  const [rateDraft, setRateDraft] = useState<{ ngn: string; usd: string } | null>(null);
  const ngnRate = Number(rateDraft?.ngn ?? billing?.ngnPerPoint ?? 0);
  const usdRate = Number(rateDraft?.usd ?? billing?.usdPerPoint ?? 0);
  const ngnInput = rateDraft?.ngn ?? (billing ? String(billing.ngnPerPoint) : "");
  const usdInput = rateDraft?.usd ?? (billing ? String(billing.usdPerPoint) : "");
  const usdNgnRate = usdRate > 0 ? ngnRate / usdRate : 0;

  // Point packages sold to customers
  const [pkgDraft, setPkgDraft] = useState<PackageDraft[] | null>(null);
  const packages = pkgDraft ?? toDrafts((billing?.packages ?? []) as PointPackage[]);
  const patchPkg = (index: number, patch: Partial<PackageDraft>) => {
    setPkgDraft(packages.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const saveRate = async () => {
    const ngn = Number(ngnInput);
    const usd = Number(usdInput);
    if (!Number.isFinite(ngn) || ngn <= 0 || !Number.isFinite(usd) || usd <= 0) {
      toast.error("Both rates must be positive numbers");
      return;
    }
    setSaving("__rate");
    try {
      await updateRate({ ngnPerPoint: ngn, usdPerPoint: usd });
      setRateDraft(null);
      toast.success(`Point value saved — 1 pt = ${formatNgn(ngn)} / ${formatUsd(usd)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const loadDefaults = async () => {
    setSaving("__seed");
    try {
      const res = await seedDefaults({});
      toast.success(res.created > 0 ? `Added ${res.created} default services at 0 pts — set their costs below` : "All default services already exist");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load defaults");
    } finally {
      setSaving(null);
    }
  };

  const saveAllPackages = async () => {
    if (packages.length === 0) {
      toast.error("Add at least one package");
      return;
    }
    const payload = packages.map((p) => ({
      id: p.id.trim().toLowerCase().replace(/\s+/g, "-"),
      name: p.name.trim(),
      points: Number(p.points),
      priceNgn: Number(p.priceNgn),
      priceUsd: Number(p.priceUsd),
      popular: p.popular,
    }));
    for (const p of payload) {
      if (!p.id || !p.name || !Number.isFinite(p.points) || p.points <= 0) {
        toast.error("Every package needs a key, name and positive points amount");
        return;
      }
      if (!Number.isFinite(p.priceNgn) || p.priceNgn < 0 || !Number.isFinite(p.priceUsd) || p.priceUsd < 0) {
        toast.error(`Invalid price on ${p.name || p.id}`);
        return;
      }
    }
    setSaving("__packages");
    try {
      await savePackages({ packages: payload });
      setPkgDraft(null);
      toast.success(`${payload.length} package${payload.length === 1 ? "" : "s"} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const byService = new Map((pricing ?? []).map((p) => [p.service, p]));
  const rows: PricingRow[] = [
    ...SEED_SERVICES.filter((s) => !byService.has(s.service)).map((s, i) => ({
      _id: `placeholder-${i}`,
      service: s.service,
      workspace: s.workspace,
      pointsCost: 0,
      isActive: false,
      effectiveFrom: 0,
      updatedAt: 0,
    })),
    ...(pricing ?? []),
  ].sort((a, b) => a.service.localeCompare(b.service));

  const save = async (row: PricingRow) => {
    const raw = edits[row.service];
    const cost = raw !== undefined && raw !== "" ? Number(raw) : row.pointsCost;
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Cost must be a non-negative number");
      return;
    }
    const ngnRaw = priceEdits[`${row.service}|ngn`];
    const usdRaw = priceEdits[`${row.service}|usd`];
    const priceNgn = ngnRaw === undefined || ngnRaw === "" ? undefined : Number(ngnRaw);
    const priceUsd = usdRaw === undefined || usdRaw === "" ? undefined : Number(usdRaw);
    if (priceNgn !== undefined && (!Number.isFinite(priceNgn) || priceNgn < 0)) {
      toast.error("Naira price must be a non-negative number (or blank for auto)");
      return;
    }
    if (priceUsd !== undefined && (!Number.isFinite(priceUsd) || priceUsd < 0)) {
      toast.error("Dollar price must be a non-negative number (or blank for auto)");
      return;
    }
    setSaving(row.service);
    try {
      await upsert({
        service: row.service,
        workspace: row.workspace,
        pointsCost: cost,
        priceNgn,
        priceUsd,
        isActive: row.isActive,
      });
      setEdits((e) => ({ ...e, [row.service]: "" }));
      setPriceEdits((p) => ({ ...p, [`${row.service}|ngn`]: "", [`${row.service}|usd`]: "" }));
      const shown = priceNgn ?? cost * ngnRate;
      toast.success(
        `${row.service}: ${cost} pts · ${formatNgn(shown)}${priceNgn === undefined ? " (auto from rate)" : " (custom price)"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (row: PricingRow) => {
    setSaving(row.service);
    try {
      await upsert({ service: row.service, workspace: row.workspace, pointsCost: row.pointsCost, isActive: !row.isActive });
      toast.success(row.isActive ? `${row.service} disabled` : `${row.service} enabled`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const createPricing = async () => {
    const service = draft.service.trim().toLowerCase().replace(/\s+/g, "_");
    const cost = Number(draft.cost);
    if (!service || !Number.isFinite(cost) || cost < 0) {
      toast.error("Provide a service key and non-negative cost");
      return;
    }
    setSaving("__new");
    try {
      await upsert({ service, workspace: draft.workspace, pointsCost: cost, isActive: true });
      toast.success(`Created pricing for ${service} — ${cost} pts (${formatNgn(cost * ngnRate)})`);
      setDraft({ service: "", workspace: "platform", cost: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pricing Control"
        description="Set the naira value of a point, the packages customers buy, and the point cost per service. Changes take effect immediately and are audited."
      />

      {/* Point value / currency */}
      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <Calculator className="h-4 w-4 text-blue-600" /> Point value (₦ / $)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="ngnRate" className="text-xs text-slate-600 dark:text-slate-400">
                Naira per point (₦)
              </Label>
              <Input
                id="ngnRate"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={ngnInput}
                onChange={(e) => setRateDraft({ ngn: e.target.value, usd: usdInput })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usdRate" className="text-xs text-slate-600 dark:text-slate-400">
                Dollars per point ($)
              </Label>
              <Input
                id="usdRate"
                type="number"
                min={0}
                step="0.001"
                inputMode="decimal"
                value={usdInput}
                onChange={(e) => setRateDraft({ ngn: ngnInput, usd: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={saveRate} disabled={saving === "__rate" || !billing} className="gap-1">
                {saving === "__rate" ? "Saving…" : "Save point value"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>1 pt = <span className="font-semibold text-slate-700 dark:text-slate-200">{formatNgn(ngnRate)}</span></span>
            <span>1 pt = <span className="font-semibold text-slate-700 dark:text-slate-200">{formatUsd(usdRate)}</span></span>
            <span>$1 ≈ <span className="font-semibold text-slate-700 dark:text-slate-200">{ngnRate > 0 && usdRate > 0 ? formatNgn(usdNgnRate) : "—"}</span></span>
            <span>Example: 100 pts = <span className="font-semibold text-slate-700 dark:text-slate-200">{formatNgn(100 * ngnRate)}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Point packages */}
      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <PackageIcon className="h-4 w-4 text-blue-600" /> Point packages
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() =>
              setPkgDraft([
                ...packages,
                { id: "", name: "", points: "", priceNgn: "", priceUsd: "", popular: false },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add package
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!billing ? (
            <div className="p-4"><AdminSkeleton rows={3} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
                    <th className="px-4 py-3 font-medium">Key</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Points</th>
                    <th className="px-4 py-3 font-medium">Price ₦</th>
                    <th className="px-4 py-3 font-medium">Price $</th>
                    <th className="px-4 py-3 font-medium">Popular</th>
                    <th className="px-4 py-3" />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg, index) => (
                    <tr key={`${pkg.id}-${index}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2.5">
                        <Input
                          className="h-8 w-28 font-mono text-xs"
                          aria-label={`Package key ${index + 1}`}
                          value={pkg.id}
                          placeholder="starter"
                          onChange={(e) => patchPkg(index, { id: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          className="h-8 w-32"
                          aria-label={`Package name ${index + 1}`}
                          value={pkg.name}
                          placeholder="Starter"
                          onChange={(e) => patchPkg(index, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-24"
                          aria-label={`Package points ${index + 1}`}
                          value={pkg.points}
                          placeholder="1000"
                          onChange={(e) => patchPkg(index, { points: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-28"
                          aria-label={`Package naira price ${index + 1}`}
                          value={pkg.priceNgn}
                          placeholder="15000"
                          onChange={(e) => patchPkg(index, { priceNgn: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 w-24"
                          aria-label={`Package dollar price ${index + 1}`}
                          value={pkg.priceUsd}
                          placeholder="10"
                          onChange={(e) => patchPkg(index, { priceUsd: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Switch
                          checked={pkg.popular}
                          aria-label={`Mark ${pkg.name || "package"} popular`}
                          onCheckedChange={(checked) => patchPkg(index, { popular: checked })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-slate-500"
                          disabled={!pkg.points}
                          onClick={() =>
                            patchPkg(index, {
                              priceNgn: String(Math.round(Number(pkg.points) * ngnRate)),
                              priceUsd: String(Math.round(Number(pkg.points) * usdRate * 100) / 100),
                            })
                          }
                        >
                          Use rate
                        </Button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-red-600"
                          aria-label={`Remove ${pkg.name || "package"}`}
                          disabled={packages.length <= 1}
                          onClick={() => setPkgDraft(packages.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <CardContent className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shown on the customer Buy Points page. Default: {formatNgn(15000)} = 1,000 pts.
          </p>
          <Button onClick={saveAllPackages} disabled={saving === "__packages" || !billing}>
            {saving === "__packages" ? "Saving…" : "Save packages"}
          </Button>
        </CardContent>
      </Card>

      {/* Service pricing */}
      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <BadgeDollarSign className="h-4 w-4 text-blue-600" /> Service pricing
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Set a points cost and the exact ₦/$ price per service. Leave a price blank to
              derive it from the point rate. Only <strong>active</strong> services are charged —
              inactive rows keep the platform default.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={loadDefaults}
            disabled={saving === "__seed" || pricing === undefined}
          >
            {saving === "__seed" ? "Loading…" : "Load default services"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {pricing === undefined ? (
            <div className="p-4"><AdminSkeleton rows={6} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Workspace</th>
                    <th className="px-4 py-3 font-medium">Points</th>
                    <th className="px-4 py-3 font-medium">Price ₦</th>
                    <th className="px-4 py-3 font-medium">Price $</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isNew = row._id.startsWith("placeholder-");
                    const pending = edits[row.service];
                    const pointsValue = pending !== undefined && pending !== "" ? Number(pending) : isNew ? 0 : row.pointsCost;
                    const ngnValue = Number.isFinite(pointsValue) ? pointsValue * ngnRate : 0;
                    return (
                      <tr key={row._id} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${isNew ? "bg-slate-50/60 dark:bg-slate-800/30" : ""}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-900 dark:text-white">{row.service}{isNew && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">not configured</span>}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{row.workspace}</td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            aria-label={`Points cost for ${row.service}`}
                            className="h-8 w-24"
                            value={edits[row.service] ?? (isNew ? "" : String(row.pointsCost))}
                            placeholder={isNew ? "cost" : undefined}
                            onChange={(e) => setEdits((s) => ({ ...s, [row.service]: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            aria-label={`Naira price for ${row.service}`}
                            className="h-8 w-28"
                            placeholder={pointsValue > 0 ? String(Math.round(ngnValue)) : "auto"}
                            value={
                              priceEdits[`${row.service}|ngn`] ??
                              (row.priceNgn != null ? String(row.priceNgn) : "")
                            }
                            onChange={(e) =>
                              setPriceEdits((p) => ({ ...p, [`${row.service}|ngn`]: e.target.value }))
                            }
                          />
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {row.priceNgn != null ? "custom" : "auto from rate"}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.001"
                            inputMode="decimal"
                            aria-label={`Dollar price for ${row.service}`}
                            className="h-8 w-24"
                            placeholder={pointsValue > 0 ? String(Math.round(pointsValue * usdRate * 1000) / 1000) : "auto"}
                            value={
                              priceEdits[`${row.service}|usd`] ??
                              (row.priceUsd != null ? String(row.priceUsd) : "")
                            }
                            onChange={(e) =>
                              setPriceEdits((p) => ({ ...p, [`${row.service}|usd`]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <Switch
                            checked={!isNew && row.isActive}
                            disabled={isNew || saving === row.service}
                            onCheckedChange={() => toggleActive(row)}
                            aria-label={`Toggle ${row.service}`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{isNew ? "—" : fmtDate(row.updatedAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              saving === row.service ||
                              ((edits[row.service] ?? "") === "" &&
                                (priceEdits[`${row.service}|ngn`] ?? "") === "" &&
                                (priceEdits[`${row.service}|usd`] ?? "") === "")
                            }
                            onClick={() => save(row)}
                          >
                            Save
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900 dark:text-white">Add service pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="svc" className="text-xs text-slate-600 dark:text-slate-400">Service key</Label>
              <Input id="svc" value={draft.service} onChange={(e) => setDraft((d) => ({ ...d, service: e.target.value }))} placeholder="e.g. sms_send" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws" className="text-xs text-slate-600 dark:text-slate-400">Workspace</Label>
              <select
                id="ws"
                aria-label="Workspace"
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                value={draft.workspace}
                onChange={(e) => setDraft((d) => ({ ...d, workspace: e.target.value }))}
              >
                {WORKSPACES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost" className="text-xs text-slate-600 dark:text-slate-400">Points cost</Label>
              <Input id="cost" type="number" min={0} value={draft.cost} onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))} className="w-28" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 dark:text-slate-400">Price (₦)</Label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                {draft.cost !== "" && Number.isFinite(Number(draft.cost)) ? formatNgn(Number(draft.cost) * ngnRate) : "—"}
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={createPricing} disabled={saving === "__new" || !draft.service.trim() || draft.cost === ""} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
