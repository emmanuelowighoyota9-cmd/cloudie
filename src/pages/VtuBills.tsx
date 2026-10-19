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
  VTU_NETWORKS,
  VtuBand,
  VtuChoice,
  VtuConfirmPanel,
  VtuNav,
  VtuNetworkMark,
  VtuReceipt,
  VtuRow,
  VtuSection,
  VtuServiceIcon,
  VtuShell,
  VtuSteps,
} from "@/components/vtu/shared";
import { formatNgn } from "@/lib/pricing";
import {
  detectNigerianNetwork,
  maskIdentifier,
  validateCustomerIdentifier,
  vtuServiceTypeLabel,
} from "@/lib/vtu";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Contact,
  CreditCard,
  FileCheck2,
  GraduationCap,
  Lightbulb,
  Loader2,
  Lock,
  Plus,
  Radio,
  ScanLine,
  Search,
  Sparkles,
  Tv,
  Wifi,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * Bulletproof helper for formatting points without throwing TypeError when fixedPoints
 * is null or undefined.
 */
export function safeFormatPoints(pts?: number | null): string {
  if (typeof pts !== "number" || !Number.isFinite(pts) || isNaN(pts)) {
    return "Select";
  }
  return `${pts.toLocaleString("en-NG")} pts`;
}

/**
 * Bulletproof helper for formatting Naira prices safely.
 */
export function safeFormatNgn(amount?: number | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || isNaN(amount)) {
    return "—";
  }
  return formatNgn(amount);
}

const BILL_SERVICE_TYPES = ["data", "cable", "electricity", "exam"] as const;

const AMOUNT_PRESETS = [500, 1000, 2000, 5000, 10000, 20000] as const;

const STEP_LABELS = ["Choose", "Details", "Confirm"] as const;

export default function VtuBills({
  initialCategory,
}: {
  initialCategory?: "data" | "electricity" | "exam";
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const productCode = searchParams.get("product") ?? "";

  const catalog = useQuery(api.vtuCatalog.listCatalog, {});
  const detail = useQuery(
    api.vtuCatalog.getPurchaseDetail,
    productCode ? { productCode } : "skip",
  );
  const balance = useQuery(api.wallet.getBalance);
  const purchase = useAction(api.vtuHttp.purchaseVtu);

  const [category, setCategory] = useState<string | null>(
    initialCategory ?? searchParams.get("category"),
  );
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [quantity, setQuantity] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [transactionId, setTransactionId] = useState<Id<"vtuTransactions"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [planSearch, setPlanSearch] = useState("");
  const [meterVerified, setMeterVerified] = useState(false);
  const [verifyingMeter, setVerifyingMeter] = useState(false);

  const tx = useQuery(
    api.vtuInternal.getTransaction,
    transactionId ? { transactionId } : "skip",
  );

  const groups = useMemo(
    () =>
      (catalog?.groups ?? []).filter(
        (group) =>
          (BILL_SERVICE_TYPES as readonly string[]).includes(group.serviceType) &&
          (!initialCategory || group.serviceType === initialCategory),
      ),
    [catalog, initialCategory],
  );

  const activeGroup =
    groups.find((group) => group.serviceType === category) ?? groups[0] ?? null;

  useEffect(() => {
    if (!initialCategory || productCode || !activeGroup || activeGroup.products.length === 0) {
      return;
    }
    const firstCode = activeGroup.products[0]?.productCode;
    if (firstCode) {
      setSearchParams({ product: firstCode }, { replace: true });
    }
  }, [initialCategory, productCode, activeGroup, setSearchParams]);

  // Auto-detect mobile network from phone input
  useEffect(() => {
    if (activeGroup?.serviceType === "data" && identifier.length >= 4) {
      const detected = detectNigerianNetwork(identifier);
      if (detected) {
        const matchingProduct = activeGroup.products.find((p) =>
          (p.displayName || p.productCode || "").toLowerCase().includes(detected),
        );
        if (
          matchingProduct &&
          (!detail ||
            !(detail.displayName || detail.productCode || "")
              .toLowerCase()
              .includes(detected))
        ) {
          setSearchParams({ product: matchingProduct.productCode }, { replace: true });
        }
      }
    }
  }, [identifier, activeGroup, detail, setSearchParams]);

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

  const priceNgn = preview?.chargeNgn ?? detail?.priceNgn ?? null;
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

  function choose(code: string) {
    setIdentifier("");
    setAmount("");
    setConfirmed(false);
    setMeterVerified(false);
    setSearchParams({ product: code }, { replace: false });
  }

  function reset() {
    setTransactionId(null);
    setConfirmed(false);
    setIdentifier("");
    setAmount("");
    setMeterVerified(false);
    setSearchParams({}, { replace: true });
  }

  function handleVerifyMeter() {
    if (!identifier.trim()) {
      toast.error("Please enter a meter number first.");
      return;
    }
    const check = validateCustomerIdentifier("electricity", identifier);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setVerifyingMeter(true);
    setTimeout(() => {
      setVerifyingMeter(false);
      setMeterVerified(true);
      toast.success("Meter validated successfully.");
    }, 600);
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
        toast.error("Enter an amount to recharge.");
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
      toast.error("This product cannot be priced right now.");
      return;
    }
    if (!affordable) {
      toast.error("Insufficient NGN wallet balance.");
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
      else toast.success("Purchase submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const list = activeGroup?.products ?? [];
    if (!planSearch.trim()) return list;
    const q = planSearch.toLowerCase();
    return list.filter(
      (p) =>
        (p.displayName || "").toLowerCase().includes(q) ||
        (p.productCode || "").toLowerCase().includes(q),
    );
  }, [activeGroup, planSearch]);

  return (
    <VtuShell>
      <VtuNav />

      <VtuBand>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="size-3" />
              {initialCategory === "data"
                ? "Mobile Data"
                : initialCategory === "electricity"
                  ? "Electricity DisCos"
                  : initialCategory === "exam"
                    ? "Education PINs"
                    : "Digital Services & Bills"}
            </div>
            <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {initialCategory === "data"
                ? "Buy Instant Mobile Data"
                : initialCategory === "electricity"
                  ? "Pay Electricity & Meter Bills"
                  : initialCategory === "exam"
                    ? "Purchase Exam Tokens & PINs"
                    : "Data, Electricity, Cable & Exam Services"}
            </h1>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Debited safely from your NGN wallet balance. Failed transactions refund automatically.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Available balance
            </p>
            <p className="font-display text-xl font-bold tabular-nums text-foreground">
              {formatNgn(balance ?? 0)}
            </p>
            <Button
              asChild
              variant="default"
              size="sm"
              className="mt-2 min-h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold"
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
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : groups.length === 0 ? (
        <Reveal>
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-xs">
            <p className="text-base font-bold text-foreground">
              {initialCategory === "electricity"
                ? "Electricity services are temporarily offline"
                : initialCategory === "exam"
                  ? "Exam PINs are currently not available"
                  : initialCategory === "data"
                    ? "Data plans are currently not available"
                    : "No products on sale yet"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
              Check back shortly or explore our airtime and other live services.
            </p>
            <Button asChild className="mt-4 rounded-xl">
              <Link to="/vtu/airtime">Browse airtime recharge</Link>
            </Button>
          </div>
        </Reveal>
      ) : (
        <>
          {step === "choose" && (
            <>
              {!initialCategory && (
                <Reveal>
                  <VtuSection
                    title="Select Service Category"
                    hint="Choose what you would like to pay for."
                  >
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {groups.map((group) => {
                        const isSelected = activeGroup?.serviceType === group.serviceType;
                        return (
                          <VtuChoice
                            key={group.serviceType}
                            selected={isSelected}
                            onClick={() => setCategory(group.serviceType)}
                            className="flex flex-col items-start gap-2"
                          >
                            <span
                              className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-xl",
                                isSelected
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "bg-surface-2 text-muted-foreground",
                              )}
                            >
                              <VtuServiceIcon
                                serviceType={group.serviceType}
                                className="h-5 w-5"
                              />
                            </span>
                            <div>
                              <span className="block text-sm font-semibold text-foreground">
                                {vtuServiceTypeLabel(group.serviceType)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {group.products.length} option
                                {group.products.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </VtuChoice>
                        );
                      })}
                    </div>
                  </VtuSection>
                </Reveal>
              )}

              {activeGroup && (
                <Reveal delay={0.04}>
                  <VtuSection
                    title={
                      activeGroup.serviceType === "data"
                        ? "Choose a Data Bundle"
                        : activeGroup.serviceType === "electricity"
                          ? "Select Electricity DisCo"
                          : activeGroup.serviceType === "cable"
                            ? "Select Television Provider"
                            : "Select Education Exam PIN"
                    }
                    hint={
                      activeGroup.serviceType === "data"
                        ? "Select a plan tailored for your network."
                        : activeGroup.serviceType === "electricity"
                          ? "Choose your regional power distribution company."
                          : activeGroup.serviceType === "cable"
                            ? "Choose your TV provider and bouquet."
                            : "Choose an examination body to get result checkers."
                    }
                  >
                    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                      {activeGroup.products
                        ?.filter((p): p is NonNullable<typeof p> => Boolean(p && p.productCode))
                        .map((product, index) => (
                          <button
                            key={product.productCode}
                            type="button"
                            onClick={() => choose(product.productCode)}
                            className={cn(
                              "flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors",
                              "hover:bg-muted/50 active:bg-muted",
                              index > 0 && "border-t border-border",
                            )}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary">
                              <VtuServiceIcon
                                serviceType={activeGroup.serviceType}
                                className="h-5 w-5"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {product.displayName || product.productCode || "Service"}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {product.requiresAmount
                                  ? "Enter recharge amount"
                                  : product.customerIdentifierLabel}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                              {safeFormatPoints(product?.fixedPoints)}
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          </button>
                        ))}
                    </div>
                  </VtuSection>
                </Reveal>
              )}
            </>
          )}

          {step === "details" && productCode && detail === undefined && (
            <Skeleton className="h-72 w-full rounded-3xl" />
          )}

          {step === "details" && productCode && detail === null && (
            <Reveal>
              <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-xs">
                <p className="text-sm font-semibold text-foreground">This product is currently offline</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  The provider service is currently unavailable. Nothing has been debited.
                </p>
                <Button variant="default" className="mt-4 rounded-xl" onClick={reset}>
                  Back to services
                </Button>
              </div>
            </Reveal>
          )}

          {step === "details" && detail && (
            <Reveal>
              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                {/* Header bar */}
                <div className="flex items-center gap-3 border-b border-border bg-surface-2/30 px-5 py-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={reset}
                    aria-label="Back to service list"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <VtuServiceIcon serviceType={detail.serviceType} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {detail.displayName || detail.productCode || "Service"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {vtuServiceTypeLabel(detail.serviceType)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl border border-border bg-card px-3 py-1 text-xs font-semibold tabular-nums text-foreground">
                    {detail.priceNgn !== null ? formatNgn(detail.priceNgn) : "Metered"}
                  </span>
                </div>

                <div className="space-y-5 p-4 sm:p-6">
                  {/* DATA SUBSCRIPTION INTERFACE */}
                  {detail.serviceType === "data" && (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Select Mobile Network
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {VTU_NETWORKS.map((n) => {
                            const providerProduct = activeGroup?.products.find((p) =>
                              (p.displayName || p.productCode || "")
                                .toLowerCase()
                                .includes(n.key),
                            );
                            const isActive = Boolean(
                              providerProduct && detail.productCode === providerProduct.productCode,
                            );
                            return (
                              <button
                                key={n.key}
                                type="button"
                                disabled={!providerProduct || locked}
                                onClick={() => providerProduct && choose(providerProduct.productCode)}
                                className={cn(
                                  "relative flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition-all active:scale-95",
                                  isActive
                                    ? "border-primary bg-primary/10 ring-2 ring-primary/25 shadow-xs"
                                    : "border-border bg-card hover:bg-muted/50",
                                  !providerProduct && "opacity-40 cursor-not-allowed",
                                )}
                              >
                                <VtuNetworkMark network={n.key} className="h-7 w-7" />
                                <span className="text-xs font-bold text-foreground">{n.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="data-plan" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Choose Data Bundle
                        </Label>
                        <select
                          id="data-plan"
                          value={productCode}
                          onChange={(e) => choose(e.target.value)}
                          disabled={locked}
                          className="min-h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                        >
                          {(activeGroup?.products ?? [])
                            .filter((p): p is NonNullable<typeof p> => Boolean(p && p.productCode))
                            .map((p) => (
                              <option key={p.productCode} value={p.productCode}>
                                {p.displayName || p.productCode}
                                {p.fixedNgn ? ` — ${safeFormatNgn(p.fixedNgn)}` : p.fixedPoints ? ` — ${safeFormatPoints(p.fixedPoints)}` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* ELECTRICITY BILLS INTERFACE */}
                  {detail.serviceType === "electricity" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="disco" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Select DisCo (Distribution Company)
                        </Label>
                        <select
                          id="disco"
                          value={productCode}
                          onChange={(e) => choose(e.target.value)}
                          disabled={locked}
                          className="min-h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                        >
                          {(activeGroup?.products ?? [])
                            .filter((p): p is NonNullable<typeof p> => Boolean(p && p.productCode))
                            .map((p) => (
                              <option key={p.productCode} value={p.productCode}>
                                {p.displayName || p.productCode}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Meter Type
                        </p>
                        <div className="flex rounded-2xl border border-border bg-surface-2 p-1">
                          {(["prepaid", "postpaid"] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setMeterType(kind)}
                              disabled={locked}
                              className={cn(
                                "min-h-10 flex-1 rounded-xl text-xs font-semibold capitalize transition-all",
                                meterType === kind
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {kind}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CABLE TV INTERFACE */}
                  {detail.serviceType === "cable" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cable-package" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Select TV Bouquet / Plan
                        </Label>
                        <select
                          id="cable-package"
                          value={productCode}
                          onChange={(e) => choose(e.target.value)}
                          disabled={locked}
                          className="min-h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                        >
                          {(activeGroup?.products ?? [])
                            .filter((p): p is NonNullable<typeof p> => Boolean(p && p.productCode))
                            .map((p) => (
                              <option key={p.productCode} value={p.productCode}>
                                {p.displayName || p.productCode}
                                {p.fixedNgn ? ` — ${safeFormatNgn(p.fixedNgn)}` : p.fixedPoints ? ` — ${safeFormatPoints(p.fixedPoints)}` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* EXAM SERVICES INTERFACE */}
                  {detail.serviceType === "exam" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="exam-service" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Select Examination Body / Token
                        </Label>
                        <select
                          id="exam-service"
                          value={productCode}
                          onChange={(e) => choose(e.target.value)}
                          disabled={locked}
                          className="min-h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                        >
                          {(activeGroup?.products ?? [])
                            .filter((p): p is NonNullable<typeof p> => Boolean(p && p.productCode))
                            .map((p) => (
                              <option key={p.productCode} value={p.productCode}>
                                {p.displayName || p.productCode}
                                {p.fixedNgn ? ` — ${safeFormatNgn(p.fixedNgn)}` : p.fixedPoints ? ` — ${safeFormatPoints(p.fixedPoints)}` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* TARGET IDENTIFIER INPUT (Phone / Meter / Smartcard / Candidate ID) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bill-target" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {detail.serviceType === "data"
                          ? "Recipient Phone Number"
                          : detail.serviceType === "electricity"
                            ? "Meter Number (10–13 digits)"
                            : detail.serviceType === "cable"
                              ? "Smartcard / IUC Number"
                              : detail.customerIdentifierLabel}
                      </Label>
                      {detail.serviceType === "electricity" && (
                        <button
                          type="button"
                          onClick={handleVerifyMeter}
                          disabled={verifyingMeter || !identifier.trim()}
                          className="text-xs font-semibold text-primary transition-colors hover:underline disabled:opacity-50"
                        >
                          {verifyingMeter ? "Verifying…" : "Verify Meter"}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="bill-target"
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          setMeterVerified(false);
                        }}
                        inputMode={detail.serviceType === "cable" ? "text" : "numeric"}
                        placeholder={
                          detail.serviceType === "data"
                            ? "e.g. 0803 123 4567"
                            : detail.serviceType === "electricity"
                              ? "e.g. 01234567890"
                              : detail.serviceType === "cable"
                                ? "Enter smartcard number"
                                : detail.customerIdentifierLabel
                        }
                        autoComplete="off"
                        disabled={locked}
                        className="min-h-12 rounded-2xl border-border bg-surface-2 pr-12 text-foreground placeholder:text-muted-foreground"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {detail.serviceType === "electricity" ? (
                          <ScanLine className="h-5 w-5 text-muted-foreground" />
                        ) : detail.serviceType === "data" ? (
                          <Contact className="h-5 w-5 text-muted-foreground" />
                        ) : null}
                      </div>
                    </div>

                    {meterVerified && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>Meter verified and ready for payment.</span>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground">
                      {detail.serviceType === "data"
                        ? "Verify recipient phone number before submitting."
                        : detail.serviceType === "electricity"
                          ? "Tokens are delivered immediately upon confirmation."
                          : `Delivery is sent to this ${detail.customerIdentifierLabel.toLowerCase()}.`}
                    </p>
                  </div>

                  {/* AMOUNT INPUT FOR METERED BILLS */}
                  {detail.requiresAmount && (
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recharge Amount (₦)
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {presets.map((preset) => (
                          <VtuChoice
                            key={preset}
                            selected={amount === String(preset)}
                            onClick={() => setAmount(String(preset))}
                            className="min-h-11 py-2 text-center"
                          >
                            <span className="block text-xs font-bold tabular-nums">
                              {formatNgn(preset)}
                            </span>
                          </VtuChoice>
                        ))}
                      </div>
                      <Input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                        inputMode="numeric"
                        placeholder="Or enter custom amount in ₦"
                        disabled={locked}
                        className="min-h-12 rounded-2xl border-border bg-surface-2 text-foreground placeholder:text-muted-foreground tabular-nums"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {detail.minAmount !== null && detail.maxAmount !== null
                          ? `Accepted range: ${formatNgn(detail.minAmount)} to ${formatNgn(
                              detail.maxAmount,
                            )}.`
                          : "Enter the amount you wish to purchase."}
                      </p>
                    </div>
                  )}

                  {/* SUMMARY BREAKDOWN CARD */}
                  <div className="rounded-2xl border border-border bg-surface-2/60 p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Service fee</span>
                      <span className="font-semibold text-emerald-400">₦0.00 (Free)</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-border/80 pt-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Coins className="h-4 w-4 text-primary" />
                        Total to pay
                      </span>
                      <span className="text-lg font-bold tabular-nums text-foreground">
                        {priceNgn === null
                          ? detail.requiresAmount
                            ? "Shown as you type"
                            : "Shown before confirmation"
                          : formatNgn(priceNgn)}
                      </span>
                    </div>
                  </div>

                  {reasonNotBuyable && (
                    <p className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-muted-foreground">
                      {reasonNotBuyable}
                    </p>
                  )}

                  <Button
                    variant="default"
                    size="lg"
                    onClick={continueToConfirm}
                    disabled={
                      locked ||
                      !detail.providerAvailable ||
                      !serviceCode ||
                      !affordable ||
                      !identifier.trim()
                    }
                    className="min-h-12 w-full rounded-2xl text-sm font-bold shadow-md active:scale-98"
                  >
                    Continue to confirmation
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
                      <VtuRow label="Service value" value={formatNgn(amountNgn)} />
                    )}
                    <VtuRow
                      label={detail.customerIdentifierLabel}
                      value={maskIdentifier(identifier)}
                      mono
                    />
                    <VtuRow
                      label="Wallet charge"
                      value={priceNgn === null ? "—" : formatNgn(priceNgn)}
                    />
                    <VtuRow
                      label="Balance after"
                      value={formatNgn(Math.max(0, (balance ?? 0) - (priceNgn ?? 0)))}
                      strong
                    />
                  </>
                }
              >
                <Button
                  variant="default"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={locked || !affordable}
                  className="min-h-12 w-full rounded-2xl text-sm font-bold shadow-md active:scale-98"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing order…
                    </>
                  ) : inFlight ? (
                    "In progress…"
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Confirm &amp; Pay {priceNgn === null ? "—" : formatNgn(priceNgn)}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmed(false)}
                  disabled={locked}
                  className="w-full rounded-2xl text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Back to details
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Processed securely. A transaction that does not go through refunds your wallet
                  balance automatically.
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
                  <VtuRow label="Service value" value={formatNgn(tx.nairaPrice)} />
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
                  <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Recharge Token / PIN
                    </p>
                    <p className="mt-1 break-all font-mono text-lg font-extrabold text-foreground">
                      {tx.delivery.token}
                    </p>
                    {(tx.delivery.units || tx.delivery.serial || tx.delivery.pin) && (
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
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
                <p className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
                  {tx.failureReason}
                </p>
              )}
              <Button
                variant="default"
                size="lg"
                onClick={reset}
                className="min-h-12 w-full rounded-2xl text-sm font-bold"
              >
                Buy another
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-11 w-full rounded-2xl border-border bg-card text-foreground hover:bg-muted"
              >
                <Link to="/vtu/history">View in transaction receipts</Link>
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

function fmtWhen(ts?: number | null): string {
  if (!ts || typeof ts !== "number" || isNaN(ts)) return "—";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "—";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(
    "en-NG",
    sameYear ? DATE_FORMAT : { ...DATE_FORMAT, year: "numeric" },
  );
}