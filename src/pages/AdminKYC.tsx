import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, ClipboardCheck, X } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, ConfirmDialog, StatCard, fmtDate } from "@/components/admin/shared";

export default function AdminKYC() {
  const kycs = useQuery(api.tenants.adminListKyc, { limit: 300 });
  const review = useMutation(api.tenants.adminKycReview);

  const [action, setAction] = useState<null | { kycId: string; kind: "verified" | "rejected" | "more_information_required"; label: string }>(null);

  const counts = {
    pending: (kycs ?? []).filter((k) => k.status === "pending").length,
    underReview: (kycs ?? []).filter((k) => k.status === "under_review").length,
    verified: (kycs ?? []).filter((k) => k.status === "verified").length,
    rejected: (kycs ?? []).filter((k) => k.status === "rejected").length,
  };

  const runAction = async (reason: string) => {
    if (!action) return;
    try {
      await review({ kycId: action.kycId as never, status: action.kind, notes: reason });
      toast.success(`KYC ${action.kind.replace(/_/g, " ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="KYC Administration" description="Review identity verification cases. Access is restricted to admins." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Pending" value={counts.pending} icon={ClipboardCheck} color="amber" />
        <StatCard title="Verified" value={counts.verified} icon={Check} color="green" />
        <StatCard title="Rejected" value={counts.rejected} icon={X} color="red" />
        <StatCard title="More info needed" value={counts.underReview} icon={ClipboardCheck} color="blue" />
      </div>

      {kycs === undefined ? (
        <AdminSkeleton rows={5} />
      ) : kycs.length === 0 ? (
        <AdminEmpty message="No KYC cases yet." hint="Cases appear when tenant owners submit verification." />
      ) : (
        <div className="space-y-2">
          {kycs.map((k) => (
            <Card key={k._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{k.fullName}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    DOB: {k.dateOfBirth || "—"} · Doc: {k.documentUrl ? "attached" : "none"} · {fmtDate(k.createdAt)}
                  </p>
                  {k.notes && <p className="mt-1 truncate text-[11px] text-slate-500">Notes: {k.notes}</p>}
                </div>
                <StatusBadge status={k.status} />
                {k.status !== "verified" && k.status !== "rejected" && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      className="bg-green-600 text-white hover:bg-green-700"
                      onClick={() => setAction({ kycId: k._id, kind: "verified", label: "Approve KYC" })}
                    >
                      <Check className="mr-1 h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAction({ kycId: k._id, kind: "more_information_required", label: "Request info" })}
                    >
                      Request info
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      onClick={() => setAction({ kycId: k._id, kind: "rejected", label: "Reject KYC" })}
                    >
                      <X className="h-3 w-3" />
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
          title={action.label}
          description={
            action.kind === "rejected"
              ? "Rejection requires a reason. The applicant is notified and the decision is audited."
              : action.kind === "verified"
                ? "Marks the identity as verified. Audited."
                : "Requests additional information from the applicant with your notes."
          }
          actionLabel={action.kind === "verified" ? "Approve" : action.kind === "rejected" ? "Reject" : "Request"}
          destructive={action.kind === "rejected"}
          requireReason
          minReasonLength={5}
        />
      )}
    </div>
  );
}
