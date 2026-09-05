import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Plus, Receipt, Store } from "lucide-react";
import { Link } from "react-router";

export default function Personal() {
  const { user } = useAuth();
  const balance = useQuery(api.points.getBalance);
  const ledger = useQuery(api.points.getLedger, { limit: 50 });

  const totalEarned = (ledger ?? []).filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalSpent = (ledger ?? []).filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Personal Workspace</h1>
          <div className="flex gap-2">
            <Link to="/buy-points"><Button size="sm" className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"><Plus className="h-4 w-4" /> Buy Points</Button></Link>
            <Link to="/orders"><Button size="sm" variant="outline" className="gap-1.5"><Receipt className="h-4 w-4" /> Orders</Button></Link>
            <Link to="/vendor"><Button size="sm" variant="outline" className="gap-1.5"><Store className="h-4 w-4" /> Vendor</Button></Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your wallet, transactions, and profile.</p>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="notebook-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
                <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Balance</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{(balance ?? 0).toLocaleString()} pts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="notebook-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/50">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Total Earned</p>
                <p className="text-2xl font-bold text-green-600">+{totalEarned.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="notebook-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50">
                <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Total Spent</p>
                <p className="text-2xl font-bold text-amber-600">-{totalSpent.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card className="notebook-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!ledger ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-2 w-20 bg-muted rounded" />
                  </div>
                  <div className="h-4 w-12 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : ledger.length === 0 ? (
            <div className="py-12 text-center">
              <Coins className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No transactions yet. Your point activity will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {ledger.map((tx) => (
                <div
                  key={tx._id}
                  className="flex items-center gap-3 rounded-lg p-3 hover:bg-[var(--nb-ink)]/5 transition-colors"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      tx.amount > 0
                        ? "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                        : "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400"
                    }`}
                  >
                    {tx.amount > 0 ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--nb-ink)]">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.type.replace(/_/g, " ")} • {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold ${
                        tx.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Bal: {tx.balanceAfter.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
