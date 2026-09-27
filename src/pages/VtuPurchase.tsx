import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { usePricing, formatNgn } from "@/lib/pricing";
import { maskIdentifier, validateCustomerIdentifier } from "@/lib/vtu";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  Tv,
  TvIcon,
  Zap,
  Bolt,
  GraduationCap,
  Dices,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

/** Service types, in the order they appear in the tab strip. */
const SERVICES = [
  { key: "airtime", label: "Airtime", icon: Radio },
  { key: "data", label: "Data", icon: Zap },
  { key: "cable", label: "Cable", icon: Tv },
  { key: "electricity", label: "Electricity", icon: Bolt },
  { key: "exam", label: "Exam PINs", icon: GraduationCap },
  { key: "betting", label: "Betting", icon: Dices },
] as const;

type ServiceKey = (typeof SERVICES)[number]["key"];

/** Input hint per service, since a meter number is not a phone number. */
const IDENTIFIER_HINT: Record<ServiceKey, { label: string; placeholder: string; help: string }> = {
  airtime: {
    label: "Phone number",
    placeholder: "0803 123 4567",
    help: "The number the airtime is sent to.",
  },
  data: {
    label: "Phone number",
    placeholder: "0803 123 4567",
    help: "The number the data bundle is activated on.",
  },
  cable: {
    label: "Smartcard number",
    placeholder: "1234 5678 9012",
    help: "Printed on your DStv, GOtv or StarTimes card.",
  },
  electricity: {
    label: "Meter number",
    placeholder: "4512 3456 7890",
    help: "The prepaid meter number on your bill.",
  },
  exam: {
    label: "Candidate number",
    placeholder: "1234567890",
    help: "Your WAEC, JAMB or NECO candidate number.",
  },
  betting: {
    label: "Betting user ID",
    placeholder: "B9 123 456",
    help: "Your account ID with the betting operator.",
  },
};

const STATUS_TONE: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  processing: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  reversed: "bg-muted text-muted-foreground border-border",
};

/**
 * Human wording for a status.
 *
 * `pending` is the one that needs care: it means the aggregator's answer is
 * genuinely unknown, not that the top-up failed. Telling a customer their
 * airtime failed when it may have been delivered would be a lie, and telling
 * them it succeeded when it may not have been is worse.
 */
function statusLabel(status: string): string {
  switch (status) {
    case "success":
      return "Delivered";
    case "pending":
      return "Awaiting confirmation";
    case "processing":
      return "Processing";
    case "reversed":
      return "Refunded to points";
    default:
      return "Failed — points returned";
  }
}

export default function VtuPurchase() {
  const [service, setService] = useState<ServiceKey>("airtime");
  const [productCode, setProductCode] = useState<string>("");
  const [identifier, setIdentifier] = useState("");
  const [pinCount, setPinCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{
    requestId: string;
    status: string;
    reference?: string | null;
  } | null>(null);

  const catalog = useQuery(api.vtuInternal.listCatalog, { serviceType: service });
  const history = useQuery(api.vtuInternal.listMyTransactions, { limit: 8 });
  const balance = useQuery(api.points.getBalance);
  const runPurchase = useAction(api.vtuHttp.runPurchase);
  const { ngnPerPoint } = usePricing();

  const hint = IDENTIFIER_HINT[service];
  const selected = useMemo(
    () => (catalog ?? []).find((p) => p.productCode === productCode) ?? null,
    [catalog, productCode],
  );

  const identifierCheck = useMemo(
    () => validateCustomerIdentifier(service, identifier),
    [service, identifier],
  );

  const canSubmit =
    !!selected &&
    identifier.length > 0 &&
    identifierCheck.ok &&
    !submitting &&
    (balance ?? 0) >= (selected?.points ?? 0);

  async function handlePurchase() {
    if (!selected || submitting) return;

    const validation = validateCustomerIdentifier(service, identifier);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    if ((balance ?? 0) < selected.points) {
      toast.error("Not enough points for this purchase");
      return;
    }

    setSubmitting(true);
    // Generated once per attempt and reused by any retry, so a double-click or
    // a network retry can never buy two top-ups for one charge.
    const requestId = `vtu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      const result = await runPurchase({
        requestId,
        serviceType: service,
        productCode: selected.productCode,
        customerIdentifier: validation.value,
        ...(service === "exam" ? { pinCount } : {}),
      });

      setReceipt({
        requestId: result.requestId,
        status: result.status,
        reference: null,
      });

      if (result.status === "success") {
        toast.success(`${selected.name} delivered`);
      } else if (result.status === "reversed") {
        toast.info("Purchase failed — your points have been returned");
      } else if (result.status === "pending") {
        toast.warning(
          "We could not confirm with the provider yet. Your points stay reserved until we hear back.",
        );
      } else {
        toast.error("Purchase could not be completed");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-gutter mx-auto w-full max-w-6xl space-y-8 py-10 sm:py-14">
      <Reveal>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Top up & pay bills
            </h1>
            <Badge variant="secondary" className="gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Powered by Pairgate
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Airtime, data, cable, electricity, exam PINs and betting wallets —
            paid from your points balance. A failed purchase returns your points
            automatically.
          </p>
        </div>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ── Catalog ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Reveal>
            <Tabs value={service} onValueChange={(v) => { setService(v as ServiceKey); setProductCode(""); }}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
                {SERVICES.map(({ key, label, icon: Icon }) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="min-h-11 flex-1 gap-2 sm:flex-none"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Reveal>

          <StaggerGroup key={service} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {catalog === undefined
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28" />
                ))
              : catalog.length === 0
                ? (
                  <Card className="sm:col-span-2 xl:col-span-3">
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                      <p className="text-sm font-medium">No products available yet</p>
                      <p className="text-sm text-muted-foreground">
                        This service has not been added to the catalog. An admin
                        needs to add {service} products before they can be bought.
                      </p>
                    </CardContent>
                  </Card>
                )
                : catalog.map((product) => {
                    const active = product.productCode === productCode;
                    return (
                      <StaggerItem key={product.productCode}>
                        <button
                          type="button"
                          onClick={() => setProductCode(product.productCode)}
                          aria-pressed={active}
                          className={cn(
                            "interactive-card flex min-h-28 w-full flex-col justify-between gap-3 rounded-xl border p-4 text-left",
                            active
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border bg-card",
                          )}
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium leading-tight">
                              {product.name}
                            </p>
                            {product.network && (
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                {product.network}
                              </p>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold tabular-nums">
                              {product.points.toLocaleString()} pts
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatNgn(product.priceNgn)} face value
                            </p>
                          </div>
                        </button>
                      </StaggerItem>
                    );
                  })}
          </StaggerGroup>
        </div>

        {/* ── Checkout ────────────────────────────────────────────── */}
        <Reveal delay={0.05}>
          <Card className="lg:sticky lg:top-24">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold">Purchase details</h2>
                <p className="text-sm text-muted-foreground">
                  Balance:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {(balance ?? 0).toLocaleString()} pts
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vtu-identifier">{hint.label}</Label>
                <Input
                  id="vtu-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={hint.placeholder}
                  inputMode="numeric"
                  autoComplete="off"
                  className="min-h-11"
                  aria-invalid={identifier.length > 0 && !identifierCheck.ok}
                />
                <p
                  className={cn(
                    "text-xs",
                    identifier.length > 0 && !identifierCheck.ok
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {identifier.length > 0 && !identifierCheck.ok
                    ? identifierCheck.error
                    : hint.help}
                </p>
              </div>

              {service === "exam" && (
                <div className="space-y-2">
                  <Label htmlFor="vtu-pincount">How many PINs?</Label>
                  <Input
                    id="vtu-pincount"
                    type="number"
                    min={1}
                    max={20}
                    value={pinCount}
                    onChange={(e) =>
                      setPinCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                    }
                    className="min-h-11"
                  />
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                {selected ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Product</span>
                      <span className="text-right font-medium">{selected.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Pays</span>
                      <span className="text-right font-medium">
                        {formatNgn(selected.priceNgn)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
                      <span className="font-medium">Cost</span>
                      <span className="text-right text-base font-semibold tabular-nums">
                        {selected.points.toLocaleString()} pts
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      About {formatNgn(selected.points * ngnPerPoint)} in points value
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a product to see the cost.
                  </p>
                )}
              </div>

              <Button
                onClick={handlePurchase}
                disabled={!canSubmit}
                className="min-h-11 w-full"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : selected ? (
                  `Pay ${selected.points.toLocaleString()} pts`
                ) : (
                  "Select a product"
                )}
              </Button>

              {selected && (balance ?? 0) < selected.points && (
                <p className="text-xs text-destructive">
                  You need {(selected.points - (balance ?? 0)).toLocaleString()}{" "}
                  more points for this purchase.
                </p>
              )}

              {receipt && (
                <div
                  className={cn(
                    "space-y-2 rounded-lg border p-4 text-sm",
                    receipt.status === "success"
                      ? STATUS_TONE.success
                      : receipt.status === "pending"
                        ? STATUS_TONE.pending
                        : STATUS_TONE.reversed,
                  )}
                  role="status"
                >
                  <p className="flex items-center gap-2 font-medium">
                    {receipt.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                    {statusLabel(receipt.status)}
                  </p>
                  <p className="break-anywhere font-mono text-xs opacity-80">
                    {receipt.requestId}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>

      {/* ── History ──────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Recent purchases</h2>
          {history === undefined ? (
            <Skeleton className="h-32" />
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No purchases yet. Your top-ups and bill payments will appear here.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {history.map((tx) => (
                  <div
                    key={tx._id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors duration-200 hover:bg-muted/40"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">
                        {tx.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {maskIdentifier(tx.customerIdentifier)} ·{" "}
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                      {tx.failureReason && (
                        <p className="text-xs text-muted-foreground break-anywhere">
                          {tx.failureReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">
                        {tx.pointsCharged.toLocaleString()} pts
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("whitespace-nowrap", STATUS_TONE[tx.status])}
                      >
                        {statusLabel(tx.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </Reveal>
    </div>
  );
}
