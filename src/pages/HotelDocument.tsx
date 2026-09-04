import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Building } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export default function HotelDocument() {
  const generate = useMutation(api.documents.generate);
  const docs = useQuery(api.documents.list, { type: "hotel", limit: 10 });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    guestName: "", hotel: "", address: "", checkIn: "", checkOut: "",
    confirmationNumber: "", roomType: "", guests: "1",
  });
  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await generate({ type: "hotel", title: `Hotel - ${form.guestName} - ${form.hotel}`, data: form });
      toast.success("Hotel reservation document generated!");
    } catch (err: any) { toast.error(err.message || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/ticketing"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Hotel Reservation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generate a hotel reservation confirmation. Cost: 120 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="notebook-card">
          <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reservation Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Guest Name *</Label><Input required value={form.guestName} onChange={(e) => update("guestName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Hotel Name *</Label><Input required value={form.hotel} onChange={(e) => update("hotel", e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => update("address", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Check-in *</Label><Input required type="date" value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Check-out *</Label><Input required type="date" value={form.checkOut} onChange={(e) => update("checkOut", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Confirmation #</Label><Input value={form.confirmationNumber} onChange={(e) => update("confirmationNumber", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Room Type</Label><Input value={form.roomType} onChange={(e) => update("roomType", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Number of Guests</Label><Input value={form.guests} onChange={(e) => update("guests", e.target.value)} /></div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <Building className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Document (120 pts)"}
          </Button>
        </div>
      </form>

      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-previous">Previous Documents</CardTitle></CardHeader>
        <CardContent>
          {!docs ? <p className="text-sm text-muted-foreground animate-pulse">Loading...</p> : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No documents yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--nb-ink)]/5">
                  <div><p className="text-sm font-medium text-[var(--nb-ink)]">{doc.title}</p><p className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()} • {doc.pointsCost} pts</p></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
