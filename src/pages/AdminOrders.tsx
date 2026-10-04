import { useQuery, useMutation } from "convex/react";
import { formatNgn } from "@/lib/pricing";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, ConfirmDialog, downloadCsv, fmtDate } from "@/components/admin/shared";

export default function AdminOrders() {
  const orders = useQuery(api.admin.adminListOrders, { limit: 300 });
  const products = useQuery(api.marketplace.adminListAllProducts, { limit: 500 });
  const releaseEscrow = useMutation(api.adminApi.releaseEscrow);
  const refundOrder = useMutation(api.adminApi.refundOrder);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [action, setAction] = useState<null | { kind: "release" | "refund"; orderId: string }>(null);

  const productMap = useMemo(() => {
    const m = new Map<string, { name: string; vendorId: string }>();
    (products ?? []).forEach((p) => m.set(p._id, { name: p.name, vendorId: p.vendorId }));
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    if (!orders) return undefined;
    let list = [...orders];
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (o) =>
          o._id.toLowerCase().includes(s) ||
          productMap.get(o.productId)?.name.toLowerCase().includes(s),
      );
    }
    return list;
  }, [orders, search, statusFilter, productMap]);

  const exportCsv = () => {
    if (!filtered?.length) return;
    downloadCsv(`cloudie-orders-${new Date().toISOString().split("T")[0]}.csv`, [
      ["Order ID", "Product", "Quantity", "Points", "Status", "Created"],
      ...filtered.map((o) => [o._id, productMap.get(o.productId)?.name ?? "—", o.quantity, o.totalNgn ?? o.totalPoints * 15, o.status, fmtDate(o.createdAt)]),
    ]);
  };

  const runAction = async (reason: string) => {
    if (!action) return;
    try {
      if (action.kind === "release") {
        await releaseEscrow({ orderId: action.orderId as never, reason });
        toast.success("Escrow released");
      } else {
        await refundOrder({ orderId: action.orderId as never, reason });
        toast.success("Order refunded");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Marketplace Orders"
        description="Inspect order lifecycle; release escrow or refund with full audit."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered?.length} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search order ID or product…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending (escrow)</SelectItem>
            <SelectItem value="escrow">Escrow</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered === undefined ? (
        <AdminSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No orders match." />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={o._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {productMap.get(o.productId)?.name ?? "Product"}
                  </p>
                  <p className="truncate font-mono text-[11px] text-slate-400">{o._id} · {fmtDate(o.createdAt)}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-blue-600">{formatNgn(o.totalNgn ?? o.totalPoints * 15)}</span>
                <StatusBadge status={o.status} />
                {(o.status === "pending" || o.status === "escrow") && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => setAction({ kind: "release", orderId: o._id })}>
                      Release
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => setAction({ kind: "refund", orderId: o._id })}>
                      Refund
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {action && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          onConfirm={runAction}
          title={action.kind === "release" ? "Release escrow" : "Refund order"}
          description={
            action.kind === "release"
              ? "Moves the buyer's NGN payment to the vendor and marks the order completed. Idempotent."
              : "Refunds the buyer's NGN payment and marks the order refunded. Idempotent."
          }
          resource={action.orderId}
          actionLabel={action.kind === "release" ? "Release" : "Refund"}
          destructive={action.kind === "refund"}
        />
      )}
    </div>
  );
}
