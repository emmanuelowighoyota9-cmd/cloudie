import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export default function CustomsDocument() {
  const generate = useMutation(api.documents.generate);
  const docs = useQuery(api.documents.list, { type: "customs", limit: 10 });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    senderName: "", senderCountry: "", receiverName: "", receiverCountry: "",
    packageDescription: "", commodity: "", value: "", countryOfOrigin: "", weight: "",
    declarationInfo: "",
  });
  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await generate({ type: "customs", title: `Customs - ${form.senderName} to ${form.receiverName}`, data: form });
      toast.success("Customs document generated!");
    } catch (err: any) { toast.error(err.message || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/ticketing"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Customs Declaration</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Generate a customs declaration document. Cost: 100 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="notebook-card">
          <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sender & Receiver</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Sender Name *</Label><Input required value={form.senderName} onChange={(e) => update("senderName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sender Country *</Label><Input required value={form.senderCountry} onChange={(e) => update("senderCountry", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Receiver Name *</Label><Input required value={form.receiverName} onChange={(e) => update("receiverName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Receiver Country *</Label><Input required value={form.receiverCountry} onChange={(e) => update("receiverCountry", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card className="notebook-card">
          <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Package & Commodity</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Package Description *</Label><Input required value={form.packageDescription} onChange={(e) => update("packageDescription", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Commodity *</Label><Input required value={form.commodity} onChange={(e) => update("commodity", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Value (USD) *</Label><Input required type="number" min="0" value={form.value} onChange={(e) => update("value", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Country of Origin *</Label><Input required value={form.countryOfOrigin} onChange={(e) => update("countryOfOrigin", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Weight (kg) *</Label><Input required type="number" min="0" value={form.weight} onChange={(e) => update("weight", e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Declaration Info</Label><Input value={form.declarationInfo} onChange={(e) => update("declarationInfo", e.target.value)} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <ScrollText className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Document (100 pts)"}
          </Button>
        </div>
      </form>
    </div>
  );
}
