import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Coins, CreditCard, Wallet, Zap, Shield, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePricing, formatNgn, formatUsd } from "@/lib/pricing";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (config: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref: string;
        onClose?: () => void;
        callback: (response: { reference: string; status: string }) => void;
      }) => { openIframe: () => void };
    };
  }
}

/** Visual treatment per package slot — content comes from admin pricing. */
const PACKAGE_STYLES = [
  { icon: Coins, color: "from-blue-500 to-blue-600" },
  { icon: Zap, color: "from-blue-600 to-indigo-600" },
  { icon: Wallet, color: "from-indigo-500 to-indigo-600" },
  { icon: Coins, color: "from-sky-500 to-blue-600" },
];

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return; }
    const existing = document.querySelector("script[src*=\"js.paystack.co\"]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack script"));
    document.head.appendChild(script);
  });
}

export default function BuyPoints() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const balance = useQuery(api.points.getBalance);
  const initializePayment = useAction(api.paystack.initializePayment);
  const verifyAndCredit = useAction(api.paystack.verifyAndCredit);
  const recoverPendingCredits = useAction(api.paystack.recoverPendingCredits);
  const { packages, ngnPerPoint, ngnLabel, loading: pricingLoading } = usePricing();
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [purchased, setPurchased] = useState<{ points: number; ngn: number; usd: number } | null>(null);

  // Load Paystack script
  useEffect(() => {
    loadPaystackScript().catch(() => {
      toast.error("Could not load payment processor. Please refresh.");
    });
  }, []);

  // Self-heal: credit any recent payment whose callback/webhook never arrived
  // (closed tab, dropped redirect). Skipped during the callback flow below.
  useEffect(() => {
    if (searchParams.get("reference")) return;
    recoverPendingCredits({})
      .then((r) => {
        if (r.recovered > 0) {
          toast.success(
            `${r.points.toLocaleString()} points from an earlier payment were added to your wallet!`,
          );
        }
      })
      .catch(() => {
        // best-effort — the webhook/callback paths still cover crediting
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle return from Paystack (callback URL)
  useEffect(() => {
    const ref = searchParams.get("reference");
    if (ref && !verifying) {
      setVerifying(true);

      const settlePoints = (result: { points?: number; credited?: boolean }) => {
        const pkg = packages.find((p) => p.id === searchParams.get("packageId"));
        setPurchased({
          points: result.points ?? pkg?.points ?? 0,
          ngn: pkg?.priceNgn ?? 0,
          usd: pkg?.priceUsd ?? 0,
        });
        if (result.credited) {
          toast.success(`${(result.points ?? 0).toLocaleString()} points added to your account!`);
        } else {
          toast.info("Payment confirmed — your points are already in your wallet.");
        }
      };

      // Paystack can still report the charge as settling right after redirect —
      // poll a few times so the credit lands on this visit.
      const verifyWithRetry = async () => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
          try {
            const result = await verifyAndCredit({ reference: ref });
            if (result.verified) return result;
            const status = (result.status ?? "").toLowerCase();
            // Only keep polling while the charge is still settling.
            if (!["pending", "processing", "ongoing"].includes(status)) return result;
            lastError = null;
          } catch (err) {
            lastError = err;
          }
        }
        if (lastError) throw lastError;
        return {
          verified: false as const,
          message: "Payment is still processing — it will be credited shortly. Check your wallet in a moment.",
        };
      };

      verifyWithRetry()
        .then((result) => {
          if (result.verified) {
            settlePoints(result);
          } else {
            toast.error(result.message ?? "Payment could not be verified.");
          }
          setSearchParams({});
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "Verification failed");
          setSearchParams({});
        })
        .finally(() => setVerifying(false));
    }
  }, [searchParams]);

  const handlePurchase = async (pkg: typeof packages[0]) => {
    if (!user?.email) {
      toast.error("Email is required for payment. Please update your profile.");
      return;
    }

    setLoading(true);
    setSelectedPkg(pkg.id);

    try {
      // Initialize payment on server — naira settlement via Paystack.
      const result = await initializePayment({
        packageId: pkg.id,
        points: pkg.points,
        amountUsd: pkg.priceUsd,
        amountNgn: pkg.priceNgn,
        currency: "NGN",
        email: user.email,
        // Absolute origin — the action runs server-side where `window` never exists.
        callbackUrl: window.location.origin,
      });

      // Redirect to Paystack checkout page
      window.location.href = result.authorization_url;
    } catch (err) {
      setLoading(false);
      setSelectedPkg(null);
      toast.error(err instanceof Error ? err.message : "Payment failed to initialize");
    }
  };

  if (verifying) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Verifying Payment</h1>
          <p className="mt-1 text-sm text-muted-foreground">Please wait while we confirm your payment...</p>
        </div>
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="mt-4 text-sm text-muted-foreground">Confirming your payment with Paystack...</p>
            <p className="mt-1 text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (purchased) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Purchase Complete</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your points have been added to your account.</p>
        </div>
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-foreground">Success!</h2>
            <p className="mt-2 text-muted-foreground">
              +{purchased.points.toLocaleString()} points added to your wallet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Charged {formatNgn(purchased.ngn)}
              {purchased.usd > 0 && ` (${formatUsd(purchased.usd)})`}
            </p>
            <p className="mt-3 text-sm text-foreground">
              New balance:{" "}
              <span className="font-semibold text-primary">{(balance ?? 0).toLocaleString()} pts</span>
            </p>
            <Button className="mt-6" onClick={() => setPurchased(null)}>
              Buy More Points
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Buy Points</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Current balance: <span className="font-semibold text-primary">{(balance ?? 0).toLocaleString()} pts</span>
          <span className="ml-1 text-muted-foreground">≈ {ngnLabel(balance ?? 0)}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          1 point = {formatNgn(ngnPerPoint)} · all prices charged in naira (₦)
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
        {pricingLoading && packages.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-sm text-muted-foreground animate-pulse">
              Loading packages…
            </CardContent>
          </Card>
        )}
        {packages.map((pkg, index) => {
          const style = PACKAGE_STYLES[index % PACKAGE_STYLES.length];
          const Icon = style.icon;
          return (
            <Card
              key={pkg.id}
              className={`relative overflow-hidden transition-all ${
                selectedPkg === pkg.id
                  ? "ring-2 ring-primary shadow-lg"
                  : "hover:shadow-md"
              } ${pkg.popular ? "border-primary" : ""}`}
            >
              {pkg.popular && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-none rounded-bl-lg bg-blue-600 text-white border-0 text-[10px]">
                    Popular
                  </Badge>
                </div>
              )}
              <CardContent className="p-6">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${style.color} text-white`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-foreground">{pkg.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{pkg.points.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground">pts</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-primary">{formatNgn(pkg.priceNgn)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatUsd(pkg.priceUsd)} · {formatNgn(pkg.priceNgn / (pkg.points || 1))}/pt
                </p>
                <ul className="mt-4 space-y-2">
                  {[
                    `${pkg.points.toLocaleString()} points`,
                    "Instant delivery",
                    "No expiration",
                    "Secure via Paystack (₦)",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full mt-6 gap-2"
                  variant={selectedPkg === pkg.id ? "default" : "outline"}
                  onClick={() => handlePurchase(pkg)}
                  disabled={loading}
                >
                  {loading && selectedPkg === pkg.id ? (
                    "Processing..."
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" /> Pay {formatNgn(pkg.priceNgn)}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Payment Info */}
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Secure Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Bank-Level Security</p>
                <p className="text-xs text-muted-foreground">256-bit SSL encryption protects your payment data.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Pay in Naira</p>
                <p className="text-xs text-muted-foreground">Card, bank transfer, USSD, and more via Paystack.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ArrowRight className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Instant Credit</p>
                <p className="text-xs text-muted-foreground">Points are credited immediately after payment verification.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
