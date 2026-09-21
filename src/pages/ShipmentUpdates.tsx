import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Map,
  Calendar,
  Weight,
  Ruler,
  Copy,
  ExternalLink,
  Pencil,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { RouteViz } from "@/components/tracking/RouteViz";
import { QrCodeSvg, BarcodeSvg } from "@/components/tracking/Codes";
import { ShipmentReceipt } from "@/components/tracking/ShipmentReceipt";
import type { ReceiptShipment } from "@/components/tracking/ShipmentReceipt";
import { statusBadgeClass, statusLabel, trackingUrl } from "@/lib/trackingUi";

const STAGE_MAP: Record<string, number> = {
  CREATED: 0,
  BOOKED: 1,
  PICKED_UP: 2,
  PROCESSING: 2,
  AT_ORIGIN_FACILITY: 2,
  DEPARTED_ORIGIN: 3,
  IN_TRANSIT: 3,
  ARRIVED_DESTINATION_COUNTRY: 4,
  CUSTOMS_CLEARANCE: 4,
  CUSTOMS_CLEARED: 4,
  AT_DESTINATION_FACILITY: 5,
  OUT_FOR_DELIVERY: 6,
  DELIVERY_ATTEMPTED: 6,
  DELIVERED: 7,
  EXCEPTION: -1,
  ON_HOLD: -1,
  CANCELLED: -1,
  RETURNED: -1,
};

const STAGES = [
  { label: "Created", icon: Package },
  { label: "Booked", icon: FileText },
  { label: "Picked Up", icon: Truck },
  { label: "In Transit", icon: Map },
  { label: "Customs", icon: AlertTriangle },
  { label: "Arrived", icon: MapPin },
  { label: "Out for Delivery", icon: Truck },
  { label: "Delivered", icon: CheckCircle2 },
];

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ShipmentUpdates() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(
    api.trackingUser.myShipmentDetail,
    id ? { id: id as Id<"trackingShipments"> } : "skip",
  );
  const [showReceipt, setShowReceipt] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-16 text-center">
        <Package className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">Shipment not found or not yours.</p>
        <Link to="/shipments"><Button variant="ghost" className="mt-4 gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
      </div>
    );
  }

  const s = detail.shipment;
  const currentStage = STAGE_MAP[s.status] ?? 0;
  const isException = currentStage < 0;
  const isDelivered = s.status === "DELIVERED";

  const origin = detail.route.origin
    ? [detail.route.origin.city, detail.route.origin.country].filter(Boolean).join(", ")
    : [s.senderCity, s.senderCountry].filter(Boolean).join(", ") || null;
  const destination = detail.route.destination
    ? [detail.route.destination.city, detail.route.destination.country].filter(Boolean).join(", ")
    : [s.recipientCity, s.recipientCountry].filter(Boolean).join(", ") || null;

  const visibleEvents = showAllEvents ? detail.events : detail.events.slice(0, 5);

  // Group events by date
  const groupedEvents: { date: string; events: typeof detail.events }[] = [];
  for (const evt of visibleEvents) {
    const dateStr = fmtDate(evt.eventTimestamp);
    const last = groupedEvents[groupedEvents.length - 1];
    if (last && last.date === dateStr) {
      last.events.push(evt);
    } else {
      groupedEvents.push({ date: dateStr, events: [evt] });
    }
  }

  const today = fmtDate(Date.now());

  const receiptData: ReceiptShipment = {
    trackingNumber: s.trackingNumber,
    serviceTypeName: s.serviceTypeName,
    senderName: s.senderName,
    senderAddress: "",
    senderCity: s.senderCity ?? "",
    senderState: "",
    senderCountry: s.senderCountry ?? "",
    senderPostalCode: "",
    senderEmail: "",
    senderPhone: "",
    recipientName: s.recipientName,
    recipientAddress: "",
    recipientCity: s.recipientCity ?? "",
    recipientState: "",
    recipientCountry: s.recipientCountry ?? "",
    recipientPostalCode: "",
    recipientEmail: "",
    recipientPhone: "",
    packageDescription: s.packageDescription ?? "",
    totalWeight: s.totalWeight,
    weightUnit: s.weightUnit,
    dimensions: s.dimensions,
    createdAt: s.createdAt,
    estimatedDelivery: s.estimatedDelivery,
    status: s.status,
    progress: s.progress,
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-4"
      >
        <Link to="/shipments">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">{s.trackingNumber}</h1>
            <Badge className={`border-0 px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(s.status)}`}>
              {statusLabel(s.status)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.serviceTypeName} · {s.role === "sender" ? "You are the sender" : "You are the recipient"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(s.trackingNumber); toast.success("Tracking number copied"); }}>
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
        </Button>
        {s.role === "sender" && s.status !== "DELIVERED" && s.status !== "CANCELLED" && (
          <Link to={`/shipments/${id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Update</Button>
          </Link>
        )}
        {s.role === "sender" && s.status !== "DELIVERED" && s.status !== "CANCELLED" && (
          <Link to={`/shipments/${id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Update</Button>
          </Link>
        )}
        <Link to={`/tracking/${s.trackingNumber}`} target="_blank">
          <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Public View</Button>
        </Link>
      </motion.div>

      {/* Status hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-border overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <p className="text-2xl font-black text-foreground">{s.progress}%</p>
                <p className="text-sm text-muted-foreground mt-0.5">
      {isDelivered ? "Delivered" : isException ? "Exception — see details" : "Estimated progress"}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />
                  {s.estimatedDelivery ? `ETA ${fmtDate(s.estimatedDelivery)}` : "ETA pending"}
                </div>
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${isDelivered ? "bg-emerald-600" : isException ? "bg-red-500" : "bg-primary"}`}
                initial={{ width: 0 }}
                animate={{ width: `${s.progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Milestone stepper */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Journey</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="flex items-start gap-0 min-w-[640px] px-2">
              {STAGES.map((stage, i) => {
                const reached = !isException && i <= currentStage;
                const isCurrent = i === currentStage && !isException;
                const Icon = stage.icon;
                return (
                  <div key={stage.label} className="flex flex-col items-center flex-1 relative">
                    {/* Connector */}
                    {i > 0 && (
                      <div className={`absolute top-3.5 right-1/2 h-0.5 w-full ${reached ? "bg-primary" : "bg-muted"}`} />
                    )}
                    {/* Dot */}
                    <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                      isCurrent ? "border-primary bg-primary text-primary-foreground scale-110" :
                      reached ? "border-primary bg-primary text-primary-foreground" :
                      "border-muted-foreground/30 bg-background text-muted-foreground"
                    }`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <p className={`mt-2 text-[10px] text-center font-medium leading-tight ${
                      isCurrent ? "text-primary font-bold" : reached ? "text-foreground" : "text-muted-foreground"
                    }`}>{stage.label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column: Route + Timeline */}
        <div className="space-y-6 lg:col-span-3">
          {/* Route */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Route</CardTitle>
              </CardHeader>
              <CardContent>
                <RouteViz
                  origin={origin}
                  destination={destination}
                  currentLabel={
                    detail.route.current
                      ? detail.route.current.city ? `${detail.route.current.city}, ${detail.route.current.country}` : detail.route.current.name
                      : null
                  }
                  stops={detail.route.stops}
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Timeline */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tracking History</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.events.length === 0 ? (
                  <div className="py-8 text-center">
                    <Clock className="mx-auto h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-3 text-sm text-muted-foreground">No events recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedEvents.map((group) => (
                      <div key={group.date}>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${group.date === today ? "text-primary" : "text-muted-foreground"}`}>
                          {group.date === today ? "Today" : group.date === fmtDate(Date.now() - 86400000) ? "Yesterday" : group.date}
                        </p>
                        <div className="relative ml-3 space-y-5 border-l-2 border-border pl-6">
                          {group.events.map((e) => (
                            <div key={e._id} className="relative">
                              <div className={`absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                                e.status === s.status ? "border-primary bg-primary" : "border-primary bg-background"
                              }`} />
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{e.title}</p>
                                <Badge className={`border-0 px-2 py-0 text-[10px] font-medium ${statusBadgeClass(e.status)}`}>
                                  {statusLabel(e.status)}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                <span>{fmtTime(e.eventTimestamp)}</span>
                                {e.locationLabel && (
                                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.locationLabel}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {detail.events.length > 5 && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllEvents(!showAllEvents)}>
                        {showAllEvents ? "Show less" : `Show all ${detail.events.length} events`}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right column: Details + QR + Receipt */}
        <div className="space-y-6 lg:col-span-2">
          {/* Details */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Shipment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
          ["Carrier", "Not assigned"],
          ["Service", s.serviceTypeName ?? "—"],
                  ["Contents", s.packageDescription],
                  ["Weight", `${s.totalWeight} ${s.weightUnit}`],
                  [s.dimensions && "Dimensions", s.dimensions],
        
                  ["Created", fmtDate(s.createdAt)],
                ].filter(([k]) => !!k).map(([label, value]) => (
                  <div key={label as string} className="flex justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{label as string}</span>
                    <span className="text-right font-medium text-foreground">{value as string}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* QR / Barcode */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tracking Codes</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-around py-4">
                <div className="text-center">
                  <BarcodeSvg value={s.trackingNumber} height={48} moduleWidth={1.5} />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Barcode</p>
                </div>
                <div className="text-center">
                  <QrCodeSvg value={trackingUrl(s.trackingNumber)} size={80} />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">QR Code</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Receipt */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receipt</CardTitle>
              </CardHeader>
              <CardContent>
                {!showReceipt ? (
                  <Button variant="outline" className="w-full gap-2" onClick={() => setShowReceipt(true)}>
                    <FileText className="h-4 w-4" /> Generate Receipt
                  </Button>
                ) : (
                  <ShipmentReceipt shipment={receiptData} />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
