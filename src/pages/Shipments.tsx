import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Package, Plus, Search, Truck } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  picked_up: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  in_transit: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  out_for_delivery: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
};

export default function Shipments() {
  const shipments = useQuery(api.shipments.list, {});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = (shipments ?? []).filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search && !s.trackingNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Shipments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track and manage your shipments.</p>
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
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="picked_up">Picked Up</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shipment List */}
      {shipments === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="notebook-card">
              <CardContent className="p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-2 w-48 bg-muted rounded" />
                  </div>
                  <div className="h-5 w-20 bg-muted rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No shipments found</EmptyTitle>
            <EmptyDescription>
              {search || filter !== "all"
                ? "Try adjusting your filters."
                : "Create your first shipment to get started. Each shipment costs 100 points."}
            </EmptyDescription>
          </EmptyHeader>
          {!search && filter === "all" && (
            <EmptyContent>
              <Link to="/shipments/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Create Shipment
                </Button>
              </Link>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Link key={s._id} to={`/shipments/${s._id}`}>
              <Card className="notebook-card cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
                      <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--nb-ink)]">{s.trackingNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.recipientName} • {s.recipientCity}, {s.recipientCountry}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={`${statusColors[s.status] ?? ""} border-0 font-medium`}>
                        {s.status.replace(/_/g, " ")}
                      </Badge>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </p>
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
