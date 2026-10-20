import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Plus, Send, Receipt, ShieldCheck, Activity, Coins } from "lucide-react";
import { Link } from "react-router";
import { formatNgn } from "@/lib/pricing";
import { usePricing } from "@/lib/pricing";

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    deposit: "Wallet funding",
    purchase: "Purchase",
    service_charge: "Service",
    refund: "Refund",
    admin_adjustment: "Admin adjustment",
    referral_reward: "Referral",
    vendor_transaction: "Vendor",
    marketplace_purchase: "Marketplace",
    shipment_creation: "Shipment",
    document_generation: "Document",
    email_dispatch: "Email",
    image_rendering: "Render",
    vtu_purchase: "VTU",
    vtu_refund: "VTU refund",
    migration: "Wallet migration",
    credit_points: "Points credit",
  };
  return labels[type] ?? type;
}

export default function Wallet() {
  const { ngnPerPoint } = usePricing();
  const balance = useQuery(api.wallet.getBalance);
  const pointsBalance = useQuery(api.points.getPointsBalance);
  const ledger = useQuery(api.wallet.getLedger, { limit: 100 });
  const pointLedger = useQuery(api.points.getPointLedger, { limit: 50 });
  const recoverPendingCredits = useAction(api.paystack.recoverPendingCredits);

  useEffect(() => {
    recoverPendingCredits({}).catch(() => {});
  }, [recoverPendingCredits]);

  const stats = useMemo(() => {
    const rows = ledger ?? [];
    const credits = rows.filter((tx) => tx.amountNgn > 0).reduce((sum, tx) => sum + tx.amountNgn, 0);
    const debits = rows.filter((tx) => tx.amountNgn < 0).reduce((sum, tx) => sum + Math.abs(tx.amountNgn), 0);
    return { credits, debits, count: rows.length };
  }, [ledger]);

  const pointsStats = useMemo(() => {
    const rows = pointLedger ?? [];
    const credits = rows.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const debits = rows.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return { credits, debits, count: rows.length };
  }, [pointLedger]);

  const showPoints = pointsBalance !== null && pointsBalance !== undefined && pointsBalance > 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cloudie Wallet</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Your credits, ready when you are.</h1>
          <p className="mt-1 text-sm text-muted-foreground">NGN balance and shared platform credits in one place.</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/buy-points">
            <Plus className="size-4" /> Fund wallet
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.12] via-card to-card">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Available balance</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{formatNgn(balance ?? 0)}</p>
                <p className="mt-2 text-xs text-muted-foreground">Nigerian Naira · NGN</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                <div className="rounded-2xl border border-border bg-card/80 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{formatNgn(stats.credits)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Spent</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{formatNgn(stats.debits)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/80 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Entries</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{stats.count}</p>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Link to="/buy-points" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="size-4" /> Add money
              </Link>
              <Link to="/transactions" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground hover:bg-muted">
                <Receipt className="size-4" /> Transactions
              </Link>
              <Link to="/vtu/airtime" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground hover:bg-muted">
                <Send className="size-4" /> Buy airtime
              </Link>
              <Link to="/settings" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-foreground hover:bg-muted">
                <ShieldCheck className="size-4" /> Security
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-card">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Coins className="size-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform credits</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {typeof pointsBalance === "number" ? `${pointsBalance.toLocaleString()} pts` : "—"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Shared across eligible Cloudie services
                </p>
                {ngnPerPoint > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {ngnPerPoint} NGN per credit
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits earned</p>
                <p className="mt-1 text-sm font-bold text-foreground">{pointsStats.credits.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits used</p>
                <p className="mt-1 text-sm font-bold text-foreground">{pointsStats.debits.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Records</p>
                <p className="mt-1 text-sm font-bold text-foreground">{pointsStats.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Ledger entries</p>
              <p className="font-bold text-foreground">{stats.count}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ArrowUpRight className="size-5 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">Money in</p>
              <p className="font-bold text-foreground">{formatNgn(stats.credits)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ArrowDownRight className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Money out</p>
              <p className="font-bold text-foreground">{formatNgn(stats.debits)}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Wallet activity</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Your latest balance movements.</p>
          </div>
          <Link to="/transactions" className="text-xs font-semibold text-primary">View all</Link>
        </CardHeader>
        <CardContent className="pt-0">
          {!ledger ? (
            <p className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading transactions...</p>
          ) : ledger.length === 0 ? (
            <div className="py-12 text-center">
              <WalletIcon className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-semibold text-foreground">No wallet transactions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Fund your wallet to start using Cloudie services.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(ledger ?? []).map((tx) => (
                <div key={tx._id} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-muted/50">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      tx.amountNgn > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {tx.amountNgn > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabel(tx.type)} · {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${tx.amountNgn > 0 ? "text-emerald-600" : "text-foreground"}`}>
                      {tx.amountNgn > 0 ? "+" : ""}{formatNgn(tx.amountNgn)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Balance {formatNgn(tx.balanceAfterNgn)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showPoints && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent credits activity</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Points earned and used across services.</p>
            </div>
            <Link to="/transactions" className="text-xs font-semibold text-primary">View all</Link>
          </CardHeader>
          <CardContent className="pt-0">
            {(pointLedger ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <Coins className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-semibold text-foreground">No credits activity yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {(pointLedger ?? []).slice(0, 8).map((tx) => (
                  <div key={tx._id} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-muted/50">
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                        tx.amount > 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {tx.amount > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel(tx.type)} · {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold ${tx.amount > 0 ? "text-primary" : "text-destructive"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} pts
                      </p>
                      <p className="text-[10px] text-muted-foreground">Balance {tx.balanceAfter.toLocaleString()} pts</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
