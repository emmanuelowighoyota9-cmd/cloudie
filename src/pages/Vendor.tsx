import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Store, CheckCircle, Clock, XCircle, AlertCircle, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router";

const statusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  pending: { icon: Clock, color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300", label: "Under Review" },
  approved: { icon: CheckCircle, color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300", label: "Approved" },
  rejected: { icon: XCircle, color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300", label: "Rejected" },
  suspended: { icon: AlertCircle, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300", label: "Suspended" },
};

export default function Vendor() {
  const vendor = useQuery(api.marketplace.getMyVendor);
  const registerVendor = useMutation(api.marketplace.registerVendor);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    contactEmail: "",
    contactPhone: "",
    description: "",
    category: "",
    website: "",
    supportingInfo: "",
    agreeToTerms: false,
  });

  const update = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agreeToTerms) {
      toast.error("Please agree to the vendor terms");
      return;
    }
    setLoading(true);
    try {
      await registerVendor({
        businessName: form.businessName,
        description: form.description,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        category: form.category,
        website: form.website,
        supportingInfo: form.supportingInfo,
      });
      toast.success("Vendor application submitted!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setLoading(false);
    }
  };

  // Show status if already registered
  if (vendor === undefined) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Become a Vendor</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sell products and services on the Cloudie marketplace.</p>
        </div>
        <Card><CardContent className="p-6 text-center text-slate-500 animate-pulse">Loading...</CardContent></Card>
      </div>
    );
  }

  if (vendor) {
    const config = statusConfig[vendor.status] ?? statusConfig.pending;
    const StatusIcon = config.icon;

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Vendor Status</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your vendor application status.</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${config.color}`}>
                <StatusIcon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{vendor.businessName}</h2>
                <Badge className={`mt-2 ${config.color} border-0`}>{config.label}</Badge>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {vendor.status === "pending" && "Your application is being reviewed. We'll notify you once a decision is made."}
                  {vendor.status === "approved" && "Your vendor account is active. You can now create and sell products on the marketplace."}
                  {vendor.status === "rejected" && "Your application was not approved. Please contact support for more information."}
                  {vendor.status === "suspended" && "Your vendor account has been suspended. Please contact support."}
                </p>
                {vendor.status === "approved" && (
                  <div className="mt-4 flex gap-3">
                    <Link to="/marketplace">
                      <Button size="sm" className="gap-2">
                        <Store className="h-4 w-4" /> View Marketplace
                        <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vendor Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Sales</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{vendor.totalSales}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Earnings</p>
              <p className="mt-1 text-2xl font-bold text-blue-600">{vendor.earnings.toLocaleString()} pts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</p>
              <Badge className={`mt-2 ${config.color} border-0`}>{config.label}</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Application form
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Become a Vendor</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Apply to sell products on the Cloudie marketplace.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">Business Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Business Name *</Label>
              <Input required value={form.businessName} onChange={(e) => update("businessName", e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="space-y-1.5">
              <Label>Business Category *</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">Digital Products</SelectItem>
                  <SelectItem value="physical">Physical Goods</SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contact Email *</Label>
              <Input required type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} placeholder="vendor@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Phone</Label>
              <Input value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="+1 (555) 000-0000" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Business Description *</Label>
              <Textarea required rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe your business and what you plan to sell..." />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://yourcompany.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Supporting Information</Label>
              <Input value={form.supportingInfo} onChange={(e) => update("supportingInfo", e.target.value)} placeholder="Any additional details..." />
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardContent className="p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={form.agreeToTerms}
                onCheckedChange={(checked) => update("agreeToTerms", !!checked)}
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                I agree to the Cloudie Vendor Terms of Service, including commission fees, product guidelines, and payment policies. I understand that my application will be reviewed before my vendor account is activated.
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading || !form.agreeToTerms} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            <Store className="h-4 w-4" />
            {loading ? "Submitting..." : "Submit Application"}
          </Button>
        </div>
      </form>
    </div>
  );
}
