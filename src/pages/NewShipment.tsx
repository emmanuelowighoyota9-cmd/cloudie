import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePricing } from "@/lib/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Package, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router";

type Party = {
  name: string; phone: string; email: string; address: string;
  city: string; state: string; country: string; postalCode: string;
};

const emptyParty = (): Party => ({
  name: "", phone: "", email: "", address: "", city: "", state: "", country: "", postalCode: "",
});

export default function NewShipment() {
  const { price } = usePricing();
  const shipmentPrice = price("shipment_create", 100);
  const createShipment = useMutation(api.trackingUser.createMyShipment);
  const serviceTypes = useQuery(api.trackingQueries.listServiceTypes);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [sender, setSender] = useState<Party>(emptyParty);
  const [recipient, setRecipient] = useState<Party>(emptyParty);
  const [pkg, setPkg] = useState({
    packageDescription: "", weight: 0, dimensions: "", serviceTypeId: "", notes: "",
  });

  const updateParty = (
    which: "sender" | "recipient",
    field: keyof Party,
    value: string,
  ) => {
    if (which === "sender") setSender((p) => ({ ...p, [field]: value }));
    else setRecipient((p) => ({ ...p, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createShipment({
        sender,
        recipient,
        packageDescription: pkg.packageDescription,
        totalWeight: pkg.weight,
        weightUnit: "kg",
        dimensions: pkg.dimensions || undefined,
        serviceTypeId: (pkg.serviceTypeId || undefined) as never,
        notes: pkg.notes || undefined,
      });
      toast.success("Shipment created!", {
        description: `Tracking: ${result.trackingNumber} · 100 points debited`,
      });
      navigate(`/shipments/${result.shipmentId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create shipment");
    } finally {
      setLoading(false);
    }
  };

  const partyFields = (
    which: "sender" | "recipient",
    p: Party,
  ) => (
    <CardContent className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Full Name *</Label><Input required value={p.name} onChange={(e) => updateParty(which, "name", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Phone *</Label><Input required value={p.phone} onChange={(e) => updateParty(which, "phone", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Email *</Label><Input required type="email" value={p.email} onChange={(e) => updateParty(which, "email", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Address *</Label><Input required value={p.address} onChange={(e) => updateParty(which, "address", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>City *</Label><Input required value={p.city} onChange={(e) => updateParty(which, "city", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>State *</Label><Input required value={p.state} onChange={(e) => updateParty(which, "state", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Country *</Label><Input required value={p.country} onChange={(e) => updateParty(which, "country", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Postal Code *</Label><Input required value={p.postalCode} onChange={(e) => updateParty(which, "postalCode", e.target.value)} /></div>
    </CardContent>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/shipments">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">New Shipment</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a new tracked shipment. Cost: 100 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sender Information</CardTitle>
          </CardHeader>
          {partyFields("sender", sender)}
        </Card>

        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recipient Information</CardTitle>
          </CardHeader>
          {partyFields("recipient", recipient)}
        </Card>

        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Package Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Package Description *</Label><Input required value={pkg.packageDescription} onChange={(e) => setPkg((p) => ({ ...p, packageDescription: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Weight (kg) *</Label><Input required type="number" min="0.1" step="0.1" value={pkg.weight || ""} onChange={(e) => setPkg((p) => ({ ...p, weight: parseFloat(e.target.value) || 0 }))} /></div>
            <div className="space-y-1.5"><Label>Dimensions</Label><Input placeholder="L×W×H cm" value={pkg.dimensions} onChange={(e) => setPkg((p) => ({ ...p, dimensions: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Service Type *</Label>
              <Select value={pkg.serviceTypeId} onValueChange={(v) => setPkg((p) => ({ ...p, serviceTypeId: v }))}>
                <SelectTrigger><SelectValue placeholder={serviceTypes === undefined ? "Loading…" : "Select a service"} /></SelectTrigger>
                <SelectContent>
                  {(serviceTypes ?? []).filter((s) => s.isActive).map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name} ({s.estimatedTransitDays} days)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={pkg.notes} onChange={(e) => setPkg((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <Package className="h-4 w-4" />
            {loading ? "Creating..." : `Create Shipment (${shipmentPrice.label})`}
          </Button>
        </div>
      </form>
    </div>
  );
}
