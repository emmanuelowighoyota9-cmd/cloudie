import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Building2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router";

export default function NewSite() {
  const create = useMutation(api.tenants.create);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    siteName: "", subdomain: "", siteType: "bank" as "bank" | "investment",
    contactEmail: "", contactPhone: "",
  });
  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9-]+$/.test(form.subdomain)) {
      toast.error("Subdomain must be lowercase alphanumeric with hyphens only");
      return;
    }
    setLoading(true);
    try {
      await create(form as any);
      toast.success("Site created!");
      navigate("/business");
    } catch (err: any) { toast.error(err.message || "Failed"); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/business"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Create Tenant Site</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set up a new white-label tenant site.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="notebook-card">
          <CardContent className="grid gap-4 sm:grid-cols-2 p-6">
            <div className="space-y-1.5"><Label>Site Name *</Label><Input required value={form.siteName} onChange={(e) => update("siteName", e.target.value)} placeholder="My Bank" /></div>
            <div className="space-y-1.5"><Label>Subdomain *</Label><div className="flex items-center gap-0"><Input required value={form.subdomain} onChange={(e) => update("subdomain", e.target.value.toLowerCase())} placeholder="mybank" className="rounded-r-none" /><span className="rounded-r-md border border-l-0 border-input bg-muted px-3 py-2 text-sm text-muted-foreground">.cloudie.app</span></div></div>
            <div className="space-y-1.5"><Label>Site Type *</Label>
              <Select value={form.siteType} onValueChange={(v) => update("siteType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Contact Email</Label><Input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Contact Phone</Label><Input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} /></div>
          </CardContent>
        </Card>
        <div className="flex justify-end mt-6">
          <Button type="submit" size="lg" disabled={loading} className="gap-2">
            <Building2 className="h-4 w-4" />
            {loading ? "Creating..." : "Create Site"}
          </Button>
        </div>
      </form>
    </div>
  );
}
