import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, MapPin, Clock, Hash } from "lucide-react";
import { Link, useParams } from "react-router";

const statusSteps = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const shipment = useQuery(
    api.shipments.get,
    id ? { id: id as Id<"shipments"> } : "skip",
  );
  const events = useQuery(
    api.shipments.getEvents,
    id ? { shipmentId: id as Id<"shipments"> } : "skip",
  );

  if (shipment === undefined) {
    return <div className="py-12 text-center text-muted-foreground animate-pulse">Loading shipment...</div>;
  }
  if (!shipment) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Shipment not found.</p>
        <Link to="/shipments"><Button variant="ghost" className="mt-4 gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
      </div>
    );
  }

  const currentStep = statusSteps.indexOf(shipment.status);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/shipments">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{shipment.trackingNumber}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Shipment details and tracking timeline</p>
        </div>
        <Badge className="border-0">{shipment.status.replace(/_/g, " ")}</Badge>
      </div>

      {/* Progress */}
      <Card className="notebook-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {statusSteps.map((step, i) => (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      i <= currentStep
                        ? "bg-blue-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="mt-1 text-[10px] text-muted-foreground capitalize hidden sm:block">
                    {step.replace(/_/g, " ")}
                  </span>
                </div>
                {i < statusSteps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < currentStep ? "bg-blue-600" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sender & Recipient */}
        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Addresses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Sender</p>
              <p className="text-sm text-[var(--nb-ink)]">{shipment.senderName}</p>
              <p className="text-xs text-muted-foreground">{shipment.senderAddress}, {shipment.senderCity}, {shipment.senderState} {shipment.senderPostalCode}</p>
              <p className="text-xs text-muted-foreground">{shipment.senderCountry}</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Recipient</p>
              <p className="text-sm text-[var(--nb-ink)]">{shipment.recipientName}</p>
              <p className="text-xs text-muted-foreground">{shipment.recipientAddress}, {shipment.recipientCity}, {shipment.recipientState} {shipment.recipientPostalCode}</p>
              <p className="text-xs text-muted-foreground">{shipment.recipientCountry}</p>
            </div>
          </CardContent>
        </Card>

        {/* Package Info */}
        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Package Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Description</span><span className="font-medium text-[var(--nb-ink)]">{shipment.packageDescription}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Weight</span><span className="font-medium text-[var(--nb-ink)]">{shipment.weight} kg</span></div>
            {shipment.dimensions && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Dimensions</span><span className="font-medium text-[var(--nb-ink)]">{shipment.dimensions}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service</span><span className="font-medium text-[var(--nb-ink)] capitalize">{shipment.serviceType}</span></div>
            {shipment.estimatedDelivery && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Est. Delivery</span><span className="font-medium text-[var(--nb-ink)]">{new Date(shipment.estimatedDelivery).toLocaleDateString()}</span></div>}
            {shipment.notes && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Notes</span><span className="font-medium text-[var(--nb-ink)]">{shipment.notes}</span></div>}
          </CardContent>
        </Card>
      </div>

      {/* Events Timeline */}
      <Card className="notebook-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tracking Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {!events ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading events...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No events recorded yet.</p>
          ) : (
            <div className="relative ml-3 border-l-2 border-muted pl-6 space-y-6">
              {events.map((evt) => (
                <div key={evt._id} className="relative">
                  <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-blue-600 bg-white dark:bg-gray-950" />
                  <p className="text-sm font-medium text-[var(--nb-ink)]">{evt.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
  );
}
