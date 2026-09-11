import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BadgeDollarSign, Plus } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, AdminSkeleton, fmtDate } from "@/components/admin/shared";

type PricingRow = {
  _id: string;
  service: string;
  workspace: string;
  pointsCost: number;
  isActive: boolean;
  effectiveFrom: number;
  updatedAt: number;
};

const WORKSPACES = ["shipments", "ticketing", "business", "services", "platform"] as const;

const SEED_SERVICES: { service: string; workspace: string }[] = [
  { service: "shipment_create", workspace: "shipments" },
  { service: "shipment_tracking_update", workspace: "shipments" },
  { service: "flight_pdf", workspace: "ticketing" },
  { service: "hotel_pdf", workspace: "ticketing" },
  { service: "commercial_invoice", workspace: "ticketing" },
  { service: "customs_document", workspace: "ticketing" },
  { service: "email_per_recipient", workspace: "services" },
  { service: "image_render", workspace: "services" },
];

export default function AdminPricing() {
  const pricing = useQuery(api.adminApi.getPricing) as PricingRow[] | undefined;
  const upsert = useMutation(api.adminApi.upsertPricing);

  const [draft, setDraft] = useState({ service: "", workspace: "platform", cost: "" });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

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
    const cost = raw !== undefined ? Number(raw) : row.pointsCost;
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Cost must be a non-negative number");
      return;
    }
    setSaving(row.service);
    try {
      await upsert({ service: row.service, workspace: row.workspace, pointsCost: cost, isActive: row.isActive });
      setEdits((e) => ({ ...e, [row.service]: "" }));
      toast.success(`Pricing saved for ${row.service}`);
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
      toast.success(`Created pricing for ${service}`);
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
        description="Configure point costs per service. Changes take effect immediately and are audited (PRICING_CHANGED)."
      />

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <BadgeDollarSign className="h-4 w-4 text-blue-600" /> Service pricing
          </CardTitle>
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
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isNew = row._id.startsWith("placeholder-");
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
                          <Switch
                            checked={!isNew && row.isActive}
                            disabled={isNew || saving === row.service}
                            onCheckedChange={() => toggleActive(row)}
                            aria-label={`Toggle ${row.service}`}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{isNew ? "—" : fmtDate(row.updatedAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button size="sm" variant="outline" disabled={saving === row.service || (edits[row.service] ?? "") === ""} onClick={() => save(row)}>
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
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
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
