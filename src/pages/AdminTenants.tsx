import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Landmark, Lock, Unlock } from "lucide-react";

export default function AdminTenants() {
  const tenants = useQuery(api.tenants.adminList, {});
  const lockdown = useMutation(api.tenants.adminLockdown);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Tenant Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monitor and moderate tenant sites.</p>
      </div>

      <div className="space-y-3">
        {!tenants ? (
          <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading tenants...</p>
        ) : tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No tenants.</p>
        ) : (
          tenants.map((t) => (
            <Card key={t._id} className="notebook-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50">
                  <Landmark className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--nb-ink)]">{t.siteName}</p>
                  <p className="text-xs text-muted-foreground">{t.subdomain}.cloudie.app • {t.siteType}</p>
                </div>
                <Badge variant={t.isActive ? "default" : "destructive"}>{t.isActive ? "Active" : "Locked"}</Badge>
                {t.isActive && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const reason = prompt("Lockdown reason:");
                    if (reason) { await lockdown({ tenantId: t._id as any, reason }); toast.success("Site locked down"); }
                  }}>
                    <Lock className="h-3 w-3 mr-1" /> Lock
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
