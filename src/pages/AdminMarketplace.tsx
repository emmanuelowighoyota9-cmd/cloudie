import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Ban, Check, RotateCcw, X, RefreshCw, Store } from "lucide-react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { useState } from "react";

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

      {products === undefined ? (
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
