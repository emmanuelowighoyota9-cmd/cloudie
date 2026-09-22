import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Search, Shield, UserCheck, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, downloadCsv, fmtDate } from "@/components/admin/shared";
import { usePricing, formatNgn } from "@/lib/pricing";

type SortKey = "newest" | "oldest" | "points-desc" | "points-asc" | "name";

export default function AdminUsers() {
  const users = useQuery(api.admin.listUsers, { limit: 500 });
  const { ngnPerPoint } = usePricing();
  const suspendUser = useMutation(api.admin.suspendUser);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!users) return undefined;
    let list = [...users];
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((u) => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
    }
    if (statusFilter === "suspended") list = list.filter((u) => u.isSuspended);
    if (statusFilter === "active") list = list.filter((u) => !u.isSuspended);
    if (statusFilter === "admin") list = list.filter((u) => u.role === "admin");
    if (statusFilter === "vendor") list = list.filter((u) => u.role === "vendor");
    switch (sort) {
      case "newest":
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        break;
      case "oldest":
        list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        break;
      case "points-desc":
        list.sort((a, b) => (b.pointsBalance ?? 0) - (a.pointsBalance ?? 0));
        break;
      case "points-asc":
        list.sort((a, b) => (a.pointsBalance ?? 0) - (b.pointsBalance ?? 0));
        break;
      case "name":
        list.sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
        break;
    }
    return list;
  }, [users, search, statusFilter, sort]);

  const exportCsv = () => {
    if (!filtered?.length) return;
    downloadCsv(
      `cloudie-users-${new Date().toISOString().split("T")[0]}.csv`,
      [
        ["Name", "Email", "Role", "Status", "Points", "Created"],
        ...filtered.map((u) => [
          u.name ?? "",
          u.email ?? "",
          u.role ?? "user",
          u.isSuspended ? "suspended" : "active",
          u.pointsBalance ?? 0,
          fmtDate(u.createdAt),
        ]),
      ],
    );
  };

  const toggleSuspend = async (userId: string, suspended: boolean) => {
    setBusyId(userId);
    try {
      await suspendUser({ userId: userId as never, suspend: !suspended });
      toast.success(suspended ? "User reactivated" : "User suspended");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="User Management"
        description="Search, filter, and manage platform users."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered?.length} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="vendor">Vendors</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="points-desc">Most points</SelectItem>
            <SelectItem value="points-asc">Least points</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered === undefined ? (
        <AdminSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No users match your filters." hint="Try clearing the search or filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card key={u._id} className="rounded-xl border-slate-200 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-bold text-white">
                  {(u.name || u.email || "U")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/users/${u._id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white">
                    {u.name || "Unnamed"}
                  </Link>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email || "No email"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={u.role === "admin" ? "admin" : u.role === "vendor" ? "vendor" : "user"} />
                  <StatusBadge status={u.isTerminated ? "terminated" : u.isSuspended ? "suspended" : "active"} />
                </div>
                <div className="w-28 shrink-0 text-right">
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {(u.pointsBalance ?? 0).toLocaleString()} pts
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatNgn((u.pointsBalance ?? 0) * ngnPerPoint)}
                  </p>
                </div>
                <p className="hidden w-28 shrink-0 text-xs text-slate-400 md:block">{fmtDate(u.createdAt)}</p>
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/admin/users/${u._id}`}>View</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={u.isSuspended ? "Reactivate user" : "Suspend user"}
                    disabled={busyId === u._id || u.role === "admin"}
                    onClick={() => toggleSuspend(u._id, !!u.isSuspended)}
                  >
                    {u.isSuspended ? <UserCheck className="h-3.5 w-3.5 text-green-600" /> : <UserX className="h-3.5 w-3.5 text-red-500" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Shield className="h-3.5 w-3.5" /> All actions on this page are authorized server-side and recorded in the audit log.
      </p>
    </div>
  );
}
