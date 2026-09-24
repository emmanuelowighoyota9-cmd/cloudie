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
import { Download, Plus, Search } from "lucide-react";
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

      {results === undefined ? (
        <AdminSkeleton rows={6} />
      ) : results.page.length === 0 ? (
        <AdminEmpty
          message="No shipments found"
          hint="Create your first shipment or adjust the filters."
        />
      ) : (
        <div className="space-y-3">
          {results.page.map((s) => (
            <Card
              key={s._id}
              role="button"
              tabIndex={0}
              className="rounded-xl border-slate-200 shadow-sm transition-all hover:shadow-md active:scale-[0.99] dark:border-slate-700"
              onClick={() => navigate(`/admin/shipments/${s._id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/admin/shipments/${s._id}`);
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                      {s.trackingNumber}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-white">{s.senderName}</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="font-medium text-slate-900 dark:text-white">{s.recipientName}</span>
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${statusBadgeClass(s.status)}`}
                  >
                    {statusLabel(s.status)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Route</p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                      {[s.senderCity ?? "—", s.recipientCity ?? "—"].join(" → ")}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {[s.recipientCity, s.recipientCountry].filter(Boolean).join(", ") || "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Service</p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                      {s.serviceTypeName ?? "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {s.status === "DELIVERED" && s.deliveredAt ? "Delivered" : "ETA"}
                    </p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                      {s.status === "DELIVERED" && s.deliveredAt
                        ? fmtDate(s.deliveredAt)
                        : s.estimatedDelivery
                          ? fmtDate(s.estimatedDelivery)
                          : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${s.progress}%` }}
                    />
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-900 px-2 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
                    {s.progress}%
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400">{fmtDate(s.createdAt)}</span>
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">View details →</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Showing {results?.page.length ?? 0} shipments ·{" "}
        <Link to="/tracking" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Open public tracking page
        </Link>
      </p>
    </div>
  );
}
