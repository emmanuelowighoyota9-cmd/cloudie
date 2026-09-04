import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

export default function AdminAuditLogs() {
  const logs = useQuery(api.admin.getAuditLogs, { limit: 100 });

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Audit Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Immutable audit trail of platform actions.</p>
        </div>
      </div>

      <Card className="notebook-card">
        <CardContent>
          {!logs ? (
            <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading audit logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No audit logs yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--nb-ink)]/5 transition-colors">
                  <div className="mt-0.5 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-mono">{log.action}</Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--nb-ink)]">
                      <span className="font-medium">{log.resource}</span>
                      {log.resourceId && <span className="text-muted-foreground"> • {log.resourceId}</span>}
                    </p>
                    {log.reason && <p className="text-xs text-muted-foreground mt-0.5">Reason: {log.reason}</p>}
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {log.actorEmail || "System"} • {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
