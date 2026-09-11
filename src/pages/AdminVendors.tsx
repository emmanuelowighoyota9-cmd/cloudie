import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Search, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton } from "@/components/admin/shared";

export default function AdminVendors() {
  const vendors = useQuery(api.marketplace.adminListVendors, { limit: 500 });
  const review = useMutation(api.adminApi.reviewVendor);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = (vendors ?? []).filter((v) => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (!search.trim()) return true;
    return v.businessName.toLowerCase().includes(search.toLowerCase());
  });

  const act = async (vendorId: string, action: "approve" | "reject", reason?: string) => {
    setBusyId(vendorId);
    try {
      await review({ vendorId: vendorId as never, action, reason });
      toast.success(`Vendor ${action === "approve" ? "approved" : "rejected"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Vendor Management" description="Review, approve, and moderate marketplace vendors." />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {vendors === undefined ? (
        <AdminSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No vendors match." hint="Approved vendors appear here after review." />
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card key={v._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/vendors/${v._id}`} className="truncate text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white">
                    {v.businessName}
                  </Link>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {v.contactEmail || v.category || "No contact info"} · {v.earnings.toLocaleString()} pts earned · {v.totalSales} sales
                  </p>
                </div>
                <StatusBadge status={v.status} />
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/admin/vendors/${v._id}`}>Review</Link>
                  </Button>
                  {v.status === "pending" && (
                    <>
                      <Button size="sm" disabled={busyId === v._id} onClick={() => act(v._id, "approve")} className="bg-green-600 text-white hover:bg-green-700">
                        <Check className="mr-1 h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === v._id} onClick={() => act(v._id, "reject", "Application did not meet marketplace requirements")}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
