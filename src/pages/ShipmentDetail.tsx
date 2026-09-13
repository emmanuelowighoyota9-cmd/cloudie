import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, MapPin, Package, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";
import { RouteViz } from "@/components/tracking/RouteViz";
import { QrCodeSvg } from "@/components/tracking/Codes";
import { statusBadgeClass, statusLabel } from "@/lib/trackingUi";

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(
    api.trackingUser.myShipmentDetail,
    id ? { id: id as Id<"trackingShipments"> } : "skip",
  );

  if (detail === undefined) {
    return <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Loading shipment…</div>;
  }
  if (!detail) {
    return (
      <div className="py-12 text-center">
        <Package className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm text-slate-500">Shipment not found or not yours.</p>
        <Link to="/shipments"><Button variant="ghost" className="mt-4 gap-2"><ArrowLeft className="h-4 w-4" /> Back to shipments</Button></Link>
      </div>
    );
  }

  const s = detail.shipment;
  const dest = detail.route.destination
    ? [detail.route.destination.city, detail.route.destination.country].filter(Boolean).join(", ")
    : [s.recipientCity, s.recipientCountry].filter(Boolean).join(", ") || null;
  const origin = detail.route.origin
    ? [detail.route.origin.city, detail.route.origin.country].filter(Boolean).join(", ")
    : [s.senderCity, s.senderCountry].filter(Boolean).join(", ") || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/shipments">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-mono text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {s.trackingNumber}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {s.role === "sender" ? "You are the sender" : "You are the recipient"} · {s.serviceTypeName}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(s.status)}`}>
            {statusLabel(s.status)}
          </span>
        </div>
      </div>

      {/* Status + progress */}
      <Card className="rounded-xl border-slate-200 dark:border-slate-800">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 text-xs text-slate-500">
            <p className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {s.actualDelivery
                ? `Delivered ${new Date(s.actualDelivery).toLocaleString()}`
                : s.estimatedDelivery
                  ? `Est. delivery ${new Date(s.estimatedDelivery).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
                  : "ETA pending"}
            </p>
            <p className="font-semibold text-slate-700 dark:text-slate-200">{s.progress}%</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${s.progress}%` }}
            />
          </div>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-slate-400">Contents</p>
              <p className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">{s.packageDescription}</p>
            </div>
            <div>
              <p className="text-slate-400">Weight</p>
              <p className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
                {s.totalWeight} {s.weightUnit}{s.dimensions ? ` · ${s.dimensions}` : ""}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Parties</p>
              <p className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
                {s.senderName} → {s.recipientName}
              </p>
            </div>
          </div>
        </CardContent>
        </Card>

      {/* Route */}
      <Card className="rounded-xl border-slate-200 dark:border-slate-800">
        <CardContent className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Route</p>
          {detail.route.current && (
            <p className="mb-3 flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
              <MapPin className="h-4 w-4 text-indigo-500" />
              Current location:{" "}
              <span className="font-semibold">
                {detail.route.current.city
                  ? `${detail.route.current.city}, ${detail.route.current.country}`
                  : detail.route.current.name}
              </span>
            </p>
          )}
          <RouteViz
            origin={origin}
            destination={dest}
            currentLabel={
              detail.route.current
                ? detail.route.current.city
                  ? `${detail.route.current.city}, ${detail.route.current.country}`
                  : detail.route.current.name
                : null
            }
            stops={[]}
          />
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="rounded-xl border-slate-200 dark:border-slate-800">
        <CardContent className="p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Timeline</p>
          {detail.events.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No events recorded yet.</p>
          ) : (
            <div className="relative ml-3 space-y-5 border-l-2 border-slate-200 pl-6 dark:border-slate-800">
              {detail.events.map((e) => (
                <div key={e._id} className="relative">
                  <div
                    className={`absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                      e.status === s.status
                        ? "border-blue-600 bg-blue-600"
                        : "border-blue-600 bg-white dark:bg-slate-950"
                    }`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{e.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(e.status)}`}>
                      {statusLabel(e.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{e.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span>{new Date(e.eventTimestamp).toLocaleString()}</span>
                    {e.locationLabel && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {e.locationLabel}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share QR */}
      <Card className="rounded-xl border-slate-200 dark:border-slate-800">
        <CardContent className="flex items-center gap-4 p-5">
          <QrCodeSvg value={`/tracking/${s.trackingNumber}`} size={88} />
          <div className="text-xs text-slate-500">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Share tracking page</p>
            <p className="mt-1">Recipients can follow this shipment on the public tracking page.</p>
            <Link
              to={`/tracking/${s.trackingNumber}`}
              className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Open public tracking view
            </Link>
            <span className="mt-1 block text-slate-400">/tracking/{s.trackingNumber}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
