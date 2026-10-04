import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Ban, Check, RotateCcw, X, RefreshCw, Store } from "lucide-react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { useEffect, useState } from "react";

export default function AdminMarketplace() {
  const products = useQuery(api.marketplace.adminListAllProducts, { limit: 200 });
  const approve = useMutation(api.marketplace.adminApproveProduct);
  const toggleActive = useMutation(api.adminApi.adminToggleProductActive);
  const provider = useQuery(api.marketplace.getLogspanelAdminStatus, {});
  const providerProducts = useQuery(api.marketplace.getLogspanelProducts, { limit: 200 });
  const syncCatalog = useAction(api.logspanel.syncCatalog);
  const saveProvider = useMutation(api.marketplace.setLogspanelSettings);
  const [syncing, setSyncing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [markup, setMarkup] = useState("0");

  useEffect(() => {
    if (provider) {
      setEnabled(provider.enabled);
      setMarkup(String(provider.markupPercent));
    }
  }, [provider?.enabled, provider?.markupPercent]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await syncCatalog({});
      toast.success("Logspanel synced: " + result.created + " created, " + result.updated + " updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Catalog sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const saveProviderSettings = async () => {
    try {
      await saveProvider({ enabled, markupPercent: Number(markup) });
      toast.success("Logspanel settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    }
  };

  const act = async (productId: string, doApprove: boolean) => {
    try {
      await approve({ productId: productId as never, approve: doApprove });
      toast.success(doApprove ? "Product approved" : "Product rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const toggle = async (productId: string, isActive: boolean) => {
    try {
      await toggleActive({ productId: productId as never, isActive: !isActive });
      toast.success(isActive ? "Product disabled" : "Product re-enabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Marketplace Administration" description="Approve products and control marketplace visibility." />

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">\n        <CardContent className="p-5">\n          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">\n            <div className="flex items-start gap-3"><Store className="mt-1 h-5 w-5" /><div><h2 className="font-semibold">Logspanel Provider</h2><p className="text-sm text-muted-foreground">External logs supplier with server-side fulfillment.</p><p className="mt-1 text-xs text-muted-foreground">{provider?.configured ? "API key configured" : "Set LOGSPANEL_API_KEY in Convex"} · {provider?.syncedProducts ?? 0} products synced</p></div></div>\n            <div className="flex gap-2"><Button variant="outline" disabled={!provider?.configured || syncing} onClick={sync}><RefreshCw className={syncing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />{syncing ? "Syncing..." : "Sync catalog"}</Button><Button onClick={saveProviderSettings}>Save</Button></div>\n          </div>\n          <div className="mt-4 grid gap-3 sm:grid-cols-2">\n            <label className="text-sm"><span className="mb-1 block text-muted-foreground">Provider enabled</span><select className="h-10 w-full rounded-md border bg-background px-3" value={enabled ? "true" : "false"} onChange={(e) => setEnabled(e.target.value === "true")}><option value="false">Disabled</option><option value="true">Enabled</option></select></label>\n            <label className="text-sm"><span className="mb-1 block text-muted-foreground">Markup %</span><input className="h-10 w-full rounded-md border bg-background px-3" type="number" min="0" max="100" step="0.1" value={markup} onChange={(e) => setMarkup(e.target.value)} /></label>\n          </div>\n        </CardContent>\n      </Card>\n\n      {products === undefined ? (
        <AdminSkeleton rows={5} />
      ) : products.length === 0 ? (
        <AdminEmpty message="No marketplace products yet." />
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {p.pointsPrice} pts · {p.category} · {p.totalSold} sold · {fmtDate(p.createdAt)}
                  </p>
                </div>
                <StatusBadge status={p.isApproved ? (p.isActive ? "active" : "paused") : "draft"} />
                <div className="flex shrink-0 gap-1">
                  {!p.isApproved ? (
                    <>
                      <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => act(p._id, true)}>
                        <Check className="mr-1 h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(p._id, false)}>
                        <X className="mr-1 h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => toggle(p._id, p.isActive)}>
                      {p.isActive ? <><Ban className="mr-1 h-3 w-3" /> Disable</> : <><RotateCcw className="mr-1 h-3 w-3" /> Re-enable</>}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
