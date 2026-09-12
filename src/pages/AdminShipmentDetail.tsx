import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Clock, MapPin, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  AdminPageHeader,
  AdminSkeleton,
  ConfirmDialog,
  fmtDate,
} from "@/components/admin/shared";
import { RouteViz } from "@/components/tracking/RouteViz";
import { ShippingLabel } from "@/components/tracking/ShippingLabel";
import { QrCodeSvg, BarcodeSvg } from "@/components/tracking/Codes";
import { TRACKING_STATUSES, statusBadgeClass, statusLabel } from "@/lib/trackingUi";

export default function AdminShipmentDetail() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const navigate = useNavigate();

  const detail = useQuery(
    api.trackingQueries.adminShipmentDetail,
    shipmentId ? { shipmentId: shipmentId as never } : "skip",
  );
  const labelData = useQuery(
    api.trackingQueries.adminLabelData,
    shipmentId ? { shipmentId: shipmentId as never } : "skip",
  );

  const updateStatus = useMutation(api.tracking.adminUpdateStatus);
  const addEvent = useMutation(api.tracking.adminAddEvent);
  const updateShipment = useMutation(api.tracking.adminUpdateShipment);
  const addPackage = useMutation(api.tracking.adminAddPackage);
  const addRouteStop = useMutation(api.tracking.adminAddRouteStop);
  const updateRouteStop = useMutation(api.tracking.adminUpdateRouteStop);
  const deleteShipment = useMutation(api.tracking.adminDeleteShipment);

  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [eventOpen, setEventOpen] = useState(false);
  const [event, setEvent] = useState({
    status: "IN_TRANSIT",
    title: "",
    description: "",
    locationLabel: "",
    eventTimestamp: "",
    timezone: "",
    latitude: "",
    longitude: "",
    isPublic: true,
    syncShipmentStatus: true,
  });
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkg, setPkg] = useState({ description: "", packageType: "box", weight: "", dimensions: "", quantity: "1" });
  const [stopOpen, setStopOpen] = useState(false);
  const [stopLabel, setStopLabel] = useState("");
  const [editCarrier, setEditCarrier] = useState(false);
  const [carrierId, setCarrierId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [busy, setBusy] = useState(false);

  const carriers = useQuery(api.trackingQueries.listCarriers);

  if (detail === undefined) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Shipment" description="Loading…" />
        <AdminSkeleton rows={8} />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Shipment not found" />
        <Button variant="outline" onClick={() => navigate("/admin/shipments")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to shipments
        </Button>
      </div>
    );
  }

  const s = detail.shipment;

  const applyStatus = async (reason: string) => {
    if (!newStatus) return;
    setBusy(true);
    try {
      await updateStatus({
        shipmentId: s._id,
        status: newStatus,
        description: reason || statusNote || undefined,
      });
      toast.success(`Status updated to ${statusLabel(newStatus)}`);
      setStatusOpen(false);
      setNewStatus("");
      setStatusNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid transition");
    } finally {
      setBusy(false);
    }
  };

  const submitEvent = async () => {
    setBusy(true);
    try {
      const ts = event.eventTimestamp ? new Date(event.eventTimestamp).getTime() : Date.now();
      await addEvent({
        shipmentId: s._id,
        status: event.status,
        title: event.title || "Tracking update",
        description: event.description,
        locationLabel: event.locationLabel || undefined,
        eventTimestamp: isNaN(ts) ? Date.now() : ts,
        timezone: event.timezone || undefined,
        latitude: event.latitude ? Number(event.latitude) : undefined,
        longitude: event.longitude ? Number(event.longitude) : undefined,
        isPublic: event.isPublic,
        syncShipmentStatus: event.syncShipmentStatus,
      });
      toast.success("Tracking event added");
      setEventOpen(false);
      setEvent({
        status: "IN_TRANSIT",
        title: "",
        description: "",
        locationLabel: "",
        eventTimestamp: "",
        timezone: "",
        latitude: "",
        longitude: "",
        isPublic: true,
        syncShipmentStatus: true,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add event");
    } finally {
      setBusy(false);
    }
  };

  const submitPackage = async () => {
    setBusy(true);
    try {
      await addPackage({
        shipmentId: s._id,
        description: pkg.description,
        packageType: pkg.packageType,
        weight: Number(pkg.weight),
        dimensions: pkg.dimensions || undefined,
        quantity: Math.max(1, Number(pkg.quantity) || 1),
      });
      toast.success("Package added with barcode & QR data");
      setPkgOpen(false);
      setPkg({ description: "", packageType: "box", weight: "", dimensions: "", quantity: "1" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add package");
    } finally {
      setBusy(false);
    }
  };

  const submitStop = async () => {
    setBusy(true);
    try {
      await addRouteStop({ shipmentId: s._id, label: stopLabel });
      toast.success("Route stop added");
      setStopOpen(false);
      setStopLabel("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add stop");
    } finally {
      setBusy(false);
    }
  };

  const saveCarrier = async () => {
    setBusy(true);
    try {
      await updateShipment({
        shipmentId: s._id,
        carrierId: carrierId ? (carrierId as never) : undefined,
      });
      toast.success("Carrier assigned");
      setEditCarrier(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign carrier");
    } finally {
      setBusy(false);
    }
  };

  const originLabel = detail.origin ? `${detail.origin.city}, ${detail.origin.country}` : `${s.senderCity}, ${s.senderCountry}`;
  const destinationLabel = detail.destination
    ? `${detail.destination.city}, ${detail.destination.country}`
    : `${s.recipientCity}, ${s.recipientCountry}`;
  const currentLabel = detail.current ? `${detail.current.city}, ${detail.current.country}` : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={s.trackingNumber}
        description={`${s.senderName} → ${s.recipientName} · ${s.serviceTypeName ?? ""}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/shipments")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </Button>
          </>
        }
      />

      {/* Status header */}
      <Card className="rounded-xl border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(s.status)}`}>
                {statusLabel(s.status)}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.progress}% complete</p>
                <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${s.progress}%` }} />
                </div>
              </div>
              <div className="text-xs text-slate-500">
                <p className="flex items-center gap-1"><Clock className="h-3 w-3" /> ETA: {s.estimatedDelivery ? fmtDate(s.estimatedDelivery) : "—"}</p>
                {s.deliveredAt && <p className="mt-0.5">Delivered: {fmtDate(s.deliveredAt)}</p>}
              </div>
            </div>
            <Button size="sm" onClick={() => setStatusOpen(true)}>
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Change status
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: route + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-xl border-slate-200 dark:border-slate-700">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Route</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setStopOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add stop
              </Button>
            </CardHeader>
            <CardContent>
              <RouteViz
                origin={originLabel}
                destination={destinationLabel}
                currentLabel={currentLabel}
                stops={detail.routeStops.map((r) => ({
                  label: r.label,
                  city: r.locationName,
                  country: null,
                  sequence: r.sequence,
                  status: r.status,
                  arrivalAt: r.arrivalAt,
                  departureAt: r.departureAt,
                }))}
              />
              {detail.routeStops.length > 0 && (
                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.routeStops.map((r) => (
                    <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {r.sequence}. {r.label}
                        {r.facilityName ? ` · ${r.facilityName}` : ""}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{r.status}</span>
                        {r.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={async () => {
                              try {
                                await updateRouteStop({ stopId: r._id, status: "arrived", arrivalAt: Date.now() });
                                toast.success("Marked arrived — current location updated");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Failed");
                              }
                            }}
                          >
                            Mark arrived
                          </Button>
                        )}
                        {r.status === "arrived" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={async () => {
                              try {
                                await updateRouteStop({ stopId: r._id, status: "departed", departureAt: Date.now() });
                                toast.success("Marked departed");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Failed");
                              }
                            }}
                          >
                            Mark departed
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 dark:border-slate-700">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Tracking events</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setEventOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add event
              </Button>
            </CardHeader>
            <CardContent>
              <div className="relative ml-3 space-y-5 border-l-2 border-slate-200 pl-6 dark:border-slate-700">
                {detail.events.map((e) => (
                  <div key={e._id} className="relative">
                    <div className="absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white dark:bg-slate-950" />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{e.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(e.status)}`}>
                        {statusLabel(e.status)}
                      </span>
                      {!e.isPublic && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                          Private
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{e.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <span>{fmtDate(e.eventTimestamp)}</span>
                      {e.locationLabel && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.locationLabel}</span>
                      )}
                      {e.facilityName && <span>· {e.facilityName}</span>}
                      {e.latitude != null && e.longitude != null && (
                        <span className="font-mono">({e.latitude.toFixed(3)}, {e.longitude.toFixed(3)})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: details, packages, codes, label */}
        <div className="space-y-6">
          <Card className="rounded-xl border-slate-200 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                ["Reference", s.referenceNumber ?? "—"],
                ["Carrier", detail.carrier?.name ?? "Not assigned"],
                ["Service", detail.service ? `${detail.service.name} (${detail.service.estimatedTransitDays}d)` : s.serviceTypeName ?? "—"],
                ["Weight", `${s.totalWeight} ${s.weightUnit}`],
                ["Dimensions", s.dimensions ?? "—"],
                ["Declared value", s.declaredValue ? `${s.declaredValue} ${s.currency ?? ""}` : "—"],
                ["Created", fmtDate(s.createdAt)],
                ["Notes", s.notes ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-slate-400">{k}</span>
                  <span className="max-w-[60%] text-right font-medium text-slate-700 dark:text-slate-200">{v}</span>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => {
                  setCarrierId(detail.carrier?._id ?? "");
                  setEditCarrier(true);
                }}
              >
                {detail.carrier ? "Change carrier" : "Assign carrier"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 dark:border-slate-700">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Packages ({detail.packages.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setPkgOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {detail.packages.map((p) => (
                <div key={p._id} className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">#{p.packageNumber} {p.description}</span>
                    <span className="text-slate-400">{p.weight} {s.weightUnit} × {p.quantity}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">{p.trackingNumber} · {p.packageType}</p>
                </div>
              ))}
              {detail.packages.length === 0 && <p className="text-xs text-slate-400">No packages yet.</p>}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="text-base">Codes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-around rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700">
                <BarcodeSvg value={s.trackingNumber} height={48} moduleWidth={1.5} />
                <QrCodeSvg value={`/tracking/${s.trackingNumber}`} size={72} />
              </div>
              <p className="text-center text-[10px] text-slate-400">
                QR points to the public tracking page for this shipment.
              </p>
            </CardContent>
          </Card>

          {labelData && (
            <Card className="rounded-xl border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-base">Shipping label</CardTitle>
              </CardHeader>
              <CardContent>
                <ShippingLabel
                  shipment={labelData.shipment}
                  packages={labelData.packages}
                  originLabel={labelData.originLabel}
                  destinationLabel={labelData.destinationLabel}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Status dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Current: <span className="font-semibold">{statusLabel(s.status)}</span>. Only valid
              transitions of the tracking state machine are accepted.
            </p>
            <Select value={newStatus || undefined} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="Select new status" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {TRACKING_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>{statusLabel(st)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Optional description recorded on the tracking event"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setStatusOpen(false);
                setConfirmStatus(true);
              }}
              disabled={!newStatus}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmStatus}
        onClose={() => setConfirmStatus(false)}
        onConfirm={applyStatus}
        title="Apply status change"
        description={`This changes the public tracking status of ${s.trackingNumber} and notifies linked users.`}
        resource={`${statusLabel(s.status)} → ${newStatus ? statusLabel(newStatus) : ""}`}
        actionLabel="Apply change"
      />

      {/* Event dialog */}
      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add tracking event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Status</Label>
                <Select value={event.status} onValueChange={(v) => setEvent({ ...event, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TRACKING_STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>{statusLabel(st)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Title</Label>
                <Input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} placeholder="e.g. Arrived at hub" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Description *</Label>
              <Textarea rows={2} value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Location label</Label>
                <Input value={event.locationLabel} onChange={(e) => setEvent({ ...event, locationLabel: e.target.value })} placeholder="Aberdeen, United Kingdom" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Event time</Label>
                <Input type="datetime-local" value={event.eventTimestamp} onChange={(e) => setEvent({ ...event, eventTimestamp: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Timezone</Label>
                <Input value={event.timezone} onChange={(e) => setEvent({ ...event, timezone: e.target.value })} placeholder="Europe/London" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Coordinates (lat, lon)</Label>
                <div className="flex gap-1.5">
                  <Input value={event.latitude} onChange={(e) => setEvent({ ...event, latitude: e.target.value })} placeholder="57.15" />
                  <Input value={event.longitude} onChange={(e) => setEvent({ ...event, longitude: e.target.value })} placeholder="-2.09" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Public event</p>
                <p className="text-[11px] text-slate-400">Public tracking page visitors can see it.</p>
              </div>
              <Switch checked={event.isPublic} onCheckedChange={(v) => setEvent({ ...event, isPublic: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Sync shipment status</p>
                <p className="text-[11px] text-slate-400">Drive the shipment status if the transition is valid.</p>
              </div>
              <Switch checked={event.syncShipmentStatus} onCheckedChange={(v) => setEvent({ ...event, syncShipmentStatus: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventOpen(false)}>Cancel</Button>
            <Button onClick={submitEvent} disabled={busy || !event.description.trim()}>
              {busy ? "Adding…" : "Add event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Package dialog */}
      <Dialog open={pkgOpen} onOpenChange={setPkgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add package</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Description" value={pkg.description} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={pkg.packageType} onValueChange={(v) => setPkg({ ...pkg, packageType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["box", "envelope", "pallet", "tube", "bag"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" min="0" step="0.1" placeholder="Weight" value={pkg.weight} onChange={(e) => setPkg({ ...pkg, weight: e.target.value })} />
              <Input placeholder="Dimensions" value={pkg.dimensions} onChange={(e) => setPkg({ ...pkg, dimensions: e.target.value })} />
              <Input type="number" min="1" placeholder="Quantity" value={pkg.quantity} onChange={(e) => setPkg({ ...pkg, quantity: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgOpen(false)}>Cancel</Button>
            <Button onClick={submitPackage} disabled={busy || !pkg.description.trim() || !(Number(pkg.weight) > 0)}>
              {busy ? "Adding…" : "Add package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Route stop dialog */}
      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add route stop</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Stop label (e.g. Frankfurt sorting center)"
            value={stopLabel}
            onChange={(e) => setStopLabel(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopOpen(false)}>Cancel</Button>
            <Button onClick={submitStop} disabled={busy || !stopLabel.trim()}>
              {busy ? "Adding…" : "Add stop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carrier dialog */}
      <Dialog open={editCarrier} onOpenChange={setEditCarrier}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign carrier</DialogTitle>
          </DialogHeader>
          <Select value={carrierId || undefined} onValueChange={setCarrierId}>
            <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
            <SelectContent>
              {(carriers ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCarrier(false)}>Cancel</Button>
            <Button onClick={saveCarrier} disabled={busy || !carrierId}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await deleteShipment({ shipmentId: s._id });
          toast.success("Shipment deleted");
          navigate("/admin/shipments");
        }}
        title="Delete shipment"
        description="This permanently removes the shipment, its events, packages and route stops. This cannot be undone."
        resource={s.trackingNumber}
        actionLabel="Delete permanently"
      />

      <p className="text-xs text-slate-400">
        Public tracking URL:{" "}
        <Link to={`/tracking/${s.trackingNumber}`} className="text-blue-600 hover:underline dark:text-blue-400">
          /tracking/{s.trackingNumber}
        </Link>
      </p>
    </div>
  );
}
