import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Shield, UserX, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export default function AdminUsers() {
  const users = useQuery(api.admin.listUsers, {});
  const suspendUser = useMutation(api.admin.suspendUser);
  const terminateUser = useMutation(api.admin.terminateUser);
  const [search, setSearch] = useState("");
  const [adjustDialog, setAdjustDialog] = useState<{ userId: string; name: string } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const adminAdjust = useMutation(api.points.adminAdjust);

  const filtered = (users ?? []).filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const handleAdjust = async () => {
    if (!adjustDialog) return;
    const amount = parseInt(adjustAmount);
    if (isNaN(amount) || amount === 0) { toast.error("Enter a valid amount"); return; }
    if (!adjustReason.trim()) { toast.error("Reason is required"); return; }
    try {
      await adminAdjust({ userId: adjustDialog.userId as any, amount, reason: adjustReason });
      toast.success("Points adjusted!");
      setAdjustDialog(null);
      setAdjustAmount("");
      setAdjustReason("");
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">User Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage platform users, suspensions, and point adjustments.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered === undefined ? (
          <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading users...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
        ) : (
          filtered.map((u) => (
            <Card key={u._id} className="notebook-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 text-sm font-bold text-blue-700 dark:text-blue-300">
                  {u.name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--nb-ink)] truncate">{u.name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email || "No email"}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant={u.role === "admin" ? "default" : u.role === "vendor" ? "secondary" : "outline"} className="text-[10px] capitalize">{u.role || "user"}</Badge>
                  {u.isSuspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                </div>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 shrink-0">{(u.pointsBalance ?? 0).toLocaleString()} pts</p>
                <div className="flex gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setAdjustDialog({ userId: u._id, name: u.name || u.email || "User" })}>Adjust Points</Button>
                  <Button variant="outline" size="sm" onClick={async () => { await suspendUser({ userId: u._id as any, suspend: !u.isSuspended }); toast.success(u.isSuspended ? "Unsuspended" : "Suspended"); }}>
                    {u.isSuspended ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Adjust Points Dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={() => setAdjustDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Points — {adjustDialog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium">Amount (positive to credit, negative to debit)</label><Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="e.g. 500 or -200" className="mt-1" /></div>
            <div><label className="text-sm font-medium">Reason (required)</label><Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Why is this adjustment being made?" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(null)}>Cancel</Button>
            <Button onClick={handleAdjust}>Apply Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
