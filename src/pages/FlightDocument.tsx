import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Plane } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Id } from "@/convex/_generated/dataModel";

export default function FlightDocument() {
  const generate = useMutation(api.documents.generate);
  const balance = useQuery(api.points.getBalance);
  const docs = useQuery(api.documents.list, { type: "flight", limit: 10 });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    passengerName: "", airline: "", flightNumber: "", departure: "",
    arrival: "", departureDate: "", arrivalDate: "",
    bookingRef: "", seat: "", cabin: "Economy", baggage: "1",
  });

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await generate({
        type: "flight",
        title: `Flight - ${form.passengerName} - ${form.flightNumber}`,
        data: form,
      });
      toast.success("Flight itinerary generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/ticketing"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Flight Itinerary</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Generate a professional flight itinerary document. Cost: 150 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="notebook-card">
          <CardHeader>              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">Passenger & Flight Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Passenger Name *</Label><Input required value={form.passengerName} onChange={(e) => update("passengerName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Airline *</Label><Input required value={form.airline} onChange={(e) => update("airline", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Flight Number *</Label><Input required value={form.flightNumber} onChange={(e) => update("flightNumber", e.target.value)} placeholder="e.g. AA123" /></div>
            <div className="space-y-1.5"><Label>Booking Ref *</Label><Input required value={form.bookingRef} onChange={(e) => update("bookingRef", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Departure City *</Label><Input required value={form.departure} onChange={(e) => update("departure", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Arrival City *</Label><Input required value={form.arrival} onChange={(e) => update("arrival", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Departure Date & Time *</Label><Input required type="datetime-local" value={form.departureDate} onChange={(e) => update("departureDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Arrival Date & Time *</Label><Input required type="datetime-local" value={form.arrivalDate} onChange={(e) => update("arrivalDate", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Seat</Label><Input value={form.seat} onChange={(e) => update("seat", e.target.value)} placeholder="e.g. 12A" /></div>
            <div className="space-y-1.5"><Label>Cabin Class</Label><Input value={form.cabin} onChange={(e) => update("cabin", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Baggage Allowance</Label><Input value={form.baggage} onChange={(e) => update("baggage", e.target.value)} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <Plane className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Document (150 pts)"}
          </Button>
        </div>
      </form>

      {/* Previous Documents */}
      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Previous Documents</CardTitle></CardHeader>
        <CardContent>
          {!docs ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No documents generated yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc._id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--nb-ink)]/5">
                  <div>
                    <p className="text-sm font-medium text-[var(--nb-ink)]">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()} • {doc.pointsCost} pts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
