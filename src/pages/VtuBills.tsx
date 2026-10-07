import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion";
import {
  VtuBand,
  VtuChoice,
  VtuConfirmPanel,
  VtuNav,
  VtuReceipt,
  VtuRow,
  VtuSection,
  VtuServiceIcon,
  VtuShell,
  VtuSteps,
} from "@/components/vtu/shared";
import { formatNgn } from "@/lib/pricing";
import {
  maskIdentifier,
  validateCustomerIdentifier,
  vtuServiceTypeLabel,
} from "@/lib/vtu";
import { ArrowLeft, ArrowRight, Coins, Contact, Loader2, Lock, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * Bills: data bundles, cable subscriptions, electricity tokens and exam PINs.
 *
 * The flow is CHOOSE → DETAILS → CONFIRM → receipt, and it is a flow rather
 * than one long form for a reason that only shows up on a phone: the customer
 * needs to see, on their own screen, exactly what is about to be bought before
 * anything is spent. Everything else — the plan list, the amount presets, the
 * summary — is arranged so that the confirm step is reached without scrolling
 * back up to check a field.
 *
 * The service code this page buys with is composed from the SERVER's template,
 * so the client never learns the code grammar and cannot invent an address the
 * backend would refuse. The price is resolved by the server too, on exactly
 * that code, so the number shown and the number charged come from one resolver
 * rather than two opinions.
 *
 * The record is the source of truth for what happened: the page SUBSCRIBES to
 * the transaction it just created instead of trusting the action's return
 * value, which only says what the row looked like at that instant.
 *
 * Airtime is NOT here. It has its own grid (network + amount) and its own page,
 * and the two share the confirmation and receipt panels rather than a single
 * form that has to hide half of itself for each.
 */

/** The service types this page sells. Airtime and betting have their own
 *  shapes, and a bills list that quietly included them would be a list with
 *  rows that behave differently from every other row. */
const BILL_SERVICE_TYPES = ["data", "cable", "electricity", "exam"] as const;

/** Amount presets, filtered to whatever the product actually accepts. */
const AMOUNT_PRESETS = [500, 1000, 2000, 5000, 10000, 20000] as const;

const STEP_LABELS = ["Choose", "Details", "Confirm"] as const;

export default function VtuBills({ initialCategory }: { initialCategory?: "data" | "electricity" | "exam" } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const productCode = searchParams.get("product") ?? "";

  const catalog = useQuery(api.vtuCatalog.listCatalog, {});
  const detail = useQuery(
    api.vtuCatalog.getPurchaseDetail,
    productCode ? { productCode } : "skip",
  );
  const balance = useQuery(api.wallet.getBalance);
  const purchase = useAction(api.vtuHttp.purchaseVtu);

  // The catalogue's quick links land here with a category already chosen, so
  // "Electricity" opens on electricity rather than on a list to scroll.
  const [category, setCategory] = useState<string | null>(
    initialCategory ?? searchParams.get("category"),
  );
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [transactionId, setTransactionId] = useState<Id<"vtuTransactions"> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tx = useQuery(
    api.vtuInternal.getTransaction,
    transactionId ? { transactionId } : "skip",
  );

  /** The groups this page sells, in the order `VTU_SERVICE_TYPES` declares. */
  const groups = useMemo(
    () =>
      (catalog?.groups ?? []).filter((group) =>
        (BILL_SERVICE_TYPES as readonly string[]).includes(group.serviceType) &&
        (!initialCategory || group.serviceType === initialCategory),
      ),
    [catalog],
  );

  const activeGroup =
    groups.find((group) => group.serviceType === category) ?? groups[0] ?? null;

  useEffect(() => {
    // Only deep-link straight into details when the category has exactly one
    // product. With multiple providers/plans, never silently pick the first
    // one — electricity and data especially need an explicit customer choice.
    if (!initialCategory || productCode || !activeGroup || activeGroup.products.length !== 1) return;
    setSearchParams({ product: activeGroup.products[0].productCode }, { replace: true });
  }, [initialCategory, productCode, activeGroup, setSearchParams]);


  const amountNgn = detail?.requiresAmount ? Number(amount) : null;
  const amountValid = amountNgn !== null && Number.isFinite(amountNgn) && amountNgn > 0;

  const serviceCode = useMemo(() => {
    if (!detail) return null;
    if (!detail.serviceCodeTemplate.includes(detail.amountToken)) {
      return detail.serviceCodeTemplate;
    }
    return amountValid
      ? detail.serviceCodeTemplate.split(detail.amountToken).join(String(amountNgn))
      : null;
  }, [detail, amountValid, amountNgn]);

  const preview = useQuery(api.vtu.previewCost, serviceCode ? { serviceCode } : "skip");

  const priceNgn = preview?.nairaPrice ?? detail?.priceNgn ?? null;
  const affordable = priceNgn === null ? true : (balance ?? 0) >= priceNgn;
  const inFlight = tx ? tx.status === "pending" || tx.status === "processing" : false;
  const locked = submitting || inFlight;

  const reasonNotBuyable = !detail
    ? null
    : !detail.providerAvailable
      ? "No provider is serving this product right now. Nothing has been charged."
      : !affordable
        ? `You need ${formatNgn(Math.max(0, (priceNgn ?? 0) - (balance ?? 0)))} more in your wallet.`
        : null;

  // ── Steps ─────────────────────────────────────────────────────────
  // The receipt is not a step a customer walks to; it is where the flow ends
  // up, so it is derived from the transaction rather than from a counter.
  const step: "choose" | "details" | "confirm" | "receipt" = tx
    ? "receipt"
    : !productCode
      ? "choose"
      : confirmed
        ? "confirm"
        : "details";
  const stepIndex = step === "confirm" ? 2 : step === "choose" ? 0 : 1;

  const presets = useMemo(() => {
    if (!detail?.requiresAmount) return [];
    const min = detail.minAmount ?? 0;
    const max = detail.maxAmount ?? Number.POSITIVE_INFINITY;
    return AMOUNT_PRESETS.filter((value) => value >= min && value <= max);
  }, [detail]);

  function choose(productCode: string) {
    setIdentifier("");
    setAmount("");
    setConfirmed(false);
    setSearchParams({ product: productCode }, { replace: false });
  }

  function reset() {
    setTransactionId(null);
    setConfirmed(false);
    setIdentifier("");
    setAmount("");
    setSearchParams({}, { replace: true });
  }

  function continueToConfirm() {
    if (!detail) return;
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
    if (!serviceCode) {
      toast.error("This product cannot be priced right now");
      return;
    }
    if (!affordable) {
      toast.error("Insufficient NGN wallet balance");
      return;
    }
    setConfirmed(true);
  }

  async function handleSubmit() {
    if (locked || !detail || !serviceCode) return;
    const check = validateCustomerIdentifier(detail.serviceType, identifier);
    if (!check.ok) {
      toast.error(check.error);
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
      else toast.success("Payment submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VtuShell>
      <VtuNav />

      <VtuBand>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">
              {initialCategory === "data" ? "Mobile data" : initialCategory === "electricity" ? "Electricity" : initialCategory === "exam" ? "Exam Pins" : "Bills & bundles"}
            </p>
            <h1 className="mt-1 font-display text-xl font-bold sm:text-2xl">
              {initialCategory === "data" ? "Buy a data bundle" : initialCategory === "electricity" ? "Pay your electricity bill" : initialCategory === "exam" ? "Buy exam PINs" : "Data, cable, meter &amp; exam"}
            </h1>
            <p className="mt-1 max-w-md text-xs text-vtu-band-fg/75">
              Paid from your NGN wallet. A payment that does not go through returns
              them automatically.
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
        <VtuSteps steps={STEP_LABELS} current={stepIndex} className="px-1" />
      )}

      {catalog === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <Reveal>
          <div className="vtu-panel p-8 text-center">
            <p className="text-sm font-semibold">
              {initialCategory === "electricity"
                ? "Electricity service is not available yet"
                : initialCategory === "exam"
                  ? "Exam PINs are not available yet"
                  : initialCategory === "data"
                    ? "Data plans are not available yet"
                    : "Nothing is on sale yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-vtu-muted">
              {initialCategory === "electricity"
                ? "The electricity form is ready, but no active electricity provider has been synced from the payment provider yet."
                : "No products are switched on right now. Once the catalog is synced and routed, this screen will update automatically."}
            </p>
            <Button asChild variant="vtu" className="mt-4">
              <Link to={initialCategory === "electricity" ? "/vtu" : "/vtu/airtime"}>
                {initialCategory === "electricity" ? "Back to services" : "Buy airtime instead"}
              </Link>
            </Button>
          </div>
        </Reveal>
      ) : (
        <>
          {step === "choose" && (
            <>
              <Reveal>
                <VtuSection
                  title="What are you paying for?"
                  hint="Pick a category, then the exact product."
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {groups.map((group) => {
                      const selected = activeGroup?.serviceType === group.serviceType;
                      return (
                        <VtuChoice
                          key={group.serviceType}
                          selected={selected}
                          onClick={() => setCategory(group.serviceType)}
                          className="flex flex-col items-start gap-2"
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full",
                              selected
                                ? "bg-vtu-accent text-vtu-accent-ink"
                                : "bg-vtu-chip text-vtu-muted",
                            )}
                          >
                            <VtuServiceIcon
                              serviceType={group.serviceType}
                              className="h-4 w-4"
                            />
                          </span>
                          <span className="text-sm font-semibold">
                            {vtuServiceTypeLabel(group.serviceType)}
                          </span>
                          <span className="text-[11px] text-vtu-muted">
                            {group.products.length} option
                            {group.products.length === 1 ? "" : "s"}
                          </span>
                        </VtuChoice>
                      );
                    })}
                  </div>
                </VtuSection>
              </Reveal>

              {activeGroup && (
                <Reveal delay={0.04}>
                  <VtuSection
                    title={
                      activeGroup.serviceType === "data"
                        ? "Choose a data plan"
                        : activeGroup.serviceType === "electricity"
                          ? "Choose electricity service"
                          : activeGroup.serviceType === "cable"
                            ? "Choose TV service"
                            : "Choose education service"
                    }
                    hint={
                      activeGroup.serviceType === "data"
                        ? "Select a bundle, then enter the recipient number."
                        : activeGroup.serviceType === "electricity"
                          ? "Select your provider service, then enter your meter details."
                          : activeGroup.serviceType === "cable"
                            ? "Select your TV service, then enter your smartcard or IUC number."
                            : "Select an exam service, then enter the required candidate details."
                    }
                  >
                    <div className="overflow-hidden rounded-2xl border border-vtu-line bg-vtu-card">
                      {activeGroup.products.map((product, index) => (
                        <button
                          key={product.productCode}
                          type="button"
                          onClick={() => choose(product.productCode)}
                          className={cn(
                            "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left",
                            "transition-colors hover:bg-vtu-chip/60 active:bg-vtu-chip",
                            index > 0 && "border-t border-vtu-line",
                          )}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vtu-chip text-vtu-text">
                            <VtuServiceIcon serviceType={activeGroup.serviceType} className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {product.displayName}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-vtu-muted">
                              {product.requiresAmount
                                ? "Enter amount"
                                : product.customerIdentifierLabel}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-vtu-text">
                            {product.fixedPoints !== null
                              ? `${product.fixedPoints.toLocaleString()} pts`
                              : "Select"}
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-vtu-muted" aria-hidden />
                        </button>
                      ))}
                    </div>
                  </VtuSection>
                </Reveal>
              )}
            </>
          )}

          {step === "details" && productCode && detail === undefined && (
            <Skeleton className="h-72 w-full" />
          )}

          {step === "details" && productCode && detail === null && (
            <Reveal>
              <div className="vtu-panel p-8 text-center">
                <p className="text-sm font-semibold">This product is not available</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-vtu-muted">
                  It may not be switched on yet. Nothing has been charged.
                </p>
                <Button variant="vtu" className="mt-4" onClick={reset}>
                  Back to the list
                </Button>
              </div>
            </Reveal>
          )}

          {step === "details" && detail && (
            <Reveal>
              <div className="vtu-panel overflow-hidden">
                <div className="flex items-center gap-3 border-b border-vtu-line px-5 py-4">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={reset}
                    aria-label="Back to the product list"
                    className="text-vtu-muted hover:bg-vtu-chip hover:text-vtu-text"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vtu-chip text-vtu-text">
                    <VtuServiceIcon
                      serviceType={detail.serviceType}
                      className="h-4 w-4"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {detail.displayName}
                    </p>
                    <p className="text-[11px] text-vtu-muted">
                      {vtuServiceTypeLabel(detail.serviceType)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-vtu-chip px-3 py-1 text-xs font-semibold tabular-nums">
                    {detail.priceNgn !== null
                      ? formatNgn(detail.priceNgn)
                      : "Metered"}
                  </span>
                </div>

                <div className="space-y-5 px-5 py-5">
                  <div className="space-y-2">
                    <Label htmlFor="bill-target" className="text-sm font-medium text-vtu-text">
                      {detail.serviceType === "data"
                        ? "Phone Number"
                        : detail.serviceType === "electricity"
                          ? "Meter Number"
                          : detail.customerIdentifierLabel}
                    </Label>
                    <div className="relative">
                      <Input
                        id="bill-target"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        inputMode={detail.serviceType === "cable" ? "text" : "numeric"}
                        placeholder={
                          detail.serviceType === "data"
                            ? "Enter Phone Number"
                            : detail.serviceType === "electricity"
                              ? "Enter Meter Number"
                              : detail.customerIdentifierLabel
                        }
                        autoComplete="off"
                        disabled={locked}
                        className="min-h-12 border-vtu-line bg-white pr-14 text-vtu-text placeholder:text-vtu-muted"
                      />
                      {detail.serviceType === "electricity" ? (
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-vtu-accent-ink" aria-label="Scan meter number">
                          <ScanLine className="h-5 w-5" />
                        </button>
                      ) : detail.serviceType === "data" ? (
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-vtu-accent-ink" aria-label="Choose contact">
                          <Contact className="h-5 w-5" />
                        </button>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-[#b45e63]">
                      {detail.serviceType === "data"
                        ? "Please verify the recipient's phone number before proceeding."
                        : detail.serviceType === "electricity"
                          ? "Verify the meter number before proceeding."
                          : `We send the ${vtuServiceTypeLabel(detail.serviceType).toLowerCase()} to this ${detail.customerIdentifierLabel.toLowerCase()}.`}
                    </p>
                  </div>

                  {detail.requiresAmount && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-vtu-text">Amount (₦)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {presets.map((preset) => (
                          <VtuChoice
                            key={preset}
                            selected={amount === String(preset)}
                            onClick={() => setAmount(String(preset))}
                            className="text-center"
                          >
                            <span className="block text-sm font-semibold tabular-nums">
                              {formatNgn(preset)}
                            </span>
                          </VtuChoice>
                        ))}
                      </div>
                      <Input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                        inputMode="numeric"
                        placeholder="Or type an amount"
                        disabled={locked}
                        className="min-h-11 border-vtu-line bg-vtu-card text-vtu-text placeholder:text-vtu-muted tabular-nums"
                      />
                      <p className="text-[11px] text-vtu-muted">
                        {detail.minAmount !== null && detail.maxAmount !== null
                          ? `Between ${formatNgn(detail.minAmount)} and ${formatNgn(
                              detail.maxAmount,
                            )}.`
                          : "Enter the amount you want to pay."}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-2xl border border-vtu-line bg-white px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-vtu-muted">
                      <Coins className="h-3.5 w-3.5" />
                      You pay
                    </span>
                    <span className="text-base font-semibold tabular-nums">
                      {priceNgn === null
                        ? detail.requiresAmount
                          ? "Shown as you type"
                          : "Shown before you confirm"
                        : formatNgn(priceNgn)}
                    </span>
                  </div>

                  {reasonNotBuyable && (
                    <p className="rounded-xl border border-vtu-line bg-vtu-chip px-3 py-2 text-xs text-vtu-muted">
                      {reasonNotBuyable}
                    </p>
                  )}

                  <Button
                    variant="vtu"
                    size="lg"
                    onClick={continueToConfirm}
                    disabled={
                      locked ||
                      !detail.providerAvailable ||
                      !serviceCode ||
                      !affordable ||
                      !identifier.trim()
                    }
                    className="w-full"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </Reveal>
          )}

          {step === "confirm" && detail && (
            <Reveal>
              <VtuConfirmPanel
                amount={priceNgn === null ? "—" : formatNgn(priceNgn)}
                amountHint={
                  amountNgn !== null && Number.isFinite(amountNgn)
                    ? `for ${formatNgn(amountNgn)} of ${vtuServiceTypeLabel(
                        detail.serviceType,
                      ).toLowerCase()}`
                    : undefined
                }
                rows={
                  <>
                    <VtuRow label="Product" value={detail.displayName} />
                    <VtuRow
                      label="Category"
                      value={vtuServiceTypeLabel(detail.serviceType)}
                    />
                    {amountNgn !== null && Number.isFinite(amountNgn) && (
                      <VtuRow label="You receive" value={formatNgn(amountNgn)} />
                    )}
                    <VtuRow
                      label={detail.customerIdentifierLabel}
                      value={maskIdentifier(identifier)}
                      mono
                    />
                    <VtuRow label="Wallet charge" value={priceNgn === null ? "—" : formatNgn(priceNgn)} />
                    <VtuRow
                      label="Balance after"
                      value={formatNgn(Math.max(0, (balance ?? 0) - (priceNgn ?? 0)))}
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
                  Back
                </Button>
                <p className="text-center text-[11px] text-vtu-muted">
                  Charged once. A payment that does not go through refunds your
                  your wallet automatically.
                </p>
              </VtuConfirmPanel>
            </Reveal>
          )}

          {step === "receipt" && tx && (
            <VtuReceipt
              status={tx.status}
              rows={
                <>
                  <VtuRow label="Product" value={detail?.displayName ?? tx.serviceCode} />
                  <VtuRow
                    label={detail?.customerIdentifierLabel ?? "Destination"}
                    value={maskIdentifier(tx.customerIdentifier)}
                    mono
                  />
                  <VtuRow label="Value" value={formatNgn(tx.nairaPrice)} />
                  <VtuRow
                    label="Wallet charged"
                    value={formatNgn(tx.walletDebitedNgn ?? tx.nairaPrice)}
                    strong
                  />
                  
                  <VtuRow label="Requested" value={fmtWhen(tx.createdAt)} />
                  {tx.providerReference && (
                    <VtuRow label="Reference" value={tx.providerReference} mono />
                  )}
                </>
              }
              token={
                tx.delivery?.token ? (
                  <div className="mt-3 rounded-xl border border-vtu-accent bg-vtu-accent/20 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-vtu-accent-ink/80">
                      Token
                    </p>
                    <p className="break-anywhere mt-0.5 font-mono text-base font-bold text-vtu-accent-ink">
                      {tx.delivery.token}
                    </p>
                    {(tx.delivery.units || tx.delivery.serial || tx.delivery.pin) && (
                      <p className="mt-0.5 text-[11px] text-vtu-accent-ink/80 tabular-nums">
                        {[
                          tx.delivery.units ? `${tx.delivery.units} units` : null,
                          tx.delivery.serial ? `Serial ${tx.delivery.serial}` : null,
                          tx.delivery.pin ? `PIN ${tx.delivery.pin}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ) : null
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
        </>
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

/**
 * "12 Mar, 14:05" — with the year only once it stops being obvious.
 *
 * The receipt cites the moment the order was requested, so a customer
 * reconciling a charge against their wallet statement sees the minute they
 * remember rather than a raw timestamp.
 */
function fmtWhen(ts: number): string {
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(
    "en-NG",
    sameYear ? DATE_FORMAT : { ...DATE_FORMAT, year: "numeric" },
  );
}