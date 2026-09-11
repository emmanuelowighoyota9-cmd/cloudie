import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";

export default function AdminDocuments() {
  const documents = useQuery(api.documents.adminList, { limit: 300 });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!documents) return undefined;
    let list = [...documents];
    if (typeFilter !== "all") list = list.filter((d) => d.type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(s) || d.type.includes(s));
    }
    return list;
  }, [documents, search, typeFilter]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Document Administration" description="All generated documents across the platform." />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search title…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="flight">Flight</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="customs">Customs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered === undefined ? (
        <AdminSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No documents match." />
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <div key={d._id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{d.title}</p>
                <p className="text-[11px] text-slate-400">{d.type} · {d.pointsCost} pts · {fmtDate(d.createdAt)}</p>
              </div>
              <StatusBadge status="completed" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
