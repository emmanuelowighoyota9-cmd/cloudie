import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePricing } from "@/lib/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Building, Eye } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { DocumentViewer } from "@/components/documents/DocumentViewer";

export default function HotelDocument() {
  const { pointsWithNgn } = usePricing();
  const generate = useMutation(api.documents.generate);
  const docs = useQuery(api.documents.list, { type: "hotel", limit: 10 });
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<unknown>(null);
  const [form, setForm] = useState({
    guestName: "", hotel: "", address: "", checkIn: "", checkOut: "",
    confirmationNumber: "", roomType: "", guests: "1",
  });
  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const docId = await generate({ type: "hotel", title: `Hotel - ${form.guestName} - ${form.hotel}`, data: form });
      toast.success("Hotel reservation document generated!");
      setSelectedDoc({
        _id: docId, type: "hotel", title: `Hotel - ${form.guestName} - ${form.hotel}`,
        data: { ...form }, pointsCost: 120, createdAt: Date.now(),
      });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); } finally { setLoading(false); }
  };

  if (selectedDoc) {
    return <DocumentViewer document={selectedDoc as never} onBack={() => setSelectedDoc(null)} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/ticketing"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Hotel Reservation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generate a hotel reservation confirmation. Cost: 120 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border">
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
            {loading ? "Generating..." : `Generate Document (${pointsWithNgn(120)})`}
          </Button>
        </div>
      </form>

      <Card className="border-border">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Previous Documents</CardTitle></CardHeader>
        <CardContent>
          {!docs ? <p className="text-sm text-muted-foreground animate-pulse">Loading...</p> : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No documents yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()} · {doc.pointsCost} pts</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDoc(doc)} className="shrink-0">
                    <Eye className="h-4 w-4 mr-1" /> View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
