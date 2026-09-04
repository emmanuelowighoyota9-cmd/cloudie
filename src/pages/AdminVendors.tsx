import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShoppingBag, Check, X } from "lucide-react";

export default function AdminVendors() {
  const vendors = useQuery(api.marketplace.adminListVendors, {});
  const updateVendor = useMutation(api.marketplace.adminUpdateVendor);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Vendor Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review, approve, and manage vendors.</p>
      </div>

      <div className="space-y-3">
        {!vendors ? (
          <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading vendors...</p>
        ) : vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No vendors registered.</p>
        ) : (
          vendors.map((v) => (
            <Card key={v._id} className="notebook-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/50">
                  <ShoppingBag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--nb-ink)]">{v.businessName}</p>
                  <p className="text-xs text-muted-foreground">{v.earnings.toLocaleString()} pts earned • {v.totalSales} sales</p>
                </div>
                <Badge variant={
                  v.status === "approved" ? "default" : v.status === "rejected" ? "destructive" : v.status === "suspended" ? "destructive" : "secondary"
                } className="capitalize">{v.status}</Badge>
                <div className="flex gap-1">
                  {v.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={async () => { await updateVendor({ vendorId: v._id as any, status: "approved" }); toast.success("Approved!"); }}>
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => { await updateVendor({ vendorId: v._id as any, status: "rejected" }); toast.success("Rejected"); }}>
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {v.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={async () => { await updateVendor({ vendorId: v._id as any, status: "suspended" }); toast.success("Suspended"); }}>Suspend</Button>
                  )}
                  {v.status === "suspended" && (
                    <Button size="sm" variant="outline" onClick={async () => { await updateVendor({ vendorId: v._id as any, status: "approved" }); toast.success("Reactivated"); }}>Reactivate</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
