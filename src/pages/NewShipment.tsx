import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Package, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router";

export default function NewShipment() {
  const { user } = useAuth();
  const createShipment = useMutation(api.shipments.create);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    senderName: "", senderPhone: "", senderEmail: "", senderAddress: "",
    senderCity: "", senderState: "", senderCountry: "", senderPostalCode: "",
    recipientName: "", recipientPhone: "", recipientEmail: "", recipientAddress: "",
    recipientCity: "", recipientState: "", recipientCountry: "", recipientPostalCode: "",
    packageDescription: "", weight: 0, dimensions: "", serviceType: "standard",
    notes: "",
  });

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createShipment(form as any);
      toast.success("Shipment created!", {
        description: `Tracking: ${result.trackingNumber}`,
      });
      navigate(`/shipments/${result.shipmentId}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create shipment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/shipments">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">New Shipment</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create a new shipment. Cost: 100 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Sender */}
        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sender Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Full Name *</Label><Input required value={form.senderName} onChange={(e) => update("senderName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Phone *</Label><Input required value={form.senderPhone} onChange={(e) => update("senderPhone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input required type="email" value={form.senderEmail} onChange={(e) => update("senderEmail", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Address *</Label><Input required value={form.senderAddress} onChange={(e) => update("senderAddress", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>City *</Label><Input required value={form.senderCity} onChange={(e) => update("senderCity", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>State *</Label><Input required value={form.senderState} onChange={(e) => update("senderState", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Country *</Label><Input required value={form.senderCountry} onChange={(e) => update("senderCountry", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Postal Code *</Label><Input required value={form.senderPostalCode} onChange={(e) => update("senderPostalCode", e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Recipient */}
        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recipient Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Full Name *</Label><Input required value={form.recipientName} onChange={(e) => update("recipientName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Phone *</Label><Input required value={form.recipientPhone} onChange={(e) => update("recipientPhone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input required type="email" value={form.recipientEmail} onChange={(e) => update("recipientEmail", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Address *</Label><Input required value={form.recipientAddress} onChange={(e) => update("recipientAddress", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>City *</Label><Input required value={form.recipientCity} onChange={(e) => update("recipientCity", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>State *</Label><Input required value={form.recipientState} onChange={(e) => update("recipientState", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Country *</Label><Input required value={form.recipientCountry} onChange={(e) => update("recipientCountry", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Postal Code *</Label><Input required value={form.recipientPostalCode} onChange={(e) => update("recipientPostalCode", e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Package */}
        <Card className="notebook-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Package Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Package Description *</Label><Input required value={form.packageDescription} onChange={(e) => update("packageDescription", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Weight (kg) *</Label><Input required type="number" min="0.1" step="0.1" value={form.weight || ""} onChange={(e) => update("weight", parseFloat(e.target.value) || 0)} /></div>
            <div className="space-y-1.5"><Label>Dimensions</Label><Input placeholder="L×W×H cm" value={form.dimensions} onChange={(e) => update("dimensions", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Service Type *</Label>
              <Select value={form.serviceType} onValueChange={(v) => update("serviceType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="express">Express</SelectItem>
                  <SelectItem value="overnight">Overnight</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <Package className="h-4 w-4" />
            {loading ? "Creating..." : "Create Shipment (100 pts)"}
          </Button>
        </div>
      </form>
    </div>
  );
}
