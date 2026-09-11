import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminEmpty, AdminPageHeader, AdminSkeleton, ConfirmDialog, StatusBadge, fmtDate } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Gavel, MessageSquare, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statuses = ["all", "open", "under_review", "resolved", "closed"] as const;
const priorities = ["low", "medium", "high", "critical"] as const;

export default function AdminDisputes() {
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [resolution, setResolution] = useState<null | { id: string; outcome: "refund_buyer" | "reject" }>(null);

  const disputes = useQuery(
    api.adminApi.adminListDisputes,
    status === "all" ? { limit: 100 } : { status, limit: 100 },
  );
  const orders = useQuery(api.admin.adminListOrders, { limit: 300 });
  const products = useQuery(api.marketplace.adminListAllProducts, { limit: 500 });
  const addNote = useMutation(api.adminApi.addDisputeNote);
  const setPriority = useMutation(api.adminApi.setDisputePriority);
  const resolveDispute = useMutation(api.adminApi.resolveDispute);

  const orderMap = useMemo(() => new Map((orders ?? []).map((order) => [order._id, order])), [orders]);
  const productMap = useMemo(() => new Map((products ?? []).map((product) => [product._id, product])), [products]);

  const saveNote = async (disputeId: string) => {
    const text = noteDraft[disputeId]?.trim();
    if (!text) return;
    try {
      await addNote({ disputeId: disputeId as never, text });
      setNoteDraft((drafts) => ({ ...drafts, [disputeId]: "" }));
      toast.success("Dispute note added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add note");
    }
  };

  const changePriority = async (disputeId: string, priority: (typeof priorities)[number]) => {
    try {
      await setPriority({ disputeId: disputeId as never, priority });
      toast.success("Priority updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update priority");
    }
  };

  const confirmResolution = async (reason: string) => {
    if (!resolution) return;
    await resolveDispute({
      disputeId: resolution.id as never,
      outcome: resolution.outcome,
      resolution: reason,
    });
    toast.success(resolution.outcome === "refund_buyer" ? "Buyer refunded" : "Dispute rejected");
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Disputes"
        description="Review marketplace disputes, add case notes, and resolve outcomes with an audit trail."
        actions={
          <Select value={status} onValueChange={(value) => setStatus(value as (typeof statuses)[number])}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All disputes</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {disputes === undefined ? (
        <AdminSkeleton rows={6} />
      ) : disputes.length === 0 ? (
        <AdminEmpty message="No disputes found." hint="New buyer disputes will appear here for review." />
      ) : (
        <div className="grid gap-4">
          {disputes.map((dispute) => {
            const order = orderMap.get(dispute.orderId);
            const product = order ? productMap.get(order.productId) : undefined;
            const currentPriority = dispute.priority ?? "medium";
            const locked = dispute.status === "resolved" || dispute.status === "closed";

            return (
              <Card key={dispute._id} className="rounded-xl border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Gavel className="h-4 w-4 text-primary" />
                        <p className="font-mono text-xs text-muted-foreground">{dispute._id}</p>
                        <StatusBadge status={dispute.status} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{product?.name ?? "Marketplace order dispute"}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{dispute.reason}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Opened {fmtDate(dispute.createdAt)}
                        {order ? ` · ${order.totalPoints.toLocaleString()} pts · Order ${order._id}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={currentPriority}
                        onValueChange={(value) => changePriority(dispute._id, value as (typeof priorities)[number])}
                        disabled={locked}
                      >
                        <SelectTrigger className="h-9 w-36">
                          <SlidersHorizontal className="h-4 w-4" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorities.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {priority}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!locked && (
                        <>
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => setResolution({ id: dispute._id, outcome: "reject" })}>
                            <ShieldCheck className="h-4 w-4" />
                            Reject
                          </Button>
                          <Button size="sm" className="gap-2" onClick={() => setResolution({ id: dispute._id, outcome: "refund_buyer" })}>
                            <RotateCcw className="h-4 w-4" />
                            Refund
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {dispute.notes && dispute.notes.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                      {dispute.notes.slice(-3).map((note) => (
                        <div key={`${note.createdAt}-${note.text}`} className="text-sm">
                          <p className="text-foreground">{note.text}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{note.authorEmail ?? "Admin"} · {fmtDate(note.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!locked && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Textarea
                        value={noteDraft[dispute._id] ?? ""}
                        onChange={(event) => setNoteDraft((drafts) => ({ ...drafts, [dispute._id]: event.target.value }))}
                        placeholder="Add an internal case note"
                        rows={2}
                      />
                      <Button className="gap-2 sm:self-start" onClick={() => saveNote(dispute._id)} disabled={!noteDraft[dispute._id]?.trim()}>
                        <MessageSquare className="h-4 w-4" />
                        Add note
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {resolution && (
        <ConfirmDialog
          open
          onClose={() => setResolution(null)}
          onConfirm={confirmResolution}
          title={resolution.outcome === "refund_buyer" ? "Refund buyer" : "Reject dispute"}
          description={
            resolution.outcome === "refund_buyer"
              ? "This moves points back to the buyer and marks the dispute resolved."
              : "This closes the dispute without refunding the buyer."
          }
          resource={resolution.id}
          actionLabel={resolution.outcome === "refund_buyer" ? "Refund buyer" : "Reject dispute"}
          destructive={resolution.outcome === "refund_buyer"}
          minReasonLength={8}
        />
      )}
    </div>
  );
}
