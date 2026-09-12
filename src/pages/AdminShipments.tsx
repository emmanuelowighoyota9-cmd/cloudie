import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Plus, Search, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AdminPageHeader,
  AdminEmpty,
  AdminSkeleton,
  downloadCsv,
  fmtDate,
} from "@/components/admin/shared";
import { TRACKING_STATUSES, statusBadgeClass, statusLabel } from "@/lib/trackingUi";

export default function AdminShipments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced.trim()) next.set("q", debounced.trim());
    if (statusFilter !== "all") next.set("status", statusFilter);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, statusFilter]);

  // Search uses the server-side text index; otherwise newest-first pagination.
  const results = useQuery(
    api.trackingQueries.adminListShipments,
    debounced.trim().length >= 2
      ? { paginationOpts: { numItems: 50, cursor: null }, search: debounced.trim() }
      : statusFilter !== "all"
        ? { paginationOpts: { numItems: 200, cursor: null }, status: statusFilter }
        : { paginationOpts: { numItems: 200, cursor: null } },
  );

  const seedDefaults = useMutation(api.tracking.seedTrackingDefaults);
  const [seeding, setSeeding] = useState(false);

  const exportCsv = () => {
    const rows = results?.page ?? [];
    if (rows.length === 0) return;
    downloadCsv(`cloudie-shipments-${new Date().toISOString().split("T")[0]}.csv`, [
      ["Tracking", "Status", "Progress", "Service", "Sender", "Recipient", "Destination", "ETA", "Created"],
      ...rows.map((s) => [
        s.trackingNumber,
        s.status,
        `${s.progress}%`,
        s.serviceTypeName ?? "",
        s.senderName,
        s.recipientName,
        [s.recipientCity, s.recipientCountry].filter(Boolean).join(", "),
        s.estimatedDelivery ? fmtDate(s.estimatedDelivery) : "",
        fmtDate(s.createdAt),
      ]),
    ]);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Shipments"
        description="Create, manage and track every shipment in the native tracking engine."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!results?.page.length}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  const r = await seedDefaults({});
                  toast.success(`Reference data ready (${r.seeded} added)`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Seeding failed");
                } finally {
                  setSeeding(false);
                }
              }}
            >
              Seed carriers & services
            </Button>
            <Button size="sm" onClick={() => navigate("/admin/shipments/create")}>
              <Plus className="mr-1.5 h-4 w-4" /> New shipment
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tracking number…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All statuses</SelectItem>
            {TRACKING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardContent className="p-0">
          {results === undefined ? (
            <div className="p-4">
              <AdminSkeleton rows={6} />
            </div>
          ) : results.page.length === 0 ? (
            <div className="p-6">
              <AdminEmpty
                message="No shipments found"
                hint="Create your first shipment or adjust the filters."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 dark:border-slate-700">
                    <th className="px-4 py-3 font-medium">Tracking</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Route</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Service</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">ETA</th>
                    <th className="px-4 py-3 text-right font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {results.page.map((s) => (
                    <tr
                      key={s._id}
                      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      onClick={() => navigate(`/admin/shipments/${s._id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {s.trackingNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {s.senderName} → {s.recipientName}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(s.status)}`}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell">
                        {[s.senderCity ?? "—", s.recipientCity ?? "—"].join(" → ")}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                        {s.serviceTypeName ?? "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 sm:table-cell">
                        {s.status === "DELIVERED" && s.deliveredAt
                          ? `Delivered ${fmtDate(s.deliveredAt)}`
                          : s.estimatedDelivery
                            ? fmtDate(s.estimatedDelivery)
                            : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${s.progress}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs font-medium text-slate-500">
                            {s.progress}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Showing {results?.page.length ?? 0} shipments ·{" "}
        <Link to="/tracking" className="text-blue-600 hover:underline dark:text-blue-400">
          Open public tracking page
        </Link>
      </p>
    </div>
  );
}
