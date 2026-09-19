import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AdminPageHeader } from "@/components/admin/shared";

type PackageDraft = {
  description: string;
  packageType: string;
  weight: string;
  dimensions: string;
  quantity: string;
};

type StopDraft = { label: string };

const EMPTY_PARTY = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
};

const PACKAGE_TYPES = ["box", "envelope", "pallet", "tube", "bag"] as const;

export default function AdminCreateShipment() {
  const navigate = useNavigate();
  const carriers = useQuery(api.trackingQueries.listCarriers);
  const services = useQuery(api.trackingQueries.listServiceTypes);
  const locations = useQuery(api.trackingQueries.listLocations);
  const facilities = useQuery(api.trackingQueries.listFacilities);

  const create = useMutation(api.tracking.adminCreateShipment);

  const [sender, setSender] = useState({ ...EMPTY_PARTY });
  const [recipient, setRecipient] = useState({ ...EMPTY_PARTY });
  const [packageDescription, setPackageDescription] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [dimensions, setDimensions] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [originLocationId, setOriginLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [packages, setPackages] = useState<PackageDraft[]>([
    { description: "", packageType: "box", weight: "", dimensions: "", quantity: "1" },
  ]);
  const [routeStops, setRouteStops] = useState<StopDraft[]>([]);
  const [stopFacilityIds, setStopFacilityIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const partyValid = (p: typeof EMPTY_PARTY) =>
    p.name.trim() && p.phone.trim() && p.email.trim() && p.address.trim() && p.country.trim();

  const canSubmit =
    partyValid(sender) &&
    partyValid(recipient) &&
    packageDescription.trim() &&
    Number(totalWeight) > 0 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const pkgs = packages
        .filter((p) => p.description.trim() && Number(p.weight) > 0)
        .map((p) => ({
          description: p.description.trim(),
          packageType: p.packageType,
          weight: Number(p.weight),
          dimensions: p.dimensions.trim() || undefined,
          quantity: Math.max(1, Number(p.quantity) || 1),
        }));
      const stops = routeStops
        .map((s, i) => ({
          label: s.label.trim(),
          facilityId: stopFacilityIds[i] ? (stopFacilityIds[i] as never) : undefined,
        }))
        .filter((s) => s.label);
      const result = await create({
        sender: { ...sender },
        recipient: { ...recipient },
        packageDescription: packageDescription.trim(),
        totalWeight: Number(totalWeight),
        weightUnit,
        dimensions: dimensions.trim() || undefined,
        declaredValue: declaredValue ? Number(declaredValue) : undefined,
        currency: currency || undefined,
        serviceTypeId: serviceTypeId ? (serviceTypeId as never) : undefined,
        carrierId: carrierId ? (carrierId as never) : undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        originLocationId: originLocationId ? (originLocationId as never) : undefined,
        destinationLocationId: destinationLocationId ? (destinationLocationId as never) : undefined,
        packages: pkgs.length > 0 ? pkgs : undefined,
        routeStops: stops.length > 0 ? stops : undefined,
      });
      toast.success(`Shipment ${result.trackingNumber} created`);
      navigate(`/admin/shipments/${result.shipmentId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create shipment");
    } finally {
      setSubmitting(false);
    }
  };

  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

  const partyFields = (
    p: typeof EMPTY_PARTY,
    set: (v: typeof EMPTY_PARTY) => void,
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(
        [
          ["name", "Full name", true],
          ["phone", "Phone", true],
          ["email", "Email", true],
          ["country", "Country", true],
          ["address", "Street address", true],
          ["city", "City", false],
          ["state", "State / region", false],
          ["postalCode", "Postal code", false],
        ] as const
      ).map(([key, label, required]) => (
        <div key={key} className="space-y-1.5">
          <Label className="text-xs text-slate-500">
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
          <Input
            className={field}
            value={p[key]}
            onChange={(e) => set({ ...p, [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Create shipment"
        description="A tracking number, initial event, ETA, QR and barcode data are generated automatically."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/shipments")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-xl border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-base">Sender</CardTitle>
          </CardHeader>
          <CardContent>{partyFields(sender, setSender)}</CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-base">Recipient</CardTitle>
          </CardHeader>
          <CardContent>{partyFields(recipient, setRecipient)}</CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-base">Shipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Package description *</Label>
                <Input
                  className={field}
                  value={packageDescription}
                  onChange={(e) => setPackageDescription(e.target.value)}
                  placeholder="e.g. Documents, electronics"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Reference number</Label>
                <Input
                  className={field}
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Your internal reference"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Total weight *</Label>
                <div className="flex gap-2">
                  <Input
                    className={field}
                    type="number"
                    min="0"
                    step="0.1"
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(e.target.value)}
                  />
                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "kg" | "lb")}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Dimensions (L×W×H)</Label>
                <Input
                  className={field}
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  placeholder="40×30×20 cm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Declared value</Label>
                <Input
                  className={field}
                  type="number"
                  min="0"
                  value={declaredValue}
                  onChange={(e) => setDeclaredValue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "NGN"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Notes (internal)</Label>
              <Textarea
                className={field}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-base">Service & locations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Service type</Label>
                <Select value={serviceTypeId || undefined} onValueChange={setServiceTypeId}>
                  <SelectTrigger><SelectValue placeholder={services ? "Select service" : "Loading…"} /></SelectTrigger>
                  <SelectContent>
                    {(services ?? []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name} · {s.estimatedTransitDays}d
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Carrier</Label>
                <Select value={carrierId || undefined} onValueChange={setCarrierId}>
                  <SelectTrigger><SelectValue placeholder={carriers ? "Select carrier" : "Loading…"} /></SelectTrigger>
                  <SelectContent>
                    {(carriers ?? []).map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Origin location</Label>
                <Select value={originLocationId || undefined} onValueChange={setOriginLocationId}>
                  <SelectTrigger><SelectValue placeholder={locations ? "Select origin" : "Loading…"} /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {(locations ?? []).map((l) => (
                      <SelectItem key={l._id} value={l._id}>
                        {l.name} ({l.countryCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Destination location</Label>
                <Select value={destinationLocationId || undefined} onValueChange={setDestinationLocationId}>
                  <SelectTrigger><SelectValue placeholder={locations ? "Select destination" : "Loading…"} /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {(locations ?? []).map((l) => (
                      <SelectItem key={l._id} value={l._id}>
                        {l.name} ({l.countryCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Locations and facilities are managed under Admin → Locations / Facilities. ETA is
              computed from the selected service's configured transit days.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 dark:border-slate-700">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Packages</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPackages([...packages, { description: "", packageType: "box", weight: "", dimensions: "", quantity: "1" }])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add package
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {packages.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-5">
                <div className="col-span-2 space-y-1 sm:col-span-2">
                  <Label className="text-[11px] text-slate-500">Description</Label>
                  <Input
                    className={field}
                    value={p.description}
                    onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Type</Label>
                  <Select
                    value={p.packageType}
                    onValueChange={(v) => setPackages(packages.map((x, j) => (j === i ? { ...x, packageType: v } : x)))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PACKAGE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Weight</Label>
                  <Input
                    className={field}
                    type="number"
                    min="0"
                    step="0.1"
                    value={p.weight}
                    onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
                  />
                </div>
                <div className="flex items-end gap-1">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px] text-slate-500">Qty</Label>
                    <Input
                      className={field}
                      type="number"
                      min="1"
                      value={p.quantity}
                      onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                    />
                  </div>
                  {packages.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                      onClick={() => setPackages(packages.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400">
              Each package automatically receives a barcode and QR payload derived from the
              tracking number.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 dark:border-slate-700">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Route stops</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRouteStops([...routeStops, { label: "" }]);
                setStopFacilityIds([...stopFacilityIds, ""]);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add stop
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {routeStops.length === 0 && (
              <p className="text-xs text-slate-400">Optional — define the planned route in order.</p>
            )}
            {routeStops.map((s, i) => (
              <div key={i} className="flex gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-800">
                  {i + 1}
                </span>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    className={field}
                    placeholder="Stop label (e.g. Lagos sorting center)"
                    value={s.label}
                    onChange={(e) => setRouteStops(routeStops.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <Select
                    value={stopFacilityIds[i] || undefined}
                    onValueChange={(v) => setStopFacilityIds(stopFacilityIds.map((x, j) => (j === i ? v : x)))}
                  >
                    <SelectTrigger><SelectValue placeholder="Facility (optional)" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {(facilities ?? []).map((f) => (
                        <SelectItem key={f._id} value={f._id}>
                          {f.name} ({f.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-500"
                  onClick={() => {
                    setRouteStops(routeStops.filter((_, j) => j !== i));
                    setStopFacilityIds(stopFacilityIds.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={submit} disabled={!canSubmit}>
          {submitting ? "Creating…" : "Create shipment"}
        </Button>
      </div>
    </div>
  );
}
