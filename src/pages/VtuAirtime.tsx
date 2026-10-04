import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import {
  VTU_NETWORKS,
  VtuBand,
  VtuChoice,
  VtuConfirmPanel,
  VtuNav,
  VtuNetworkMark,
  VtuReceipt,
  VtuRow,
  VtuSection,
  VtuShell,
  VtuSteps,
} from "@/components/vtu/shared";
import { formatNgn } from "@/lib/pricing";
import { maskIdentifier, validatePhone } from "@/lib/vtu";
import { ArrowLeft, Coins, Loader2, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Airtime top-up — the screen the whole shop is shaped around.
 *
 * Three choices and a number: which network, how much, who for. They are on
 * one screen on purpose, because a customer buying ₦200 of airtime is not
 * filling in a form — they are repeating something they do weekly, and every
 * extra tap is a reason to use the other app.
 *
 * The purchase itself is NEVER confirmed by this page's own optimism. The page
 * SUBSCRIBES to the transaction record and shows what the record says, so a
 * top-up that is still processing cannot be shown with a tick.
 */

const AMOUNTS = [100, 200, 500, 1000, 2000, 5000] as const;

/** Airtime's amount and its number are chosen on ONE screen, so the rail says
 *  "Choose" rather than pretending they are two stops. */
const STEP_LABELS = ["Choose", "Confirm", "Done"] as const;

export default function VtuAirtime() {
  // The catalog deep-links here with the network it selected. Validated against
  // the known list so a hand-edited URL cannot preselect something the purchase
  // path would then refuse.
  const [searchParams] = useSearchParams();
  const requestedNetwork = searchParams.get("network");
  const [network, setNetwork] = useState<string>(
    VTU_NETWORKS.some((n) => n.key === requestedNetwork) ? requestedNetwork! : "mtn",
  );
  const [amount, setAmount] = useState<number>(1000);
  const [phone, setPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [transactionId, setTransactionId] = useState<Id<"vtuTransactions"> | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const offers = useQuery(api.vtu.getAirtimeOffers, {});
  const balance = useQuery(api.wallet.getBalance);
  const purchase = useAction(api.vtuHttp.purchaseVtu);

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
  const inFlight = tx ? tx.status === "pending" || tx.status === "processing" : false;
  const locked = submitting || inFlight;
  const networkLabel = VTU_NETWORKS.find((n) => n.key === network)?.label ?? network;

  const step: "details" | "confirm" | "receipt" = tx
    ? "receipt"
    : confirmed
      ? "confirm"
      : "details";

  // Warm the points cost only when we are about to need it: this is a preview
  // read, and a grid of six amounts does not require six of them.
  const preview = useQuery(
    api.vtu.previewCost,
    confirmed && selected ? { serviceCode } : "skip",
  );
  const priceToPay = preview?.nairaPrice ?? selected?.amountNgn ?? 0;
  const affordable = (balance ?? 0) >= priceToPay;
  const pointsToPay = priceToPay;

  async function handleSubmit() {
    if (locked || !selected) return;
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

  function reset() {
    setTransactionId(null);
    setConfirmed(false);
    setPhone("");
  }

  return (
    <VtuShell>
      <VtuNav />

      <VtuBand>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">
              Airtime
            </p>
            <h1 className="mt-1 font-display text-xl font-bold sm:text-2xl">
              Top up any network
            </h1>
            <p className="mt-1 max-w-md text-xs text-vtu-band-fg/75">
              Delivered straight to the number. A top-up that does not go
              through refunds your wallet automatically.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] opacity-70">
              Available
            </p>
            <p className="font-display text-lg font-bold tabular-nums">
              {formatNgn(balance ?? 0)}
            </p>
            <Button
              asChild
              variant="vtu"
              size="sm"
              className="mt-1.5 border border-vtu-band-fg/25 bg-vtu-band-fg/10 hover:bg-vtu-band-fg/20"
            >
              <Link to="/buy-points">
                <Plus className="h-3.5 w-3.5" />
                Fund wallet
              </Link>
            </Button>
          </div>
        </div>
      </VtuBand>

      {step !== "receipt" && (
        <VtuSteps steps={STEP_LABELS} current={step === "confirm" ? 1 : 0} className="px-1" />
      )}

      {step === "details" && (
        <>
          <Reveal>
            <div className="vtu-panel space-y-5 px-5 py-5">
              <VtuSection title="Network" hint="The network the number is on.">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VTU_NETWORKS.map((n) => (
                    <VtuChoice
                      key={n.key}
                      selected={network === n.key}
                      onClick={() => setNetwork(n.key)}
                      className="flex items-center gap-2"
                    >
                      <VtuNetworkMark network={n.key} className="h-8 w-8" />
                      <span className="text-sm font-medium">{n.label}</span>
                    </VtuChoice>
                  ))}
                </div>
              </VtuSection>
            </div>
          </Reveal>

          <Reveal delay={0.04}>
            <div className="vtu-panel space-y-5 px-5 py-5">
              <VtuSection
                title="Amount"
                hint="Prices are shown directly in Nigerian naira."
              >
                <StaggerGroup className="grid grid-cols-3 gap-2">
                  {AMOUNTS.map((n) => {
                    const offer = offers?.offers.find(
                      (o) => o.serviceCode === `airtime.${network}.${n}`,
                    );
                    const active = amount === n;
                    return (
                      <StaggerItem key={n}>
                        <VtuChoice
                          selected={active}
                          onClick={() => setAmount(n)}
                          className="w-full text-center"
                        >
                          <span className="block text-sm font-semibold tabular-nums">
                            {formatNgn(n)}
                          </span>
                          <span
                            className={
                              active
                                ? "mt-0.5 block text-[11px] font-medium text-vtu-accent-ink/80 tabular-nums"
                                : "mt-0.5 block text-[11px] text-vtu-muted tabular-nums"
                            }
                          >
                            {offer ? formatNgn(offer.amountNgn) : "…"}
                          </span>
                        </VtuChoice>
                      </StaggerItem>
                    );
                  })}
                </StaggerGroup>
                {selected?.override && (
                  <p className="text-[11px] text-vtu-muted">
                    This amount has an admin-set price override.
                  </p>
                )}
              </VtuSection>

              <div className="space-y-2">
                <Label htmlFor="vtu-phone" className="text-xs text-vtu-muted">
                  Phone number
                </Label>
                <Input
                  id="vtu-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0803 123 4567"
                  inputMode="tel"
                  autoComplete="off"
                  disabled={locked}
                  className="min-h-11 border-vtu-line bg-vtu-card text-vtu-text placeholder:text-vtu-muted"
                  aria-invalid={phone.length > 0 && !phoneCheck.ok}
                />
                {phone.length > 0 && !phoneCheck.ok ? (
                  <p className="text-xs text-destructive">{phoneCheck.error}</p>
                ) : (
                  <p className="text-[11px] text-vtu-muted">
                    The airtime is sent to this number.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-vtu-chip px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs text-vtu-muted">
                  <Coins className="h-3.5 w-3.5" />
                  {networkLabel} {formatNgn(amount)}
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {selected ? formatNgn(selected.amountNgn) : "Loading…"}
                </span>
              </div>

              {selected && !affordable && (
                <p className="rounded-xl border border-vtu-line bg-vtu-chip px-3 py-2 text-xs text-vtu-muted">
                  You need {formatNgn(Math.max(0, priceToPay - (balance ?? 0)))} more in your wallet.
                </p>
              )}

              <Button
                variant="vtu"
                size="lg"
                onClick={() => {
                  if (!phoneCheck.ok) {
                    toast.error(phoneCheck.error);
                    return;
                  }
                  setConfirmed(true);
                }}
                disabled={locked || !selected || !phoneCheck.ok || !affordable}
                className="w-full"
              >
                Pay {selected ? formatNgn(priceToPay) : "…"}
              </Button>
            </div>
          </Reveal>
        </>
      )}

      {step === "confirm" && selected && (
        <Reveal>
          <VtuConfirmPanel
            amount={formatNgn(pointsToPay)}
            amountHint={`for ${formatNgn(selected.amountNgn)} of ${networkLabel} airtime`}
            rows={
              <>
                <VtuRow label="Product" value={`${networkLabel} airtime top-up`} />
                <VtuRow label="You receive" value={formatNgn(selected.amountNgn)} />
                <VtuRow
                  label="Mobile number"
                  value={maskIdentifier(phoneCheck.ok ? phoneCheck.value : phone)}
                  mono
                />
                <VtuRow label="Wallet charge" value={formatNgn(pointsToPay)} />
                <VtuRow
                  label="Balance after"
                  value={formatNgn(Math.max(0, (balance ?? 0) - pointsToPay))}
                  strong
                />
              </>
            }
          >
            <Button
              variant="vtu"
              size="lg"
              onClick={handleSubmit}
              disabled={locked || !affordable}
              className="w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Placing…
                </>
              ) : inFlight ? (
                "In progress…"
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Confirm payment
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmed(false)}
              disabled={locked}
              className="w-full text-vtu-muted hover:bg-vtu-chip hover:text-vtu-text"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to the amount
            </Button>
            <p className="text-center text-[11px] text-vtu-muted">
              Charged once. A top-up that does not go through refunds your wallet
              automatically.
            </p>
          </VtuConfirmPanel>
        </Reveal>
      )}

      {step === "receipt" && tx && (
        <VtuReceipt
          status={tx.status}
          rows={
            <>
              {tx.network && <VtuRow label="Network" value={tx.network.toUpperCase()} />}
              <VtuRow
                label="Mobile number"
                value={maskIdentifier(tx.customerIdentifier)}
                mono
              />
              <VtuRow label="Value" value={formatNgn(tx.nairaPrice)} />
              <VtuRow label="Wallet charged" value={formatNgn(tx.walletDebitedNgn ?? tx.nairaPrice)} strong />
              <VtuRow label="Requested" value={fmtWhen(tx.createdAt)} />
              {tx.providerReference && (
                <VtuRow label="Reference" value={tx.providerReference} mono />
              )}
            </>
          }
        >
          {tx.failureReason && (
            <p className="rounded-xl border border-vtu-line bg-vtu-chip px-3 py-2 text-xs text-vtu-muted">
              {tx.failureReason}
            </p>
          )}
          <Button variant="vtu" size="lg" onClick={reset} className="w-full">
            Buy another
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full border-vtu-line bg-vtu-card text-vtu-text hover:bg-vtu-chip"
          >
            <Link to="/vtu/history">View receipt in history</Link>
          </Button>
        </VtuReceipt>
      )}

      {offers === undefined && step === "details" && (
        <Skeleton className="h-16 w-full" />
      )}
    </VtuShell>
  );
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

function fmtWhen(ts: number): string {
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(
    "en-NG",
    sameYear ? DATE_FORMAT : { ...DATE_FORMAT, year: "numeric" },
  );
}
