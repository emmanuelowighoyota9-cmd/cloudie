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
import { Reveal } from "@/components/motion";
import { VtuServiceIcon, VtuStatusPill } from "@/components/vtu/shared";
import { formatNgn } from "@/lib/pricing";
import {
  maskIdentifier,
  validateCustomerIdentifier,
  vtuServiceTypeLabel,
  vtuStatusCopy,
} from "@/lib/vtu";
import { ArrowLeft, Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Buy a data bundle, a cable subscription, or an electricity top-up.
 *
 * ONE page for three service types, because they differ only in what they ask
 * for: a number to deliver to, and — for electricity — an amount. The catalog
 * decides which of those, per product.
 *
 * The service code this page buys with is composed from the SERVER's template,
 * so the client never learns the code grammar and cannot invent an address the
 * backend would refuse. The price is resolved by the server too, on exactly
 * that code, so the number shown and the number charged come from one
 * resolver rather than two opinions.
 *
 * The record is the source of truth for what happened: the page SUBSCRIBES to
 * the transaction it just created instead of trusting the action's return
 * value, which only says what the row looked like at that instant.
 */
export default function VtuBills() {
  const [searchParams] = useSearchParams();
  const productCode = searchParams.get("product") ?? "";

  const detail = useQuery(
    api.vtuCatalog.getPurchaseDetail,
    productCode ? { productCode } : "skip",
  );
  const balance = useQuery(api.points.getBalance);
  const purchase = useAction(api.vtuHttp.purchaseVtu);

  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionId, setTransactionId] = useState<Id<"vtuTransactions"> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tx = useQuery(
    api.vtuInternal.getTransaction,
    transactionId ? { transactionId } : "skip",
  );

  const amountNgn = detail?.requiresAmount ? Number(amount) : null;
  const amountValid =
    amountNgn !== null && Number.isFinite(amountNgn) && amountNgn > 0;

  const serviceCode = useMemo(() => {
    if (!detail) return null;
    if (!detail.serviceCodeTemplate.includes(detail.amountToken)) {
      return detail.serviceCodeTemplate;
    }
    return amountValid
      ? detail.serviceCodeTemplate.split(detail.amountToken).join(String(amountNgn))
      : null;
  }, [detail, amountValid, amountNgn]);

  const preview = useQuery(
    api.vtu.previewCost,
    serviceCode ? { serviceCode } : "skip",
  );

  const points = preview?.points ?? detail?.fixedPoints ?? null;
  const affordable = points === null ? true : (balance ?? 0) >= points;
  const inFlight = tx ? tx.status === "pending" || tx.status === "processing" : false;
  const blocker = !detail
    ? null
    : !detail.providerAvailable
      ? "No provider is serving this product right now. Nothing has been charged."
      : detail.requiresAmount && !amountValid
        ? null
        : !affordable
          ? "Not enough points for this purchase."
          : null;

  async function handleSubmit() {
    if (submitting || !detail || !serviceCode) return;

    const check = validateCustomerIdentifier(detail.serviceType, identifier);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    if (detail.requiresAmount) {
      if (!amountValid) {
        toast.error("Enter an amount");
        return;
      }
      if (detail.minAmount !== null && amountNgn !== null && amountNgn < detail.minAmount) {
        toast.error(`The smallest amount here is ${formatNgn(detail.minAmount)}`);
        return;
      }
      if (detail.maxAmount !== null && amountNgn !== null && amountNgn > detail.maxAmount) {
        toast.error(`The largest amount here is ${formatNgn(detail.maxAmount)}`);
        return;
      }
    }
    if (!affordable) {
      toast.error("Not enough points for this purchase");
      return;
    }

    setSubmitting(true);
    // Generated once per attempt: a double-click or a flaky connection reuses
    // it, so the retry cannot buy the same thing twice.
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
      if (result.reused) toast.info("Resuming your earlier attempt…");
      else toast.success("Purchase submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const copy = tx ? vtuStatusCopy(tx.status) : null;

  return (
    <div className="page-gutter mx-auto w-full max-w-3xl space-y-8 py-10 sm:py-14">
      <Reveal>
        <div className="space-y-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground"
          >
            <Link to="/vtu">
              <ArrowLeft className="h-4 w-4" />
              All services
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {detail?.displayName ?? "Buy a service"}
            </h1>
            {detail && (
              <Badge variant="secondary" className="gap-1.5">
                <VtuServiceIcon serviceType={detail.serviceType} className="h-3 w-3" />
                {vtuServiceTypeLabel(detail.serviceType)}
              </Badge>
            )}
            <Badge variant="secondary" className="ml-auto gap-1.5 tabular-nums">
              <Coins className="h-3 w-3" />
              {(balance ?? 0).toLocaleString()} pts available
            </Badge>
          </div>
        </div>
      </Reveal>

      {!productCode && (
        <Reveal delay={0.05}>
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <p className="text-sm font-medium">Choose a service first</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Pick a data bundle, a cable subscription, or an electricity
                top-up from the catalogue.
              </p>
              <Button asChild className="min-h-11">
                <Link to="/vtu">Browse services</Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {productCode && detail === undefined && (
        <Skeleton className="h-64 w-full" />
      )}

      {productCode && detail === null && (
        <Reveal delay={0.05}>
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <p className="text-sm font-medium">This product is not available</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                It may not be switched on yet. Nothing has been charged.
              </p>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/vtu">Back to the catalogue</Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {detail && (
        <Reveal delay={0.05}>
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="bill-target">{detail.customerIdentifierLabel}</Label>
                <Input
                  id="bill-target"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  inputMode="numeric"
                  placeholder={detail.customerIdentifierLabel}
                  className="min-h-11"
                />
              </div>

              {detail.requiresAmount && (
                <div className="space-y-2">
                  <Label htmlFor="bill-amount">Amount (₦)</Label>
                  <Input
                    id="bill-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder={detail.minAmount !== null ? String(detail.minAmount) : "1000"}
                    className="min-h-11 tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">
                    {detail.minAmount !== null && detail.maxAmount !== null
                      ? `Between ${formatNgn(detail.minAmount)} and ${formatNgn(detail.maxAmount)}.`
                      : "Enter the amount you want to pay."}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <span className="text-sm text-muted-foreground">You pay</span>
                <span className="text-base font-semibold tabular-nums">
                  {points === null
                    ? "Shown before you confirm"
                    : `${points.toLocaleString()} pts`}
                </span>
              </div>

              {blocker && (
                <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  {blocker}
                </p>
              )}

              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  inFlight ||
                  !detail.providerAvailable ||
                  !serviceCode ||
                  !affordable ||
                  !identifier.trim()
                }
                className="min-h-11 w-full gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Placing…
                  </>
                ) : inFlight ? (
                  "In progress…"
                ) : (
                  "Confirm purchase"
                )}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                A purchase that does not go through refunds your points
                automatically.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {tx && (
        <Reveal delay={0.05}>
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {copy ? copy.label : "This purchase"}
                </p>
                <VtuStatusPill status={tx.status} />
              </div>
              {copy && (
                <p className="text-sm text-muted-foreground">{copy.detail}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Destination</dt>
                  <dd className="break-anywhere font-mono">
                    {maskIdentifier(tx.customerIdentifier)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Points debited</dt>
                  <dd className="tabular-nums">
                    {tx.pointsDebited.toLocaleString()} pts
                  </dd>
                </div>
              </dl>

              {tx.delivery?.token && (
                // The token IS the delivery for a prepaid meter: a confirmed
                // status without it would report a success the customer cannot
                // use.
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Token
                  </p>
                  <p className="break-anywhere mt-0.5 font-mono text-sm font-medium">
                    {tx.delivery.token}
                  </p>
                  {(tx.delivery.units || tx.delivery.serial) && (
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {[
                        tx.delivery.units ? `${tx.delivery.units} units` : null,
                        tx.delivery.serial ? `Serial ${tx.delivery.serial}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              )}

              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link to="/vtu/history">View in history</Link>
              </Button>
            </CardContent>
          </Card>
        </Reveal>
      )}
    </div>
  );
}
