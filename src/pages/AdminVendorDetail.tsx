import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, Link } from "react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Ban, Check, RotateCcw, X } from "lucide-react";
import { AdminPageHeader, StatusBadge, ConfirmDialog, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";

export default function AdminVendorDetail() {
  const params = useParams();
  const id = params.id ?? params.vendorId;
  const vendor = useQuery(api.adminApi.getVendorAdmin, id ? { vendorId: id as never } : "skip");
  const products = useQuery(
    api.adminApi.listVendorProducts,
    id ? { vendorId: id as never } : "skip",
  );
  const review = useMutation(api.adminApi.reviewVendor);

  const [action, setAction] = useState<null | "approve" | "reject" | "suspend" | "reactivate">(null);

  const runAction = async (reason: string) => {
    if (!action) return;
    try {
      await review({ vendorId: id as never, action, reason });
      toast.success(`Vendor ${action}d`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
      throw e;
    }
  };

  if (vendor === undefined) return <AdminSkeleton rows={4} />;
  if (vendor === null) return <AdminEmpty message="Vendor not found." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/vendors" aria-label="Back to vendors"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <AdminPageHeader title={vendor.businessName} description={`Vendor since ${fmtDate(vendor.createdAt)}`} />
        </div>
        <StatusBadge status={vendor.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total earnings</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{vendor.earnings.toLocaleString()} pts</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total sales</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{vendor.totalSales}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Products</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{products?.length ?? "…"}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Status reason</p>
            <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{vendor.statusReason || "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-base">Application details</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-[11px] uppercase text-slate-400">Contact email</p><p className="text-slate-900 dark:text-white">{vendor.contactEmail || "—"}</p></div>
          <div><p className="text-[11px] uppercase text-slate-400">Phone</p><p className="text-slate-900 dark:text-white">{vendor.contactPhone || "—"}</p></div>
          <div><p className="text-[11px] uppercase text-slate-400">Category</p><p className="capitalize text-slate-900 dark:text-white">{vendor.category || "—"}</p></div>
          <div><p className="text-[11px] uppercase text-slate-400">Website</p><p className="truncate text-blue-600">{vendor.website || "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-[11px] uppercase text-slate-400">Description</p><p className="text-slate-900 dark:text-white">{vendor.description || "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-[11px] uppercase text-slate-400">Supporting info</p><p className="text-slate-900 dark:text-white">{vendor.supportingInfo || "—"}</p></div>
        </CardContent>
      </Card>

      {products && products.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Products ({products.length})</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {products.map((p) => (
              <div key={p._id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                  <p className="text-[11px] text-slate-400">{p.pointsPrice} pts · {p.totalSold} sold</p>
                </div>
                <StatusBadge status={p.isApproved ? (p.isActive ? "active" : "paused") : "draft"} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3"><CardTitle className="text-base">Review actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {vendor.status === "pending" && (
            <>
              <Button className="bg-green-600 text-white hover:bg-green-700" onClick={() => setAction("approve")}>
                <Check className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button variant="outline" className="text-red-600" onClick={() => setAction("reject")}>
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {vendor.status === "approved" && (
            <Button variant="outline" className="text-red-600" onClick={() => setAction("suspend")}>
              <Ban className="mr-1 h-4 w-4" /> Suspend
            </Button>
          )}
          {(vendor.status === "suspended" || vendor.status === "rejected") && (
            <Button variant="outline" onClick={() => setAction("reactivate")}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reactivate
            </Button>
          )}
        </CardContent>
      </Card>

      {action && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          onConfirm={runAction}
          title={`${action.charAt(0).toUpperCase() + action.slice(1)} vendor`}
          description={
            action === "reject" || action === "suspend"
              ? "A reason is required and will be shown to the vendor plus recorded in the audit log."
              : action === "approve"
                ? "The vendor gains marketplace selling access and their user role becomes vendor."
                : "The vendor regains selling access."
          }
          resource={vendor.businessName}
          actionLabel={action.charAt(0).toUpperCase() + action.slice(1)}
          destructive={action === "reject" || action === "suspend"}
          requireReason={action !== "approve" && action !== "reactivate"}
          minReasonLength={5}
        />
      )}
    </div>
  );
}
