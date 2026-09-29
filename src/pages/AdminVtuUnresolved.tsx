import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminPageHeader, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HelpCircle,
  Loader2,
  ServerCrash,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

/**
 * The unresolved queue: transactions reconciliation could not settle.
 *
 * The screen's job is to make a hard decision possible rather than fast.
 * Every row says WHY it is here, what we asked the provider, and what came
 * back, because the two actions differ only in a fact about the world — did
 * the top-up land? — that no default can answer. The system's answer when it
 * cannot tell is to do nothing to the money; the human's answer is one of two
 * buttons, both of which route through `settleTransaction` on the server, so a
 * row someone else already settled simply no-ops instead of paying twice.
 *
 * Nothing here shows a credential: `rawRequest` / `rawResponse` were
 * sanitised on write, and no query in this path returns a sealed value.
 */

type UnresolvedRow = {
  _id: string;
  status: string;
  unresolvedReason: "max_attempts_exceeded" | "provider_unreachable" | "never_dispatched" | null;
  failureReason: string | null;
  source: string | null;
  provider: string;
  providerReference: string | null;
  serviceCode: string;
  network: string | null;
  customerIdentifier: string;
  amountNgn: number | null;
  pointsDebited: number;
  ngnPerPoint: number;
  reconcileAttempts: number;
  lastReconcileAt: number | null;
  rawRequest: unknown;
  rawResponse: unknown;
  createdAt: number;
  updatedAt: number;
  user: { name: string | null; email: string | null } | null;
};

/**
 * The three reasons, in the operator's terms rather than the enum's.
 *
 * The guidance is deliberately asymmetric: `never_dispatched` says a refund is
 * almost always right because nothing was ever sent, while the other two warn
 * that the top-up may still have landed. Copy that treats the two the same
 * would push an operator toward the wrong answer on the one case where the
 * answer is usually obvious.
 */
const REASONS: Record<
  NonNullable<UnresolvedRow["unresolvedReason"]>,
  { label: string; icon: typeof Ban; hint: string; className: string }
> = {
  never_dispatched: {
    label: "Never dispatched",
    icon: Ban,
    hint: "No provider call was ever made — our dispatch path failed before the request went out, so nothing can have been delivered. A refund is almost always correct here; confirm only if you can see the top-up somewhere else.",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  max_attempts_exceeded: {
    label: "Poll limit reached",
    icon: Clock3,
    hint: "The provider was polled the maximum number of times and never gave a terminal verdict. The top-up may still have landed — refund only if you have evidence it did not.",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  provider_unreachable: {
    label: "Provider unreachable",
    icon: ServerCrash,
    hint: "The provider could not be asked — no reference was recorded, no adapter is registered, or the credential will not open. The transaction has no way to settle on its own.",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
};

function PrettyJson({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground/70">Nothing recorded.</p>
      </div>
    );
  }
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-44 overflow-auto rounded-md border border-border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-foreground/80">
        {text}
      </pre>
    </div>
  );
}

export function AdminVtuUnresolved() {
  const rows = useQuery(api.vtuUnresolvedAdmin.listUnresolved);
  const confirmDelivered = useMutation(api.vtuUnresolvedAdmin.confirmDelivered);
  const refundCustomer = useMutation(api.vtuUnresolvedAdmin.refundCustomer);

  const [pending, setPending] = useState<
    { row: UnresolvedRow; kind: "confirm" | "refund" } | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const ask = (row: UnresolvedRow, kind: "confirm" | "refund") =>
    setPending({ row, kind });

  async function run() {
    if (!pending) return;
    const { row, kind } = pending;
    setBusy(row._id + kind);
    try {
      if (kind === "confirm") {
        const result = await confirmDelivered({ transactionId: row._id as any });
        if (result.settled) toast.success("Marked as delivered");
        else
          toast.info(
            result.reason === "already_terminal"
              ? "Already settled by another path — nothing changed"
              : "Nothing changed",
          );
      } else {
        const result = await refundCustomer({ transactionId: row._id as any });
        if (result.settled)
          toast.success(`Refunded ${row.pointsDebited} points to the customer`);
        else
          toast.info(
            result.reason === "already_terminal"
              ? "Already settled by another path — no refund issued"
              : "No refund issued",
          );
      }
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const counts = rows?.reduce(
    (acc, row) => {
      if (row.unresolvedReason) acc[row.unresolvedReason] += 1;
      return acc;
    },
    { never_dispatched: 0, max_attempts_exceeded: 0, provider_unreachable: 0 },
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Unresolved transactions"
        description="Purchases reconciliation could not settle. Points stay debited until an operator decides — nothing here is refunded automatically."
      />

      {rows === undefined ? (
        <AdminSkeleton />
      ) : rows.length === 0 ? (
        <Reveal>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <p className="text-sm font-medium">Queue is empty</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Every stuck transaction was settled by its webhook or by the
                reconciliation sweep. Anything the sweep cannot answer will
                appear here with its request, its response, and two ways out.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(REASONS) as Array<keyof typeof REASONS>).map((key) => {
                const reason = REASONS[key];
                const Icon = reason.icon;
                return (
                  <Card key={key}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                          reason.className,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold leading-none">
                          {counts?.[key] ?? 0}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {reason.label}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </Reveal>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const reasonKey = row.unresolvedReason ?? "provider_unreachable";
              const reason = REASONS[reasonKey];
              const Icon = reason.icon;
              const isOpen = expanded === row._id;
              const isBusy = busy?.startsWith(row._id);

              return (
                <Reveal key={row._id} delay={Math.min(index * 0.05, 0.3)}>
                  <Card>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium">{row.serviceCode}</h3>
                            <Badge variant="outline" className={cn(reason.className)}>
                              <Icon className="mr-1 h-3 w-3" />
                              {reason.label}
                            </Badge>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {row.provider}
                            </code>
                            {row.providerReference ? (
                              <Badge
                                variant="outline"
                                className="border-border text-muted-foreground"
                              >
                                ref {row.providerReference}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-destructive/30 text-destructive"
                              >
                                no reference
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {row.customerIdentifier}
                            {row.user?.email ? ` · ${row.user.email}` : ""}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">
                            {row.pointsDebited} points
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.amountNgn !== null ? `₦${row.amountNgn.toLocaleString()} · ` : ""}
                            {row.ngnPerPoint} ₦/pt
                          </p>
                        </div>
                      </div>

                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {reason.hint}
                      </p>

                      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Escalated</dt>
                          <dd className="text-right">{fmtDate(row.updatedAt)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Purchased</dt>
                          <dd className="text-right">{fmtDate(row.createdAt)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Polls used</dt>
                          <dd className="text-right">
                            {row.reconcileAttempts}
                            {row.lastReconcileAt
                              ? ` · last ${fmtDate(row.lastReconcileAt)}`
                              : " · never polled"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Escalated by</dt>
                          <dd className="text-right">{row.source ?? "—"}</dd>
                        </div>
                      </dl>

                      {row.failureReason && (
                        <p className="rounded-md border border-border bg-muted/40 p-2.5 text-xs leading-relaxed text-foreground/80">
                          {row.failureReason}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : row._id)}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
                        aria-expanded={isOpen}
                      >
                        Request &amp; response
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>

                      {isOpen && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <PrettyJson value={row.rawRequest} label="Outbound request" />
                          <PrettyJson value={row.rawResponse} label="Received response" />
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                        <Button
                          size="sm"
                          onClick={() => ask(row, "confirm")}
                          disabled={isBusy}
                          className="min-h-11 gap-2"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirm delivered
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => ask(row, "refund")}
                          disabled={isBusy}
                          className="min-h-11 gap-2 text-destructive hover:bg-destructive/10"
                        >
                          <Undo2 className="h-4 w-4" />
                          Refund customer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </>
      )}

      <Reveal>
        <Card className="border-muted">
          <CardContent className="flex items-start gap-3 p-5">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              A transaction stays here until one of the two actions is taken —
              the sweep will not reverse it, because a provider that has not
              confirmed failure may still have delivered the top-up. Refunding
              therefore risks paying twice, which is why the decision is yours
              and every choice is written to the audit log.
            </p>
          </CardContent>
        </Card>
      </Reveal>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "refund"
                ? `Refund ${pending.row.pointsDebited} points?`
                : "Confirm this top-up was delivered?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {pending?.kind === "refund"
                  ? "The customer keeps any airtime they received and also gets their points back. This cannot be undone from this screen."
                  : "The points stay debited and the transaction closes as delivered. No refund will be issued."}
              </span>
              {pending && (
                <span className="block text-sm text-foreground">
                  {pending.row.serviceCode} · {pending.row.customerIdentifier} ·{" "}
                  {pending.row.pointsDebited} points
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busy)}>Cancel</AlertDialogCancel>
            <Button
              onClick={run}
              disabled={Boolean(busy)}
              variant={pending?.kind === "refund" ? "destructive" : "default"}
              className="gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending?.kind === "refund" ? "Refund customer" : "Confirm delivered"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminVtuUnresolved;
