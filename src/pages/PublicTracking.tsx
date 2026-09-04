import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, Clock, MapPin, Package } from "lucide-react";
import { useParams } from "react-router";

const statusSteps = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];

export default function PublicTracking() {
  const { trackingNumber } = useParams<{ trackingNumber: string }>();
  const tracking = useQuery(
    api.shipments.publicTracking,
    trackingNumber ? { trackingNumber } : "skip",
  );

  return (
    <div className="min-h-screen bg-[var(--nb-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--nb-rule)] bg-[var(--nb-surface)]">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-bold text-[var(--nb-ink)]">Cloudie Tracking</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-bold text-[var(--nb-ink)] mb-6">Track Shipment</h1>

        {tracking === undefined ? (
          <Card className="notebook-card"><CardContent className="p-6 text-center text-muted-foreground animate-pulse">Loading...</CardContent></Card>
        ) : !tracking ? (
          <Card className="notebook-card">
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">Shipment not found. Please check your tracking number.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="notebook-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{tracking.trackingNumber}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Service: {tracking.serviceType}</p>
                  </div>
                  <Badge className="border-0 capitalize">{tracking.status.replace(/_/g, " ")}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  {statusSteps.map((step, i) => {
                    const currentIdx = statusSteps.indexOf(tracking.status);
                    return (
                      <div key={step} className="flex flex-1 items-center">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${i <= currentIdx ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                            {i + 1}
                          </div>
                          <span className="mt-1 text-[9px] text-muted-foreground capitalize hidden sm:block">{step.replace(/_/g, " ")}</span>
                        </div>
                        {i < statusSteps.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1.5 ${i < currentIdx ? "bg-blue-600" : "bg-muted"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {tracking.estimatedDelivery && (
              <p className="text-sm text-muted-foreground text-center">
                Estimated delivery: <span className="font-medium text-[var(--nb-ink)]">{new Date(tracking.estimatedDelivery).toLocaleDateString()}</span>
              </p>
            )}

            <Card className="notebook-card">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {tracking.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No events recorded yet.</p>
                ) : (
                  <div className="relative ml-3 border-l-2 border-muted pl-6 space-y-5">
                    {tracking.events.map((evt) => (
                      <div key={evt._id} className="relative">
                        <div className="absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white dark:bg-gray-950" />
                        <p className="text-sm font-medium text-[var(--nb-ink)]">{evt.description}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(evt.timestamp).toLocaleString()}</span>
                          {evt.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{evt.location}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
