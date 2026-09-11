import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminEmpty, AdminPageHeader, AdminSkeleton, StatusBadge, fmtDate } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BadgeDollarSign, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const defaultServices = [
  { service: "shipment_creation", workspace: "operations", pointsCost: 100 },
  { service: "flight_document", workspace: "documents", pointsCost: 150 },
  { service: "hotel_document", workspace: "documents", pointsCost: 120 },
  { service: "invoice_document", workspace: "documents", pointsCost: 80 },
  { service: "customs_document", workspace: "documents", pointsCost: 100 },
  { service: "email_recipient", workspace: "campaigns", pointsCost: 10 },
  { service: "image_rendering", workspace: "creative", pointsCost: 50 },
  { service: "referral_reward", workspace: "growth", pointsCost: 50 },
] as const;

export default function AdminPricing() {
  const pricing = useQuery(api.adminApi.getPricing);
  const upsertPricing = useMutation(api.adminApi.upsertPricing);
  const [service, setService] = useState<string>(defaultServices[0].service);
  const selectedDefault = defaultServices.find((item) => item.service === service) ?? defaultServices[0];
  const [workspace, setWorkspace] = useState<string>(selectedDefault.workspace);
  const [pointsCost, setPointsCost] = useState(String(selectedDefault.pointsCost));
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectService = (value: string) => {
    const next = defaultServices.find((item) => item.service === value);
    setService(value);
    if (next) {
      setWorkspace(next.workspace);
      setPointsCost(String(next.pointsCost));
    }
  };

  const save = async () => {
    const cost = Number(pointsCost);
    if (!Number.isFinite(cost) || cost < 0 || busy) return;
    setBusy(true);
    try {
      await upsertPricing({ service, workspace, pointsCost: cost, isActive });
      toast.success("Pricing saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save pricing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pricing"
        description="Control point costs for platform operations without changing application code."
      />

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr_0.6fr_auto]">
          <div className="space-y-2">
            <Label>Service</Label>
            <Select value={service} onValueChange={selectService}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {defaultServices.map((item) => (
                  <SelectItem key={item.service} value={item.service}>
                    {item.service.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pricing-workspace">Workspace</Label>
            <Input id="pricing-workspace" value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pricing-cost">Point cost</Label>
            <Input id="pricing-cost" type="number" min="0" value={pointsCost} onChange={(event) => setPointsCost(event.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex h-10 items-center gap-2 rounded-md border border-border px-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Pricing active" />
              <span className="text-sm text-foreground">Active</span>
            </div>
            <Button className="gap-2" onClick={save} disabled={busy || !workspace.trim() || !Number.isFinite(Number(pointsCost))}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configured costs</h2>
        {pricing === undefined ? (
          <AdminSkeleton rows={5} />
        ) : pricing.length === 0 ? (
          <AdminEmpty message="No custom pricing has been configured." hint="Save a service above to create the first pricing row." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pricing.map((row) => (
              <Card key={row._id} className="rounded-xl border-border bg-card shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BadgeDollarSign className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{row.service.replace(/_/g, " ")}</p>
                      <StatusBadge status={row.isActive ? "active" : "disabled"} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{row.workspace}</p>
                    <p className="mt-3 text-2xl font-bold text-foreground">{row.pointsCost.toLocaleString()} pts</p>
                    <p className="mt-1 text-xs text-muted-foreground">Updated {fmtDate(row.updatedAt)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
