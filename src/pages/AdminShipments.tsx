import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, ConfirmDialog, downloadCsv, fmtDate } from "@/components/admin/shared";

const STATUSES = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "cancelled"] as const;

export default function AdminShipments() {
  const [searchParams] = useSearchParams();
  const shipments = useQuery(api.shipments.adminList, { limit: 500 });
  const updateStatus = useMutation(api.shipments.updateStatus);

  const [search, setSearch] = useState(searchParams.get("tracking") ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [correcting, setCorrecting] = useState<null | { id: string; tracking: string; next: string }>(null);

  const filtered = useMemo(() => {
    if (!shipments) return undefined;
    let list = [...shipments];
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (x) =>
          x.trackingNumber.toLowerCase().includes(s) ||
          x.senderName.toLowerCase().includes(s) ||
          x.recipientName.toLowerCase().includes(s) ||
          x.recipientCity.toLowerCase().includes(s),
      );
    }
    return list;
  }, [shipments, search, statusFilter]);

  const exportCsv = () => {
    if (!filtered?.length) return;
    downloadCsv(`cloudie-shipments-${new Date().toISOString().split("T")[0]}.csv`, [
      ["Tracking", "Status", "Sender", "Recipient", "Destination", "Service", "Created"],
      ...filtered.map((s) => [s.trackingNumber, s.status, s.senderName, s.recipientName, `${s.recipientCity}, ${s.recipientCountry}`, s.serviceType, fmtDate(s.createdAt)]),
    ]);
  };

  const applyCorrection = async (reason: string) => {
    if (!correcting) return;
    try {
      await updateStatus({
        shipmentId: correcting.id as never,
        status: correcting.next,
        description: `Administrative status correction: ${reason}`,
      });
      toast.success("Status corrected (audited)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Shipment Administration"
        description="Search, filter, and administratively correct shipment statuses."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered?.length} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search tracking #, sender, recipient, city…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered === undefined ? (
        <AdminSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No shipments match." />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const nextStatuses = STATUSES.filter((x) => x !== s.status);
            return (
              <Card key={s._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium text-slate-900 dark:text-white">{s.trackingNumber}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {s.senderName} → {s.recipientName} · {s.recipientCity}, {s.recipientCountry} · {fmtDate(s.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                  <Select
                    value=""
                    onValueChange={(next) => setCorrecting({ id: s._id, tracking: s.trackingNumber, next })}
                  >
                    <SelectTrigger className="h-8 w-36 shrink-0 text-xs" aria-label="Correct status"><SelectValue placeholder="Correct status…" /></SelectTrigger>
                    <SelectContent>
                      {nextStatuses.map((st) => (
                        <SelectItem key={st} value={st}>{st.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {correcting && (
        <ConfirmDialog
          open
          onClose={() => setCorrecting(null)}
          onConfirm={applyCorrection}
          title="Correct shipment status"
          description="Adds an administrative tracking event and updates the shipment status. Recorded in the audit log and the owner is notified."
          resource={correcting.tracking}
          actionLabel="Apply correction"
        />
      )}
    </div>
  );
}
