import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Package, Plus, Search, Truck } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import { statusBadgeClass, statusLabel } from "@/lib/trackingUi";

export default function Shipments() {
  const shipments = useQuery(api.trackingUser.myShipments, {});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = (shipments ?? []).filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search && !s.trackingNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Tracking details reflect records entered into this workspace. Confirm carrier custody, delivery status, and shipment charges directly with the carrier.</div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Shipments</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track and manage your shipments.</p>
        </div>
        <Link to="/shipments/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New Shipment
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by tracking number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="CREATED">Created</SelectItem>
            <SelectItem value="BOOKED">Booked</SelectItem>
            <SelectItem value="PICKED_UP">Picked Up</SelectItem>
            <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
            <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="EXCEPTION">Exception</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shipment List */}
      {shipments === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4 animate-pulse"><div className="flex items-center gap-4"><div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-700" /><div className="flex-1 space-y-2"><div className="h-3 w-32 bg-slate-100 dark:bg-slate-700 rounded" /><div className="h-2 w-48 bg-slate-100 dark:bg-slate-700 rounded" /></div><div className="h-5 w-20 bg-slate-100 dark:bg-slate-700 rounded-full" /></div></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>No shipments found</EmptyTitle>
                <EmptyDescription>
                  {search || filter !== "all"
                    ? "Try adjusting your search or filter."
                    : "Create your first shipment to start tracking it in real time."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link to="/shipments/new">
                  <Button className="gap-2"><Plus className="h-4 w-4" /> New Shipment</Button>
                </Link>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Link key={s._id} to={`/shipments/${s._id}`} className="block">
              <Card className="group transition-all hover:border-blue-300 hover:shadow-md dark:hover:border-blue-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                      <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{s.trackingNumber}</p>
                        <Badge className={`border-0 px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(s.status)}`}>
                          {statusLabel(s.status)}
                        </Badge>
                        {s.role === "recipient" && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">
                            Incoming
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {s.senderName} → {s.recipientName}
                        {s.recipientCity ? ` · ${s.recipientCity}, ${s.recipientCountry}` : ""}
                        {` · ${s.serviceTypeName}`}
                      </p>
                    </div>
                    <div className="hidden w-32 sm:block">
                      <div className="flex items-center justify-end text-[10px] text-slate-400">
                        {s.deliveredAt
                          ? `Delivered`
                          : s.estimatedDelivery
                            ? `ETA ${new Date(s.estimatedDelivery).toLocaleDateString()}`
                            : ""}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-500"
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
