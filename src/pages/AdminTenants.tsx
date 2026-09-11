import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ban, Flag, Lock, LockOpen, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, ConfirmDialog, fmtDate } from "@/components/admin/shared";

export default function AdminTenants() {
  const tenants = useQuery(api.tenants.adminList, { limit: 300 });
  const flags = useQuery(api.adminApi.listModerationFlags, { limit: 100 });
  const lockdown = useMutation(api.tenants.adminLockdown);
  const unlock = useMutation(api.adminApi.unlockTenant);
  const createFlag = useMutation(api.adminApi.createModerationFlag);
  const reviewFlag = useMutation(api.adminApi.reviewModerationFlag);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locking, setLocking] = useState<null | { id: string; name: string }>(null);
  const [unlocking, setUnlocking] = useState<null | { id: string; name: string }>(null);
  const [flagging, setFlagging] = useState<null | { id: string; name: string }>(null);
  const [flagRule, setFlagRule] = useState("");
  const [flagSeverity, setFlagSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [flagDetails, setFlagDetails] = useState("");
  const [reviewingFlag, setReviewingFlag] = useState<null | { id: string; rule: string }>(null);
  const [reviewStatus, setReviewStatus] = useState<"resolved" | "dismissed">("resolved");
  const [reviewNotes, setReviewNotes] = useState("");

  const tenantName = (id: string) => (tenants ?? []).find((t) => t._id === id)?.siteName ?? "Tenant";

  const filtered = useMemo(() => {
    if (!tenants) return undefined;
    let list = [...tenants];
    if (statusFilter === "active") list = list.filter((t) => t.isActive);
    if (statusFilter === "locked") list = list.filter((t) => !t.isActive);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (t) => t.siteName.toLowerCase().includes(s) || t.subdomain.toLowerCase().includes(s),
      );
    }
    return list;
  }, [tenants, search, statusFilter]);

  const submitFlag = async () => {
    if (!flagging || !flagRule.trim()) {
      toast.error("Rule name is required");
      return;
    }
    try {
      await createFlag({ tenantId: flagging.id as never, rule: flagRule.trim(), severity: flagSeverity, details: flagDetails || undefined });
      toast.success("Flag created");
      setFlagging(null);
      setFlagRule("");
      setFlagDetails("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const submitFlagReview = async () => {
    if (!reviewingFlag || reviewNotes.trim().length < 5) {
      toast.error("Review notes of at least 5 characters are required");
      return;
    }
    try {
      await reviewFlag({ flagId: reviewingFlag.id as never, status: reviewStatus, reviewNotes: reviewNotes.trim() });
      toast.success(`Flag ${reviewStatus}`);
      setReviewingFlag(null);
      setReviewNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Business Tenant Management" description="Global tenant oversight, moderation, and lockdown controls." />

      {/* Moderation flags */}
      <Card className="rounded-xl border-amber-200 dark:border-amber-900">
        <CardContent className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Moderation flags
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Rule-based flags on tenant sites. Automated rules assist review but are not guaranteed to detect all fraud or malicious activity.
          </p>
          {flags === undefined ? (
            <p className="mt-3 animate-pulse text-sm text-slate-400">Loading flags…</p>
          ) : flags.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No flags open.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {flags.map((f) => (
                <div key={f._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {tenantName(f.tenantId)} — {f.rule}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      Severity: {f.severity} · {f.details || "no details"} · {fmtDate(f.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={f.status} />
                  {f.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => setReviewingFlag({ id: f._id, rule: f.rule })}>
                      Review
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search tenants…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered === undefined ? (
        <AdminSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <AdminEmpty message="No tenants match." />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Card key={t._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{t.siteName}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {t.subdomain} · {t.siteType} · renews {fmtDate(t.renewalDate)}
                  </p>
                </div>
                <StatusBadge status={t.isActive ? "active" : "locked"} />
                <div className="flex shrink-0 gap-1">
                  {t.isActive ? (
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => setLocking({ id: t._id, name: t.siteName })}>
                      <Lock className="mr-1 h-3 w-3" /> Lock
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setUnlocking({ id: t._id, name: t.siteName })}>
                      <LockOpen className="mr-1 h-3 w-3" /> Unlock
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setFlagging({ id: t._id, name: t.siteName })} aria-label={`Flag ${t.siteName}`}>
                    <Flag className="h-3.5 w-3.5 text-amber-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lock confirmation */}
      {locking && (
        <ConfirmDialog
          open
          onClose={() => setLocking(null)}
          onConfirm={async (reason) => {
            try {
              await lockdown({ tenantId: locking.id as never, reason });
              toast.success("Tenant locked down");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Operation failed");
              throw e;
            }
          }}
          title="One-click tenant lockdown"
          description="The public tenant site shows a maintenance page, tenant users cannot perform restricted operations, and existing data is preserved. Fully reversible via Unlock."
          resource={locking.name}
          actionLabel="Lock tenant"
        />
      )}

      {unlocking && (
        <ConfirmDialog
          open
          onClose={() => setUnlocking(null)}
          onConfirm={async (reason) => {
            try {
              await unlock({ tenantId: unlocking.id as never, reason });
              toast.success("Tenant unlocked");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Operation failed");
              throw e;
            }
          }}
          title="Unlock tenant"
          description="Restores public access and tenant operations."
          resource={unlocking.name}
          actionLabel="Unlock"
          destructive={false}
        />
      )}

      {/* Flag creation */}
      <Dialog open={!!flagging} onOpenChange={(o) => !o && setFlagging(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Flag tenant — {flagging?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="flag-rule">Rule / indicator</Label>
              <Input id="flag-rule" value={flagRule} onChange={(e) => setFlagRule(e.target.value)} placeholder="e.g. suspicious_content, domain_misuse" />
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={flagSeverity} onValueChange={(v) => setFlagSeverity(v as typeof flagSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flag-details">Details</Label>
              <Textarea id="flag-details" value={flagDetails} onChange={(e) => setFlagDetails(e.target.value)} rows={3} placeholder="What did you observe?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagging(null)}>Cancel</Button>
            <Button onClick={submitFlag}><Flag className="mr-1 h-4 w-4" /> Create flag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flag review */}
      <Dialog open={!!reviewingFlag} onOpenChange={(o) => !o && setReviewingFlag(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review flag — {reviewingFlag?.rule}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <Select value={reviewStatus} onValueChange={(v) => setReviewStatus(v as typeof reviewStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolved (action taken)</SelectItem>
                  <SelectItem value="dismissed">Dismissed (false positive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review-notes">Review notes (required)</Label>
              <Textarea id="review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewingFlag(null)}>Cancel</Button>
            <Button onClick={submitFlagReview}><Ban className="mr-1 h-4 w-4" /> Submit review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
