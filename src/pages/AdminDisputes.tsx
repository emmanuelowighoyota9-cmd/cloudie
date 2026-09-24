import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Gavel, Plus } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, ConfirmDialog, fmtDate } from "@/components/admin/shared";

type Dispute = {
  _id: string;
  orderId: string;
  raisedBy: string;
  reason: string;
  status: string;
  priority?: "low" | "medium" | "high" | "critical";
  notes?: { authorEmail?: string; text: string; createdAt: number }[];
  resolution?: string;
  resolvedAt?: number;
  createdAt: number;
};

export default function AdminDisputes() {
  const disputes = useQuery(api.marketplace.listDisputes) as Dispute[] | undefined;
  const orders = useQuery(api.admin.adminListOrders, { limit: 500 });
  const markReview = useMutation(api.adminApi.markDisputeUnderReview);
  const addNote = useMutation(api.adminApi.addDisputeNote);
  const setPriority = useMutation(api.adminApi.setDisputePriority);
  const resolve = useMutation(api.adminApi.resolveDispute);

  const [openId, setOpenId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [resolveAction, setResolveAction] = useState<null | { id: string; outcome: "refund_buyer" | "reject" }>(null);

  const orderMap = new Map<string, NonNullable<typeof orders>[number]>((orders ?? []).map((o) => [o._id as string, o]));

  const counts = {
    open: (disputes ?? []).filter((d) => d.status === "open").length,
    underReview: (disputes ?? []).filter((d) => d.status === "under_review").length,
    resolved: (disputes ?? []).filter((d) => d.status === "resolved").length,
  };

  const dispute = disputes?.find((d) => d._id === openId) ?? null;
  const relatedOrder = dispute ? orderMap.get(dispute.orderId) : undefined;

  const submitNote = async () => {
    if (!dispute || noteText.trim().length < 2) return;
    try {
      await addNote({ disputeId: dispute._id as never, text: noteText.trim() });
      setNoteText("");
      toast.success("Note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add note");
    }
  };

  const runResolve = async (resolution: string) => {
    if (!resolveAction) return;
    try {
      await resolve({
        disputeId: resolveAction.id as never,
        outcome: resolveAction.outcome,
        resolution,
      });
      toast.success(resolveAction.outcome === "refund_buyer" ? "Dispute resolved — buyer refunded" : "Dispute rejected");
      setOpenId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resolution failed");
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dispute Management"
        description="Review marketplace disputes, gather evidence, and resolve with refunds or rejection. Every resolution is audited."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCardLike label="Open" value={counts.open} tone="text-red-600" />
        <StatCardLike label="Under review" value={counts.underReview} tone="text-amber-600" />
        <StatCardLike label="Resolved" value={counts.resolved} tone="text-green-600" />
      </div>

      {disputes === undefined ? (
        <AdminSkeleton rows={4} />
      ) : disputes.length === 0 ? (
        <AdminEmpty message="No disputes filed." hint="Disputes appear when buyers contest a marketplace order." />
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <Card key={d._id} className="rounded-xl border-slate-200 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-900 dark:text-white" title={d.reason}>
                    {d.reason}
                  </p>
                  <StatusBadge status={d.status} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 sm:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dispute</p>
                    <p className="mt-1 truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-200">#{d._id.slice(-8)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Order</p>
                    <p className="mt-1 truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                      {orderMap.get(d.orderId)?._id.slice(-8) ?? d.orderId.slice(-8)}
                    </p>
                    <p className="text-[11px] text-slate-500">{orderMap.get(d.orderId)?.totalPoints ?? "—"} pts</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</p>
                    <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">{fmtDate(d.createdAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Priority</p>
                    <div className="mt-1">
                      <select
                        aria-label="Dispute priority"
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                        value={d.priority ?? ""}
                        onChange={async (e) => {
                          const v = e.target.value as "low" | "medium" | "high" | "critical" | "";
                          if (!v) return;
                          try {
                            await setPriority({ disputeId: d._id as never, priority: v });
                            toast.success("Priority updated");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        <option value="" disabled>Set priority</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <Button
                    size="sm"
                    className="h-9 w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                    onClick={() => setOpenId(d._id)}
                  >
                    Review dispute
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dispute && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Dispute review" onClick={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dispute review</h2>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{dispute._id}</p>
              </div>
              <StatusBadge status={dispute.status} />
            </div>

            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Reason</p>
                <p className="mt-1 text-slate-900 dark:text-white">{dispute.reason}</p>
              </div>
              {relatedOrder && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Order</p>
                    <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">{relatedOrder._id}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Points</p>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{relatedOrder.totalPoints}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Order status</p>
                    <div className="mt-1"><StatusBadge status={relatedOrder.status} /></div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Created</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{fmtDate(relatedOrder.createdAt)}</p>
                  </div>
                </div>
              )}
            </div>

            {dispute.status === "open" && (
              <Button
                className="mt-4"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await markReview({ disputeId: dispute._id as never });
                    toast.success("Marked under review");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                }}
              >
                <Plus className="mr-1 h-3 w-3" /> Mark under review
              </Button>
            )}

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Internal notes</h3>
              {(dispute.notes ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No internal notes yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {dispute.notes!.map((n, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <p className="text-slate-900 dark:text-white">{n.text}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{n.authorEmail ?? "Admin"} · {fmtDate(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
              {dispute.status !== "resolved" && (
                <div className="mt-3 flex gap-2">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add an internal note (evidence, findings…)"
                    aria-label="Internal note"
                    rows={2}
                  />
                  <Button size="sm" onClick={submitNote} disabled={noteText.trim().length < 2}>Add</Button>
                </div>
              )}
            </div>

            {dispute.status === "resolved" ? (
              <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
                <p className="font-medium">Resolution</p>
                <p className="mt-1">{dispute.resolution}</p>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <Button
                  className="bg-green-600 text-white hover:bg-green-700"
                  onClick={() => setResolveAction({ id: dispute._id, outcome: "refund_buyer" })}
                >
                  Resolve — refund buyer
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => setResolveAction({ id: dispute._id, outcome: "reject" })}
                >
                  Resolve — reject dispute
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {resolveAction && (
        <ConfirmDialog
          open
          onClose={() => setResolveAction(null)}
          onConfirm={runResolve}
          title={resolveAction.outcome === "refund_buyer" ? "Refund buyer and resolve dispute" : "Reject dispute"}
          description={
            resolveAction.outcome === "refund_buyer"
              ? "Points move from the vendor to the buyer through the ledger. The order is marked refunded and the decision is audited."
              : "The order proceeds to completed status. The buyer is not refunded. The decision is audited."
          }
          actionLabel={resolveAction.outcome === "refund_buyer" ? "Refund & resolve" : "Reject"}
          destructive={resolveAction.outcome === "refund_buyer"}
          requireReason
          minReasonLength={10}
        />
      )}
    </div>
  );
}

function StatCardLike({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
      <CardContent className="flex items-center gap-3 p-4">
        <Gavel className={`h-5 w-5 ${tone}`} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
