import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Coins, KeyRound, Shield, Users } from "lucide-react";
import { Link } from "react-router";
import {
  StatusBadge,
  ConfirmDialog,
  AdminEmpty,
  AdminSkeleton,
  fmtDate,
} from "@/components/admin/shared";

export default function AdminUserDetail() {
  const { id } = useParams();
  const detail = useQuery(
    api.adminApi.adminUserDetail,
    id ? { userId: id as never } : "skip",
  );

  const suspendUser = useMutation(api.admin.suspendUser);
  const terminateUser = useMutation(api.adminApi.terminateUser);
  const changeRole = useMutation(api.adminApi.changeUserRole);
  const adminAdjust = useMutation(api.points.adminAdjust);

  const [action, setAction] = useState<null | { kind: "suspend" | "reactivate" | "terminate" | "role" | "credit" | "debit"; label: string }>(null);
  const [amount, setAmount] = useState("");
  const [nextRole, setNextRole] = useState<"user" | "vendor" | "admin">("user");

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <AdminSkeleton rows={4} />
      </div>
    );
  }
  if (detail === null) {
    return <AdminEmpty message="User not found." hint="They may have been deleted, or you lack access." />;
  }

  const { user, wallet, ledger, shipments, documents, orders, notifications, audit, sessions, referralsSent, referralsReceived } = detail;
  const status = user.isTerminated ? "terminated" : user.isSuspended ? "suspended" : "active";

  const runAction = async (reason: string) => {
    if (!action) return;
    try {
      if (action.kind === "suspend") {
        await suspendUser({ userId: user._id, suspend: true, reason });
        toast.success("User suspended");
      } else if (action.kind === "reactivate") {
        await suspendUser({ userId: user._id, suspend: false, reason });
        toast.success("User reactivated");
      } else if (action.kind === "terminate") {
        await terminateUser({ userId: user._id, reason });
        toast.success("User terminated");
      } else if (action.kind === "role") {
        await changeRole({ userId: user._id, role: nextRole });
        toast.success(`Role changed to ${nextRole}`);
      } else if (action.kind === "credit") {
        const n = Number(amount);
        if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a positive amount");
        await adminAdjust({ userId: user._id, amount: n, reason });
        toast.success(`Credited ${n.toLocaleString()} points`);
        setAmount("");
      } else if (action.kind === "debit") {
        const n = Number(amount);
        if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a positive amount");
        await adminAdjust({ userId: user._id, amount: -n, reason });
        toast.success(`Deducted ${n.toLocaleString()} points`);
        setAmount("");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/users" aria-label="Back to users"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{user.name || "Unnamed user"}</h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email || "No email"}</p>
        </div>
        <div className="flex gap-1.5">
          <StatusBadge status={user.role ?? "user"} />
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Points balance</p>
            <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{(user.pointsBalance ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total credited</p>
            <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-green-600">
              <ArrowUpRight className="h-4 w-4" />{wallet.totalCredited.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total debited</p>
            <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-red-600">
              <ArrowDownRight className="h-4 w-4" />{wallet.totalDebited.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Registered</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{fmtDate(user.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Administration actions */}
      <Card className="rounded-xl border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-blue-600" /> Administration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!user.isSuspended ? (
            <Button variant="outline" onClick={() => setAction({ kind: "suspend", label: "Suspend user" })}>
              Suspend
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setAction({ kind: "reactivate", label: "Reactivate user" })}>
              Reactivate
            </Button>
          )}
          <Button variant="destructive" onClick={() => setAction({ kind: "terminate", label: "Terminate account" })} disabled={user.role === "admin" || user.isTerminated}>
            Terminate
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setNextRole(user.role === "vendor" ? "user" : "vendor");
              setAction({ kind: "role", label: "Change role" });
            }}
            disabled={user.role === "admin"}
          >
            Change role to {user.role === "vendor" ? "user" : "vendor"}
          </Button>
          <Button variant="outline" className="text-green-700" onClick={() => setAction({ kind: "credit", label: "Credit points" })}>
            <Coins className="mr-1 h-4 w-4" /> Credit
          </Button>
          <Button variant="outline" className="text-red-700" onClick={() => setAction({ kind: "debit", label: "Deduct points" })}>
            <Coins className="mr-1 h-4 w-4" /> Deduct
          </Button>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="shipments">Shipments ({shipments.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="notifications">Notifications ({notifications.length})</TabsTrigger>
          <TabsTrigger value="security">Security ({sessions.length})</TabsTrigger>
          <TabsTrigger value="referrals">Referrals ({referralsSent.length + referralsReceived.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit ({audit.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-4">
          {ledger.length === 0 ? (
            <AdminEmpty message="No ledger entries." />
          ) : (
            <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
              {ledger.map((l) => (
                <div key={l._id} className="flex items-center gap-3 p-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${l.amount > 0 ? "bg-green-100 text-green-600 dark:bg-green-900/50" : "bg-red-100 text-red-600 dark:bg-red-900/50"}`}>
                    {l.amount > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{l.description}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(l.createdAt)} · {l.type}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${l.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                    {l.amount > 0 ? "+" : ""}{l.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shipments" className="mt-4">
          {shipments.length === 0 ? <AdminEmpty message="No shipments." /> : (
            <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
              {shipments.map((s) => (
                <div key={s._id} className="flex items-center gap-3 p-3">
                  <Link to={`/admin/shipments?tracking=${s.trackingNumber}`} className="flex-1 truncate font-mono text-sm text-blue-600 hover:underline">
                    {s.trackingNumber}
                  </Link>
                  <StatusBadge status={s.status} />
                  <span className="text-xs text-slate-400">{fmtDate(s.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {documents.length === 0 ? <AdminEmpty message="No documents." /> : (
            <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
              {documents.map((d) => (
                <div key={d._id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{d.title}</p>
                    <p className="text-[11px] capitalize text-slate-400">{d.type} · {d.pointsCost} pts</p>
                  </div>
                  <span className="text-xs text-slate-400">{fmtDate(d.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {orders.length === 0 ? <AdminEmpty message="No orders." /> : (
            <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
              {orders.map((o) => (
                <div key={o._id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-slate-500">{o._id}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(o.createdAt)}</p>
                  </div>
                  <span className="text-sm font-semibold">{o.totalPoints.toLocaleString()} pts</span>
                  <StatusBadge status={o.status} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          {notifications.length === 0 ? <AdminEmpty message="No notifications." /> : (
            <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
              {notifications.map((n) => (
                <div key={n._id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                    <p className="truncate text-[11px] text-slate-400">{n.message}</p>
                  </div>
                  {!n.isRead && <Badge variant="secondary" className="shrink-0 text-[10px]">New</Badge>}
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(n.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <KeyRound className="h-4 w-4 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Active sessions</p>
                <p className="text-[11px] text-slate-400">Non-expired authentication sessions (login events appear in the Audit tab).</p>
              </div>
            </div>
            {sessions.length === 0 ? (
              <AdminEmpty message="No active sessions." />
            ) : (
              <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
                {sessions.map((s) => (
                  <div key={s._id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-900 dark:text-white">{s._id}</p>
                      <p className="text-[11px] text-slate-400">Started {fmtDate(s.createdAt)} · expires {fmtDate(s.expiresAt)}</p>
                    </div>
                    <StatusBadge status="active" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Users className="h-3.5 w-3.5" /> Referred users ({referralsSent.length})
              </p>
              {referralsSent.length === 0 ? (
                <AdminEmpty message="No referrals sent." />
              ) : (
                <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
                  {referralsSent.map((r) => (
                    <div key={r._id} className="flex items-center gap-3 p-3">
                      <Link to={`/admin/users/${r.referredUserId}`} className="min-w-0 flex-1 truncate font-mono text-xs text-blue-600 hover:underline">
                        {r.referredUserId}
                      </Link>
                      <span className="shrink-0 text-xs font-semibold text-green-600">+{r.rewardPoints} pts</span>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Referred by ({referralsReceived.length})</p>
              {referralsReceived.length === 0 ? (
                <AdminEmpty message="Not referred by anyone." />
              ) : (
                <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
                  {referralsReceived.map((r) => (
                    <div key={r._id} className="flex items-center gap-3 p-3">
                      <Link to={`/admin/users/${r.referrerId}`} className="min-w-0 flex-1 truncate font-mono text-xs text-blue-600 hover:underline">
                        {r.referrerId}
                      </Link>
                      <span className="shrink-0 text-xs font-semibold text-green-600">+25 pts bonus</span>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          {audit.length === 0 ? <AdminEmpty message="No audit records." /> : (
            <div className="divide-y rounded-xl border border-slate-200 dark:border-slate-700">
              {audit.map((a) => (
                <div key={a._id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium text-slate-900 dark:text-white">{a.action}</p>
                    <p className="truncate text-[11px] text-slate-400">{a.resource}{a.reason ? ` — ${a.reason}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Destructive action confirmations */}
      {action && (action.kind === "credit" || action.kind === "debit") ? (
        <ConfirmDialog
          open
          onClose={() => { setAction(null); }}
          onConfirm={runAction}
          title={action.label}
          description={
            action.kind === "credit"
              ? "Credits points to this user's wallet via an immutable ledger entry."
              : "Deducts points from this user's wallet via an immutable ledger entry. Fails if it would make the balance negative."
          }
          resource={`${user.name || user.email} — current balance ${(user.pointsBalance ?? 0).toLocaleString()} pts`}
          actionLabel={action.kind === "credit" ? "Credit points" : "Deduct points"}
          destructive={action.kind === "debit"}
          extraField={{
            label: "Amount (points)",
            value: amount,
            onChange: setAmount,
            type: "number",
            placeholder: "e.g. 500",
          }}
        />
      ) : action ? (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          onConfirm={runAction}
          title={action.label}
          description={
            action.kind === "terminate"
              ? "Permanently terminates this account. The user loses access and cannot be unsuspended normally."
              : action.kind === "role"
                ? `Changes the user's role to ${nextRole}. Role changes are audited.`
                : action.kind === "suspend"
                  ? "Blocks the user from performing restricted operations."
                  : "Restores the user's access."
          }
          resource={user.name || user.email || undefined}
          actionLabel={action.label}
          destructive={action.kind === "terminate" || action.kind === "suspend"}
          requireReason={action.kind !== "role"}
          minReasonLength={5}
        />
      ) : null}
    </div>
  );
}
