import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Coins, CreditCard, Wallet, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const packages = [
  { id: "starter", name: "Starter", points: 1000, price: 10, icon: Coins, color: "from-blue-500 to-blue-600", popular: false },
  { id: "growth", name: "Growth", points: 2800, price: 25, icon: Zap, color: "from-blue-600 to-indigo-600", popular: true },
  { id: "scale", name: "Scale", points: 6000, price: 50, icon: Wallet, color: "from-indigo-500 to-purple-600", popular: false },
];

export default function BuyPoints() {
  const { user } = useAuth();
  const balance = useQuery(api.points.getBalance);
  const buyPoints = useMutation(api.points.buyPoints);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">("card");
  const [purchased, setPurchased] = useState<{ points: number; amount: number } | null>(null);

  const handlePurchase = async (pkg: typeof packages[0]) => {
    setSelectedPkg(pkg.id);
  };

  const confirmPurchase = async () => {
    if (!selectedPkg) return;
    const pkg = packages.find((p) => p.id === selectedPkg);
    if (!pkg) return;
    setLoading(true);
    try {
      await buyPoints({
        packageId: pkg.id,
        points: pkg.points,
        amountUsd: pkg.price,
        paymentMethod: paymentMethod,
      });
      setPurchased({ points: pkg.points, amount: pkg.price });
      setSelectedPkg(null);
      toast.success(`${pkg.points.toLocaleString()} points added to your account!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to purchase points");
    } finally {
      setLoading(false);
    }
  };

  if (purchased) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Purchase Complete</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your points have been added to your account.</p>
        </div>
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Success!</h2>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              +{purchased.points.toLocaleString()} points added to your wallet
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Charged ${purchased.amount}
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Buy Points</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Current balance: <span className="font-semibold text-blue-600">{(balance ?? 0).toLocaleString()} pts</span>
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
        {packages.map((pkg) => (
          <Card
            key={pkg.id}
            className={`relative overflow-hidden transition-all ${
              selectedPkg === pkg.id
                ? "ring-2 ring-blue-500 shadow-lg"
                : "hover:shadow-md"
            } ${pkg.popular ? "border-blue-500 dark:border-blue-400" : ""}`}
          >
            {pkg.popular && (
              <div className="absolute top-0 right-0">
                <Badge className="rounded-none rounded-bl-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 text-[10px]">
                  Popular
                </Badge>
              </div>
            )}
            <CardContent className="p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${pkg.color} text-white`}>
                <pkg.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{pkg.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">{pkg.points.toLocaleString()}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">pts</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-blue-600">${pkg.price}</p>
              <ul className="mt-4 space-y-2">
                {[
                  `${pkg.points.toLocaleString()} points`,
                  "Instant delivery",
                  "No expiration",
                ].map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-6"
                variant={selectedPkg === pkg.id ? "default" : "outline"}
                onClick={() => handlePurchase(pkg)}
              >
                Select
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Checkout */}
      {selectedPkg && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Package</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {packages.find((p) => p.id === selectedPkg)?.name}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Points</span>
              <span className="font-medium text-slate-900 dark:text-white">
                +{packages.find((p) => p.id === selectedPkg)?.points.toLocaleString()} pts
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Amount</span>
              <span className="font-bold text-lg text-slate-900 dark:text-white">
                ${packages.find((p) => p.id === selectedPkg)?.price}
              </span>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Payment Method</p>
              <div className="flex gap-2">
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setPaymentMethod("card")}
                >
                  <CreditCard className="h-4 w-4" /> Card
                </Button>
                <Button
                  variant={paymentMethod === "crypto" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setPaymentMethod("crypto")}
                >
                  <Coins className="h-4 w-4" /> Crypto
                </Button>
              </div>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">
              {paymentMethod === "card"
                ? "Payment will be processed securely via our payment partner. Points are credited upon successful verification."
                : "Crypto deposits are processed via Web3. Points are credited after blockchain confirmation."}
            </p>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedPkg(null)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={confirmPurchase} disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                {loading ? "Processing..." : `Pay $${packages.find((p) => p.id === selectedPkg)?.price}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
