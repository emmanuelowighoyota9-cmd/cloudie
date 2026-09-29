import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { formatNgn } from "@/lib/pricing";
import {
  maskIdentifier,
  validatePhone,
  vtuStatusCopy,
  vtuStatusReasonCopy,
  type VtuVisibleStatus,
} from "@/lib/vtu";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

/** Display names for the four Nigerian networks. */
const NETWORKS = [
  { key: "mtn", label: "MTN" },
  { key: "airtel", label: "Airtel" },
  { key: "glo", label: "Glo" },
  { key: "9mobile", label: "9mobile" },
] as const;

const AMOUNTS = [100, 200, 500, 1000, 2000, 5000] as const;

/**
 * Tone and icon per status.
 *
 * The WORDS are not here — they come from `vtuStatusCopy` in `@/lib/vtu`, so
 * this page and the history page describe a status identically. Typing the map
 * on `VtuVisibleStatus` (which excludes `failed`) means there is no entry to
 * add for a state a client can never observe, and no fallback wording to
 * accidentally show in its place.
 */
const STATUS_TONE: Record<
  VtuVisibleStatus,
  { tone: string; icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    tone: "text-muted-foreground border-border bg-muted/50",
    icon: Clock,
  },
  processing: {
    tone: "text-sky-700 dark:text-sky-400 border-sky-500/25 bg-sky-500/10",
    icon: Loader2,
    spin: true,
  },
  confirmed: {
    tone: "text-emerald-700 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  reversed: {
    tone: "text-muted-foreground border-border bg-muted/50",
    icon: CheckCircle2,
  },
  unknown: {
    tone: "text-amber-700 dark:text-amber-400 border-amber-500/25 bg-amber-500/10",
    icon: HelpCircle,
  },
  unresolved: {
    tone: "text-amber-700 dark:text-amber-400 border-amber-500/25 bg-amber-500/10",
    icon: HelpCircle,
  },
};

export default function VtuAirtime() {
  // The catalog deep-links here with the network it selected. Validated against
  // the known list so a hand-edited URL cannot preselect something the purchase
  // path would then refuse.
  const [searchParams] = useSearchParams();
  const requestedNetwork = searchParams.get("network");
  const [network, setNetwork] = useState<string>(
    NETWORKS.some((n) => n.key === requestedNetwork) ? requestedNetwork! : "mtn",
  );
  const [amount, setAmount] = useState<number>(1000);
  const [phone, setPhone] = useState("");
  const [transactionId, setTransactionId] = useState<Id<"vtuTransactions"> | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const offers = useQuery(api.vtu.getAirtimeOffers, {});
  const balance = useQuery(api.points.getBalance);
  const purchase = useAction(api.vtuHttp.purchaseAirtime);

  // SUBSCRIBE to the record. This is the source of truth for what the page
  // shows — not the action's return value, which reflects only what the record
  // said at the moment the call returned.
  const tx = useQuery(
    api.vtuInternal.getTransaction,
    transactionId ? { transactionId } : "skip",
  );

  const serviceCode = `airtime.${network}.${amount}`;
  const selected = useMemo(
    () => offers?.offers.find((o) => o.serviceCode === serviceCode) ?? null,
    [offers, serviceCode],
  );

  const phoneCheck = useMemo(() => validatePhone(phone), [phone]);
  const affordable = (balance ?? 0) >= (selected?.points ?? 0);
  const inFlight = tx ? tx.status === "pending" || tx.status === "processing" : false;

  async function handleSubmit() {
    if (submitting || !selected) return;
    const check = validatePhone(phone);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    setSubmitting(true);
    // Generated once per attempt. Any retry of THIS attempt reuses it, so a
    // double-click or a flaky connection cannot buy two top-ups.
    const clientRequestId = `vtu_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    try {
      const result = await purchase({
        clientRequestId,
        serviceCode,
        customerIdentifier: check.value,
      });
      setTransactionId(result.transactionId ?? null);

      // Deliberately NOT a success toast. The record decides.
      if (result.reused) toast.info("Resuming your earlier attempt…");
      else toast.success("Top-up submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-gutter mx-auto w-full max-w-5xl space-y-8 py-10 sm:py-14">
      <Reveal>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Airtime top-up
            </h1>
            <Badge variant="secondary" className="gap-1.5">
              <Radio className="h-3 w-3" />
              Instant top-up
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Buy airtime for any Nigerian number using your points balance. A
            top-up that does not go through returns your points automatically.
          </p>
          <Link
            to="/vtu"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All services
          </Link>
        </div>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Reveal>
            <div className="space-y-3">
              <Label>Network</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {NETWORKS.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => setNetwork(n.key)}
                    aria-pressed={network === n.key}
                    className={cn(
                      "interactive-card min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      network === n.key
                        ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="space-y-3">
              <Label>Amount</Label>
              <StaggerGroup className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AMOUNTS.map((n) => {
                  const offer = offers?.offers.find(
                    (o) => o.serviceCode === `airtime.${network}.${n}`,
                  );
                  const active = amount === n;
                  return (
                    <StaggerItem key={n}>
                      <button
                        type="button"
                        onClick={() => setAmount(n)}
                        aria-pressed={active}
                        className={cn(
                          "interactive-card min-h-16 w-full rounded-lg border p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border bg-card hover:bg-muted/50",
                        )}
                      >
                        <p className="text-sm font-semibold tabular-nums">
                          {formatNgn(n)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {offer ? `${offer.points} pts` : "…"}
                        </p>
                      </button>
                    </StaggerItem>
                  );
                })}
              </StaggerGroup>
              {selected?.override && (
                <p className="text-xs text-muted-foreground">
                  This amount has an admin-set price override.
                </p>
              )}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <Card className="lg:sticky lg:top-24">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">Purchase</h2>
                <p className="text-sm text-muted-foreground">
                  Balance{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {(balance ?? 0).toLocaleString()} pts
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vtu-phone">Phone number</Label>
                <Input
                  id="vtu-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0803 123 4567"
                  inputMode="tel"
                  autoComplete="off"
                  disabled={inFlight}
                  className="min-h-11"
                  aria-invalid={phone.length > 0 && !phoneCheck.ok}
                />
                {phone.length > 0 && !phoneCheck.ok ? (
                  <p className="text-xs text-destructive">{phoneCheck.error}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The airtime is sent to this number.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                {selected ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Product</span>
                      <span className="text-right font-medium">
                        {NETWORKS.find((n) => n.key === network)?.label} airtime
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Pays</span>
                      <span className="text-right font-medium">
                        {formatNgn(selected.amountNgn)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
                      <span className="font-medium">Cost</span>
                      <span className="text-right text-base font-semibold tabular-nums">
                        {selected.points.toLocaleString()} pts
                      </span>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="h-20" />
                )}
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting || inFlight || !selected || !phoneCheck.ok || !affordable}
                className="min-h-11 w-full"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : selected ? (
                  `Pay ${selected.points.toLocaleString()} pts`
                ) : (
                  "Loading…"
                )}
              </Button>

              {selected && !affordable && (
                <p className="text-xs text-destructive">
                  You need {(selected.points - (balance ?? 0)).toLocaleString()}{" "}
                  more points.
                </p>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>

      {tx && (
        <Reveal>
          <Card>
            <CardContent className="p-6">
              {(() => {
                // No fallback: a status we have no wording for (including the
                // non-observable `failed`) renders the details and no banner,
                // rather than borrowing another status's wording.
                const copy = vtuStatusCopy(tx.status);
                if (!copy) return null;
                const view = STATUS_TONE[copy.status];
                const Icon = view.icon;
                const reason = vtuStatusReasonCopy(tx);
                return (
                  <div className="space-y-3">
                    <div
                      className={cn("flex items-start gap-3 rounded-lg border p-4", view.tone)}
                      role="status"
                      aria-live="polite"
                    >
                      <Icon
                        className={cn("mt-0.5 h-4 w-4 shrink-0", view.spin && "animate-spin")}
                      />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{copy.label}</p>
                        <p className="text-sm opacity-90">{copy.detail}</p>
                        {reason && (
                          <p className="text-xs opacity-80">{reason}</p>
                        )}
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-muted-foreground">Product</dt>
                        <dd className="font-medium">{tx.serviceCode}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Number</dt>
                        <dd className="font-medium tabular-nums">
                          {maskIdentifier(tx.customerIdentifier)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Points</dt>
                        <dd className="font-medium tabular-nums">
                          {tx.pointsDebited.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Rate used</dt>
                        <dd className="font-medium tabular-nums">
                          {tx.ngnPerPoint} naira/pt
                        </dd>
                      </div>
                    </dl>

                    {tx.providerReference && (
                      <p className="break-anywhere text-xs text-muted-foreground">
                        Reference: <span className="font-mono">{tx.providerReference}</span>
                      </p>
                    )}
                    {tx.failureReason && (
                      <p className="break-anywhere text-xs text-muted-foreground">
                        {tx.failureReason}
                      </p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </Reveal>
      )}
    </div>
  );
}
