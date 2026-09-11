import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, StatCard, AdminSkeleton } from "@/components/admin/shared";

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export default function AdminAnalytics() {
  const [days, setDays] = useState<1 | 7 | 30 | 90>(30);
  const data = useQuery(api.adminApi.getAnalyticsRange, { days });

  const buckets = data?.buckets ?? [];
  const maxVal = Math.max(1, ...buckets.map((b) => Math.max(b.minted, b.burned)));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Analytics"
        description="Server-side aggregation over points, users, shipments, documents, and orders."
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <Button
                key={r.days}
                size="sm"
                variant={days === r.days ? "default" : "ghost"}
                className={`h-7 px-3 text-xs ${days === r.days ? "bg-blue-600 text-white hover:bg-blue-700" : "text-slate-600 dark:text-slate-300"}`}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        }
      />

      {data === undefined ? (
        <AdminSkeleton rows={6} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Points minted" value={data.totals.minted} icon={BarChart3} color="green" />
            <StatCard title="Points burned" value={data.totals.burned} icon={BarChart3} color="red" />
            <StatCard title="New users" value={data.totals.newUsers} icon={BarChart3} color="blue" />
            <StatCard title="Active tenants" value={data.totals.activeTenants} icon={BarChart3} color="indigo" />
            <StatCard title="Shipments" value={data.totals.shipments} icon={BarChart3} color="purple" />
            <StatCard title="Documents" value={data.totals.documents} icon={BarChart3} color="blue" />
            <StatCard title="Orders" value={data.totals.orders} icon={BarChart3} color="amber" />
            <StatCard title="Notifications" value={data.totals.notifications} icon={BarChart3} color="green" />
          </div>

          <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Minted</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Burned</span>
              </div>
              {buckets.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No activity in this range.</p>
              ) : (
                <div className="flex h-48 items-end gap-[3px] overflow-x-auto" aria-label="Points minted vs burned over time" role="img">
                  {buckets.map((b, i) => (
                    <div key={i} className="group relative flex h-full min-w-[6px] flex-1 flex-col justify-end gap-[2px]">
                      <div
                        className="w-full rounded-t-sm bg-red-400/80 transition-colors group-hover:bg-red-500"
                        style={{ height: `${(b.burned / maxVal) * 100}%` }}
                      />
                      <div
                        className="w-full rounded-t-sm bg-blue-500/80 transition-colors group-hover:bg-blue-600"
                        style={{ height: `${(b.minted / maxVal) * 100}%` }}
                      />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-white shadow group-hover:block">
                        {b.label}: +{b.minted.toLocaleString()} / −{b.burned.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {buckets.slice(-8).map((b, i) => (
              <Card key={i} className="rounded-xl border-slate-200 p-3 shadow-sm dark:border-slate-700">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{b.label}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Users</p>
                    <p className="font-bold text-slate-900 dark:text-white">{b.users}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Shipments</p>
                    <p className="font-bold text-slate-900 dark:text-white">{b.shipments}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Documents</p>
                    <p className="font-bold text-slate-900 dark:text-white">{b.documents}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Orders</p>
                    <p className="font-bold text-slate-900 dark:text-white">{b.orders}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
