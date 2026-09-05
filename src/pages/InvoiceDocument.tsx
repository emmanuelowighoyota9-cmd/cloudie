import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

interface InvoiceItem { description: string; quantity: number; unitPrice: number; }

export default function InvoiceDocument() {
  const generate = useMutation(api.documents.generate);
  const docs = useQuery(api.documents.list, { type: "invoice", limit: 10 });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    seller: "", buyer: "", invoiceNumber: "", currency: "USD", tax: "0", shipping: "0",
  });
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const addItem = () => setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: string | number) =>
    setItems((p) => p.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const total = items.reduce((s, item) => s + item.quantity * item.unitPrice, 0) + parseFloat(form.tax || "0") + parseFloat(form.shipping || "0");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await generate({ type: "invoice", title: `Invoice - ${form.invoiceNumber}`, data: { ...form, items, total } });
      toast.success("Invoice generated!");
    } catch (err: any) { toast.error(err.message || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/ticketing"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Commercial Invoice</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Generate a commercial invoice. Cost: 80 points.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="notebook-card">
          <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Invoice Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Seller *</Label><Input required value={form.seller} onChange={(e) => update("seller", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Buyer *</Label><Input required value={form.buyer} onChange={(e) => update("buyer", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Invoice # *</Label><Input required value={form.invoiceNumber} onChange={(e) => update("invoiceNumber", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency} onChange={(e) => update("currency", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tax</Label><Input type="number" value={form.tax} onChange={(e) => update("tax", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Shipping</Label><Input type="number" value={form.shipping} onChange={(e) => update("shipping", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card className="notebook-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Line Items</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-end gap-3">
                <div className="flex-1 space-y-1"><Label className="text-xs">Description</Label><Input required value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></div>
                <div className="w-20 space-y-1"><Label className="text-xs">Qty</Label><Input required type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)} /></div>
                <div className="w-28 space-y-1"><Label className="text-xs">Unit Price</Label><Input required type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)} /></div>
                {items.length > 1 && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            ))}
            <div className="flex justify-end pt-2 text-sm font-semibold text-[var(--nb-ink)]">Total: {form.currency} {total.toFixed(2)}</div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Invoice (80 pts)"}
          </Button>
        </div>
      </form>

      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Previous Invoices</CardTitle></CardHeader>
        <CardContent>
          {!docs ? <p className="text-sm text-muted-foreground animate-pulse">Loading...</p> : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No invoices yet.</p>
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
