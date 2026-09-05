import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Building2, Plus, ArrowUpRight, Landmark, TrendingUp } from "lucide-react";
import { Link } from "react-router";

const siteTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  bank: Landmark,
  investment: TrendingUp,
};

export default function BusinessSuite() {
  const sites = useQuery(api.tenants.listMy);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Business Suite</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">White-label tenant portal for banking and investment use cases.</p>
        </div>
        <Link to="/business/sites/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> Create Site</Button>
        </Link>
      </div>

      {sites === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="notebook-card"><CardContent className="p-4 animate-pulse"><div className="h-20 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : sites.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No sites yet</EmptyTitle>
            <EmptyDescription>Create your first white-label tenant site to get started.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/business/sites/new"><Button className="gap-2"><Plus className="h-4 w-4" /> Create Site</Button></Link>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => {
            const Icon = siteTypeIcons[site.siteType] || Building2;
            return (
              <Link key={site._id} to={`/business/sites/${site._id}`}>
                <Card className="notebook-card cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700 h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50">
                        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h3 className="mt-3 font-semibold text-[var(--nb-ink)]">{site.siteName}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{site.subdomain}.cloudie.app</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant={site.isActive ? "default" : "secondary"} className="text-[10px]">
                        {site.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{site.siteType}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
