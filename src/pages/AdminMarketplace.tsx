import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export default function AdminMarketplace() {
  const products = useQuery(api.marketplace.adminListAllProducts, {});
  const approveProduct = useMutation(api.marketplace.adminApproveProduct);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Marketplace Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review and approve marketplace products.</p>
      </div>
      <div className="space-y-3">
        {!products ? <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading...</p> : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No products.</p>
        ) : products.map((p) => (
          <Card key={p._id} className="notebook-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--nb-ink)]">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.pointsPrice} pts • {p.category}</p>
              </div>
              <Badge variant={p.isApproved ? "default" : "secondary"}>{p.isApproved ? "Approved" : "Pending"}</Badge>
              {!p.isApproved && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={async () => { await approveProduct({ productId: p._id as any, approve: true }); toast.success("Approved"); }}><Check className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={async () => { await approveProduct({ productId: p._id as any, approve: false }); toast.success("Rejected"); }}><X className="h-3 w-3" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
