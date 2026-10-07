import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDownRight, ArrowUpRight, CreditCard, WalletCards } from "lucide-react";
import { formatNgn } from "@/lib/pricing";

export default function Billing() {
  const overview = useQuery(api.serviceHub.getOverview);

  if (!overview) {
    return <div className="space-y-5"><div className="h-10 w-48 animate-pulse rounded bg-muted" /><div className="h-44 animate-pulse rounded-2xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Billing</h1>
        <p className="mt-2 text-sm text-muted-foreground">See how Cloudie services use your NGN wallet.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.08] to-card">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available wallet</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNgn(overview.walletBalanceNgn)}</p>
            <Button asChild size="sm" className="mt-4"><Link to="/wallet/fund">Fund wallet</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spent this month</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNgn(overview.monthlySpentNgn)}</p>
            <p className="mt-2 text-xs text-muted-foreground">{overview.activeServices} active services</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Funded this month</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{formatNgn(overview.monthlyFundedNgn)}</p>
            <p className="mt-2 text-xs text-muted-foreground">Verified wallet deposits</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Recent wallet activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {overview.recentTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No wallet activity yet.</p>
            ) : overview.recentTransactions.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
                <div className={tx.amountNgn >= 0 ? "flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600" : "flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-600"}>
                  {tx.amountNgn >= 0 ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.type} · {new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{tx.amountNgn >= 0 ? "+" : "-"}{formatNgn(Math.abs(tx.amountNgn))}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Account billing</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Link to="/personal/wallet" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted">
              <WalletCards className="h-5 w-5 text-primary" />
              <span className="flex-1 text-sm font-medium">Wallet & ledger</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <Link to="/buy-points" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="flex-1 text-sm font-medium">Fund wallet</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
