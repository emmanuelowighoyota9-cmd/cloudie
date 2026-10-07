import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, BriefcaseBusiness, FileText, Mail, Package, Palette, ShoppingBag, Sparkles } from "lucide-react";

const catalog = [
  { key: "business", name: "Business Suite", category: "Business", icon: BriefcaseBusiness, path: "/business", description: "Websites, banking, investment and business operations." },
  { key: "shipments", name: "Shipments", category: "Logistics", icon: Package, path: "/shipments", description: "Create, track and manage your deliveries." },
  { key: "documents", name: "Document Studio", category: "Documents", icon: FileText, path: "/documents", description: "Templates, documents and professional exports." },
  { key: "email", name: "Email", category: "Communication", icon: Mail, path: "/services/email", description: "Campaigns, templates and delivery history." },
  { key: "render", name: "Render Studio", category: "Creative", icon: Palette, path: "/services/render", description: "Create and manage image renders." },
  { key: "marketplace", name: "Marketplace", category: "Commerce", icon: ShoppingBag, path: "/marketplace", description: "Digital products, numbers and social services." },
];

export default function MyServices() {
  const services = useQuery(api.serviceHub.listMyServices, { limit: 50 });

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cloudie</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">My Services</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Everything you have activated or use regularly, managed from one account.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/marketplace">Discover services <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>

      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-card">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">One account, one service center</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cloudie services share your wallet, notifications and account security while each workspace keeps its own workflow.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {services === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <Card key={item} className="h-40 animate-pulse bg-muted/40" />)}
        </div>
      ) : services.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active & recent</h2>
            <span className="text-xs text-muted-foreground">{services.length} service record{services.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => {
              const item = catalog.find((entry) => entry.key === service.serviceKey);
              const Icon = item?.icon ?? Sparkles;
              return (
                <Link key={service._id} to={item?.path ?? "/dashboard"} className="group">
                  <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="outline" className="capitalize">{service.status}</Badge>
                      </div>
                      <h3 className="mt-5 font-semibold text-foreground">{service.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{service.resourceLabel ?? service.planLabel ?? item?.description}</p>
                      {service.usageLabel && <p className="mt-4 text-xs font-medium text-primary">{service.usageLabel}</p>}
                      <div className="mt-5 flex items-center text-xs font-semibold text-muted-foreground group-hover:text-primary">
                        Manage service <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cloudie workspaces</h2>
          <p className="mt-1 text-xs text-muted-foreground">Open a workspace even if you have not activated a service record yet.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} to={item.path}>
                <Card className="h-full transition-colors hover:border-primary/30 hover:bg-primary/[0.025]">
                  <CardContent className="flex gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
