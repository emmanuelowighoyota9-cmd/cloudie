import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ClipboardList, Check, X } from "lucide-react";

export default function AdminKYC() {
  const records = useQuery(api.tenants.adminListKyc, {});
  const review = useMutation(api.tenants.adminKycReview);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">KYC Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and manage KYC verification requests.</p>
        </div>
      </div>
      <div className="space-y-3">
        {!records ? <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading...</p> : records.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No KYC records.</p>
        ) : records.map((r) => (
          <Card key={r._id} className="notebook-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--nb-ink)]">{r.fullName}</p>
                <p className="text-xs text-muted-foreground">{r.dateOfBirth || "No DOB"} • Submitted {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <Badge variant={r.status === "verified" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{r.status.replace(/_/g, " ")}</Badge>
              {r.status === "pending" && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={async () => { await review({ kycId: r._id as any, status: "verified" }); toast.success("Verified"); }}><Check className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={async () => { await review({ kycId: r._id as any, status: "rejected", notes: "Rejected by admin" }); toast.success("Rejected"); }}><X className="h-3 w-3" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
