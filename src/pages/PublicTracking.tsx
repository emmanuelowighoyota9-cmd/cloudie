import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cloud, Clock, MapPin, Package, PackageSearch, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";
import { RouteViz } from "@/components/tracking/RouteViz";
import { QrCodeSvg } from "@/components/tracking/Codes";
import { statusBadgeClass, statusLabel } from "@/lib/trackingUi";

function TrackingSearch() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10">
          <PackageSearch className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Track your shipment
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter a tracking number (e.g. TRK-XXXXXXXXXXXX) to see live status, route and timeline.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const tn = String(data.get("tn") ?? "").trim();
          if (tn) window.location.href = `/tracking/${encodeURIComponent(tn)}`;
        }}
      >
        <Input name="tn" placeholder="Tracking number" className="h-11 flex-1" autoFocus required />
        <Button type="submit" size="lg" className="h-11">
          Track
        </Button>
      </form>
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Only intentionally public information is shown — no personal addresses or contact details.
      </div>
    </div>
  );
}

export default function PublicTracking() {
  const { trackingNumber } = useParams<{ trackingNumber: string }>();
  const tracking = useQuery(
    api.trackingQueries.publicTracking,
    trackingNumber ? { trackingNumber } : "skip",
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">Cloudie Tracking</span>
          </Link>
          <Link to="/tracking" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            Track another parcel
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {!trackingNumber ? (
          <TrackingSearch />
        ) : tracking === undefined ? (
          <Card className="rounded-xl border-slate-200 dark:border-slate-800">
            <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
              <Package className="h-4 w-4 animate-pulse" /> Loading tracking data…
            </CardContent>
          </Card>
        ) : !tracking ? (
          <Card className="rounded-xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                Shipment not found
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Check the tracking number and try again. It looks like TRK-XXXXXXXXXXXX.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/tracking">Try another number</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* Status hero */}
            <Card className="rounded-xl border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-slate-400">{tracking.trackingNumber}</p>
                    <span
                      className={`mt-1.5 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(tracking.status)}`}
                    >
                      {statusLabel(tracking.status)}
                    </span>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />
                      {tracking.actualDelivery
                        ? `Delivered ${new Date(tracking.actualDelivery).toLocaleDateString()}`
                        : tracking.estimatedDelivery
                          ? `Est. delivery ${new Date(tracking.estimatedDelivery).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
                          : "ETA pending"}
                    </p>
                    {tracking.carrierName && <p className="mt-0.5">Carrier: {tracking.carrierName}</p>}
                    {tracking.serviceName && <p className="mt-0.5">Service: {tracking.serviceName}</p>}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Progress</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{tracking.progress}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${tracking.progress}%` }}
                    />
                  </div>
                </div>
                {tracking.packageDescription && (
                  <p className="mt-3 text-xs text-slate-500">
                    Contents: <span className="font-medium text-slate-700 dark:text-slate-200">{tracking.packageDescription}</span>
                    {tracking.totalWeight ? ` · ${tracking.totalWeight} ${tracking.weightUnit}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Route + current location */}
            <Card className="rounded-xl border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Route</p>
                {tracking.currentLocation && (
                  <p className="mb-3 flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                    <MapPin className="h-4 w-4 text-indigo-500" />
                    Current location:{" "}
                    <span className="font-semibold">
                      {tracking.currentLocation.city
                        ? `${tracking.currentLocation.city}, ${tracking.currentLocation.country}`
                        : tracking.currentLocation.label}
                    </span>
                  </p>
                )}
                <RouteViz
                  origin={tracking.origin ? [tracking.origin.city, tracking.origin.country].filter(Boolean).join(", ") : null}
                  destination={
                    tracking.destination
                      ? [tracking.destination.city, tracking.destination.country].filter(Boolean).join(", ")
                      : tracking.destinationCity && tracking.destinationCountry
                        ? `${tracking.destinationCity}, ${tracking.destinationCountry}`
                        : null
                  }
                  currentLabel={
                    tracking.currentLocation
                      ? tracking.currentLocation.city
                        ? `${tracking.currentLocation.city}, ${tracking.currentLocation.country}`
                        : tracking.currentLocation.label
                      : null
                  }
                  stops={tracking.route}
                />
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="rounded-xl border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Timeline</p>
                {tracking.events.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">No events recorded yet.</p>
                ) : (
                  <div className="relative ml-3 space-y-5 border-l-2 border-slate-200 pl-6 dark:border-slate-800">
                    {tracking.events.map((e, i) => (
                      <div key={i} className="relative">
                        <div
                          className={`absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                            i === 0
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
                <QrCodeSvg value={`/tracking/${tracking.trackingNumber}`} size={88} />
                <div className="text-xs text-slate-500">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Share this tracking page</p>
                  <p className="mt-1">Scan the QR code to open this shipment's public tracking page on any device.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
