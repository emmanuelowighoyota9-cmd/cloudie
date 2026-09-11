import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, CircleDashed, Database, HardDrive, KeyRound, Mail, Bell } from "lucide-react";
import { AdminPageHeader, AdminSkeleton, StatCard, fmtDate } from "@/components/admin/shared";

type Infra = {
  totalTransactions: number;
  pendingNotifications: number;
  totalAssets: number;
  health: { database: string; storage: string; auth: string };
};

function HealthRow({ label, status, icon: Icon }: { label: string; status: string; icon: React.ComponentType<{ className?: string }> }) {
  const healthy = status === "healthy";
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${healthy ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"}`}>
        {healthy ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
        {status}
      </span>
    </div>
  );
}

export default function AdminInfrastructure() {
  const infra = useQuery(api.admin.getInfrastructure) as Infra | undefined;
  const dashboard = useQuery(api.adminApi.adminDashboard);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="System Health"
        description="Runtime status of core platform services and live operational counters."
      />

      {infra === undefined ? (
        <AdminSkeleton rows={6} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HealthRow label="Database (Convex)" status={infra.health.database} icon={Database} />
            <HealthRow label="Storage (assets)" status={infra.health.storage} icon={HardDrive} />
            <HealthRow label="Authentication" status={infra.health.auth} icon={KeyRound} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Ledger entries" value={infra.totalTransactions} icon={Activity} color="blue" hint="Immutable records" />
            <StatCard title="Unread notifications" value={infra.pendingNotifications} icon={Bell} color="amber" hint="Across all users" />
            <StatCard title="Stored assets" value={infra.totalAssets} icon={HardDrive} color="indigo" />
            <StatCard
              title="Pending KYC"
              value={dashboard?.kyc.pending}
              icon={Mail}
              color="red"
              hint="Awaiting review"
            />
          </div>

          <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-900 dark:text-white">Operational notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>• Convex hosts the database, auth, and background scheduling — component health above reflects live query availability.</p>
              <p>• Ledger entries are append-only; transaction count grows monotonically.</p>
              <p>• Failed job retries are available from each job's owning workspace; this view surfaces counters, not raw job data.</p>
              <p className="text-xs text-slate-400">Last refreshed: {fmtDate(Date.now())}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
