import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, CheckCircle } from "lucide-react";

export default function AdminInfrastructure() {
  const infra = useQuery(api.admin.getInfrastructure);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Infrastructure</h1>
          <p className="mt-1 text-sm text-muted-foreground">System health and monitoring.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {infra ? Object.entries(infra.health).map(([key, status]) => (
          <Card key={key} className="notebook-card">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div><p className="text-sm font-medium capitalize text-[var(--nb-ink)]">{key}</p><Badge variant="default" className="text-[10px]">{status}</Badge></div>
            </CardContent>
          </Card>
        )) : (
          <Card className="notebook-card"><CardContent className="p-4 animate-pulse"><div className="h-12 bg-muted rounded" /></CardContent></Card>
        )}
      </div>

      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">System Metrics</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="text-center p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
            <p className="text-2xl font-bold text-[var(--nb-ink)]">{infra?.totalTransactions ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Total Transactions</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
            <p className="text-2xl font-bold text-[var(--nb-ink)]">{infra?.pendingNotifications ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Pending Notifications</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-[var(--nb-bg)] border border-[var(--nb-rule)]">
            <p className="text-2xl font-bold text-[var(--nb-ink)]">{infra?.totalAssets ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Total Assets</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
