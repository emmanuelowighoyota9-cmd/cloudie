import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Building2, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, ConfirmDialog } from "@/components/admin/shared";

const LOCATION_TYPES = [
  "country",
  "state",
  "city",
  "warehouse",
  "airport",
  "sorting_center",
  "distribution_center",
  "customs_facility",
  "delivery_hub",
] as const;

const FACILITY_TYPES = [
  "warehouse",
  "airport",
  "sorting_center",
  "distribution_center",
  "customs_facility",
  "delivery_hub",
] as const;

export default function AdminLocations({ tab }: { tab: "locations" | "facilities" }) {
  const locations = useQuery(api.trackingQueries.listLocations);
  const facilities = useQuery(api.trackingQueries.listFacilities);

  const createLocation = useMutation(api.tracking.adminCreateLocation);
  const deleteLocation = useMutation(api.tracking.adminDeleteLocation);
  const createFacility = useMutation(api.tracking.adminCreateFacility);
  const deleteFacility = useMutation(api.tracking.adminDeleteFacility);

  const [locOpen, setLocOpen] = useState(false);
  const [loc, setLoc] = useState({
    name: "",
    type: "warehouse" as (typeof LOCATION_TYPES)[number],
    country: "",
    countryCode: "",
    state: "",
    city: "",
    postalCode: "",
    address: "",
    latitude: "",
    longitude: "",
    timezone: "",
  });
  const [facOpen, setFacOpen] = useState(false);
  const [fac, setFac] = useState({ name: "", code: "", type: "warehouse" as (typeof FACILITY_TYPES)[number], locationId: "" });
  const [confirmDelete, setConfirmDelete] = useState<null | { kind: "location" | "facility"; id: string; name: string }>(null);
  const [busy, setBusy] = useState(false);

  const submitLocation = async () => {
    setBusy(true);
    try {
      await createLocation({
        name: loc.name,
        type: loc.type,
        country: loc.country,
        countryCode: loc.countryCode.toUpperCase(),
        state: loc.state || undefined,
        city: loc.city || undefined,
        postalCode: loc.postalCode || undefined,
        address: loc.address || undefined,
        latitude: loc.latitude ? Number(loc.latitude) : undefined,
        longitude: loc.longitude ? Number(loc.longitude) : undefined,
        timezone: loc.timezone || undefined,
      });
      toast.success(`Location "${loc.name}" created`);
      setLocOpen(false);
      setLoc({ name: "", type: "warehouse", country: "", countryCode: "", state: "", city: "", postalCode: "", address: "", latitude: "", longitude: "", timezone: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create location");
    } finally {
      setBusy(false);
    }
  };

  const submitFacility = async () => {
    setBusy(true);
    try {
      await createFacility({
        name: fac.name,
        code: fac.code.toUpperCase(),
        type: fac.type,
        locationId: fac.locationId as never,
      });
      toast.success(`Facility "${fac.name}" created`);
      setFacOpen(false);
      setFac({ name: "", code: "", type: "warehouse", locationId: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create facility");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={tab === "locations" ? "Locations" : "Facilities"}
        description={
          tab === "locations"
            ? "The native location database — admins enter all data manually. No geocoding services."
            : "Physical facilities (warehouses, airports, hubs) attached to locations."
        }
        actions={
          <Button size="sm" onClick={() => (tab === "locations" ? setLocOpen(true) : setFacOpen(true))}>
            <Plus className="mr-1.5 h-4 w-4" /> New {tab === "locations" ? "location" : "facility"}
          </Button>
        }
      />

      {tab === "locations" ? (
        locations === undefined ? (
          <AdminSkeleton rows={6} />
        ) : locations.length === 0 ? (
          <AdminEmpty message="No locations yet" hint="Create your first location — it becomes available on shipments and routes." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((l) => (
              <Card key={l._id} className="rounded-xl border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{l.name}</p>
                        <p className="text-xs text-slate-500">
                          {[l.city, l.state, l.country].filter(Boolean).join(", ")}
                        </p>
                        <p className="mt-1 text-[11px] capitalize text-slate-400">
                          {l.type.replace(/_/g, " ")} · {l.countryCode}
                          {l.latitude != null && l.longitude != null
                            ? ` · ${l.latitude.toFixed(2)}, ${l.longitude.toFixed(2)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => setConfirmDelete({ kind: "location", id: l._id, name: l.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : facilities === undefined ? (
        <AdminSkeleton rows={6} />
      ) : facilities.length === 0 ? (
        <AdminEmpty message="No facilities yet" hint="Attach facilities to locations for facility-level tracking events." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.map((f) => {
            const parent = locations?.find((l) => l._id === f.locationId);
            return (
              <Card key={f._id} className="rounded-xl border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {f.name} <span className="font-mono text-[10px] text-slate-400">({f.code})</span>
                        </p>
                        <p className="text-xs text-slate-500">{parent ? `${parent.name} · ${parent.country}` : "—"}</p>
                        <p className="mt-1 text-[11px] capitalize text-slate-400">{f.type.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => setConfirmDelete({ kind: "facility", id: f._id, name: f.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New location dialog */}
      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Name *</Label>
                <Input className={field} value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} placeholder="Lagos Sorting Center" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Type *</Label>
                <Select value={loc.type} onValueChange={(v) => setLoc({ ...loc, type: v as typeof loc.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Country *</Label>
                <Input className={field} value={loc.country} onChange={(e) => setLoc({ ...loc, country: e.target.value })} placeholder="Nigeria" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Country code *</Label>
                <Input className={field} value={loc.countryCode} onChange={(e) => setLoc({ ...loc, countryCode: e.target.value })} placeholder="NG" maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">State</Label>
                <Input className={field} value={loc.state} onChange={(e) => setLoc({ ...loc, state: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">City</Label>
                <Input className={field} value={loc.city} onChange={(e) => setLoc({ ...loc, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Postal code</Label>
                <Input className={field} value={loc.postalCode} onChange={(e) => setLoc({ ...loc, postalCode: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Timezone</Label>
                <Input className={field} value={loc.timezone} onChange={(e) => setLoc({ ...loc, timezone: e.target.value })} placeholder="Africa/Lagos" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Latitude</Label>
                <Input className={field} value={loc.latitude} onChange={(e) => setLoc({ ...loc, latitude: e.target.value })} placeholder="6.5244" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Longitude</Label>
                <Input className={field} value={loc.longitude} onChange={(e) => setLoc({ ...loc, longitude: e.target.value })} placeholder="3.3792" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Address</Label>
              <Input className={field} value={loc.address} onChange={(e) => setLoc({ ...loc, address: e.target.value })} />
            </div>
            <p className="text-[11px] text-slate-400">
              Coordinates are optional and entered manually — the application never calls a geocoding service.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocOpen(false)}>Cancel</Button>
            <Button onClick={submitLocation} disabled={busy || !loc.name.trim() || !loc.country.trim() || !loc.countryCode.trim()}>
              {busy ? "Creating…" : "Create location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New facility dialog */}
      <Dialog open={facOpen} onOpenChange={setFacOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New facility</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Name *</Label>
              <Input className={field} value={fac.name} onChange={(e) => setFac({ ...fac, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Code * (unique)</Label>
                <Input className={field} value={fac.code} onChange={(e) => setFac({ ...fac, code: e.target.value })} placeholder="LAG-SC01" maxLength={10} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Type *</Label>
                <Select value={fac.type} onValueChange={(v) => setFac({ ...fac, type: v as typeof fac.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FACILITY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Location *</Label>
              <Select value={fac.locationId || undefined} onValueChange={(v) => setFac({ ...fac, locationId: v })}>
                <SelectTrigger><SelectValue placeholder={locations ? "Select location" : "Loading…"} /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(locations ?? []).map((l) => (
                    <SelectItem key={l._id} value={l._id}>{l.name} ({l.countryCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFacOpen(false)}>Cancel</Button>
            <Button onClick={submitFacility} disabled={busy || !fac.name.trim() || !fac.code.trim() || !fac.locationId}>
              {busy ? "Creating…" : "Create facility"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          if (confirmDelete.kind === "location") {
            await deleteLocation({ locationId: confirmDelete.id as never });
          } else {
            await deleteFacility({ facilityId: confirmDelete.id as never });
          }
          toast.success(`${confirmDelete.kind === "location" ? "Location" : "Facility"} deleted`);
        }}
        title={`Delete ${confirmDelete?.kind ?? ""}`}
        description="This permanently removes the record. Locations with attached facilities cannot be deleted."
        resource={confirmDelete?.name}
        actionLabel="Delete"
      />
    </div>
  );
}
