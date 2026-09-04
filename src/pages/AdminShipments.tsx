import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Truck } from "lucide-react";

export default function AdminShipments() {
  const shipments = useQuery(api.shipments.adminList, {});
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Truck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Shipment Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">View all platform shipments.</p>
        </div>
      </div>
      <div className="space-y-3">
        {!shipments ? <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading...</p> : shipments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No shipments.</p>
        ) : shipments.map((s) => (
          <Card key={s._id} className="notebook-card"><CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm font-medium text-[var(--nb-ink)]">{s.trackingNumber}</p><p className="text-xs text-muted-foreground">{s.senderName} → {s.recipientName}</p></div>
            <span className="text-xs font-medium capitalize px-2 py-1 rounded-full bg-muted">{s.status.replace(/_/g, " ")}</span>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
