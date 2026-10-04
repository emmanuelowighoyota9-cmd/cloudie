import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Wallet, Zap, Shield, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { formatNgn, usePricing } from "@/lib/pricing";

const PACKAGE_STYLES = [
  { icon: Wallet, color: "from-blue-500 to-blue-600" },
  { icon: Zap, color: "from-blue-600 to-indigo-600" },
  { icon: Wallet, color: "from-indigo-500 to-indigo-600" },
];

export default function BuyPoints() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const balance = useQuery(api.wallet.getBalance);
  const initializePayment = useAction(api.paystack.initializePayment);
  const verifyAndCredit = useAction(api.paystack.verifyAndCredit);
  const recoverPendingCredits = useAction(api.paystack.recoverPendingCredits);
  const { packages, loading: pricingLoading } = usePricing();
  const [amount, setAmount] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [funded, setFunded] = useState<number | null>(null);

  useEffect(() => {
    recoverPendingCredits({}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ref = searchParams.get("reference");
    if (!ref || verifying) return;
    setVerifying(true);
    verifyAndCredit({ reference: ref })
      .then((result) => {
        if (result.verified) {
          setFunded(result.amountNgn);
          toast.success(`₦${result.amountNgn.toLocaleString("en-NG")} added to your wallet.`);
        } else {
          toast.error(result.message ?? "Payment could not be verified.");
        }
        setSearchParams({});
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Verification failed"))
      .finally(() => setVerifying(false));
  }, [searchParams, verifying, setSearchParams, verifyAndCredit]);

  const handlePurchase = async (priceNgn: number, packageId: string) => {
    if (!user?.email) {
      toast.error("Email is required for payment. Please update your profile.");
      return;
    }
    if (!Number.isFinite(priceNgn) || priceNgn < 100) {
      toast.error("Minimum wallet funding is ₦100.");
      return;
    }
    setLoading(true);
    setSelectedPkg(packageId);
    try {
      const result = await initializePayment({
        packageId,
        amountNgn: priceNgn,
        amountUsd: 0,
        currency: "NGN",
        email: user.email,
        callbackUrl: window.location.origin,
      });
      window.location.href = result.authorization_url;
    } catch (err) {
      setLoading(false);
      setSelectedPkg(null);
      toast.error(err instanceof Error ? err.message : "Payment failed to initialize");
    }
  };

  if (verifying) {
    return <Card className="mx-auto mt-10 max-w-md"><CardContent className="p-8 text-center">
      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="mt-4 text-sm text-muted-foreground">Confirming your payment…</p>
    </CardContent></Card>;
  }

  if (funded !== null) {
    return <div className="mx-auto max-w-md space-y-6">
      <Card><CardContent className="p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Wallet funded</h2>
        <p className="mt-2 text-muted-foreground">₦{funded.toLocaleString("en-NG")} was added to your NGN wallet.</p>
        <p className="mt-2 font-semibold">Current balance: {formatNgn(balance ?? 0)}</p>
        <Button className="mt-6" onClick={() => setFunded(null)}>Fund Wallet Again</Button>
      </CardContent></Card>
    </div>;
  }

  const customAmount = Number(amount);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fund Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add real Nigerian naira to your Cloudie wallet. Your balance is held in NGN and used directly for purchases.
        </p>
      </div>

      <Card className="max-w-xl border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Available balance</p>
          <p className="mt-2 text-3xl font-bold">{formatNgn(balance ?? 0)}</p>
          <div className="mt-4 flex gap-2">
            <input
              inputMode="decimal"
              type="number"
              min="100"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount, e.g. 5000"
              className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
            />
            <Button
              disabled={loading || !Number.isFinite(customAmount) || customAmount < 100}
              onClick={() => handlePurchase(customAmount, `custom-${customAmount}`)}
            >
              {loading && selectedPkg?.startsWith("custom-") ? "Processing…" : "Fund"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Minimum ₦100 · Card, bank transfer, USSD and other Paystack methods.</p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick funding amounts</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pricingLoading && packages.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>}
          {packages.map((pkg, index) => {
            const style = PACKAGE_STYLES[index % PACKAGE_STYLES.length];
            const Icon = style.icon;
            return (
              <Card key={pkg.id} className="overflow-hidden">
                <CardContent className="p-5">
                  {pkg.popular && <Badge className="mb-3">Popular</Badge>}
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${style.color} text-white`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold">{pkg.name}</h3>
                  <p className="mt-1 text-2xl font-bold">{formatNgn(pkg.priceNgn)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Wallet funding · no points conversion</p>
                  <Button
                    className="mt-5 w-full gap-2"
                    onClick={() => handlePurchase(pkg.priceNgn, pkg.id)}
                    disabled={loading}
                  >
                    <CreditCard className="h-4 w-4" />
                    {loading && selectedPkg === pkg.id ? "Processing…" : `Add ${formatNgn(pkg.priceNgn)}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="max-w-4xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Secure NGN funding</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex gap-3"><Shield className="h-5 w-5 text-green-500 shrink-0" /><p className="text-xs text-muted-foreground">Payments are verified server-side before wallet credit.</p></div>
          <div className="flex gap-3"><CreditCard className="h-5 w-5 text-blue-500 shrink-0" /><p className="text-xs text-muted-foreground">Pay securely in Nigerian naira through Paystack.</p></div>
          <div className="flex gap-3"><ArrowRight className="h-5 w-5 text-primary shrink-0" /><p className="text-xs text-muted-foreground">The verified amount becomes spendable NGN balance.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
