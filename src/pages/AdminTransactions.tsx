import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function AdminTransactions() {
  const ledger = useQuery(api.points.getAdminLedger, { limit: 100 });
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Coins className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Transaction Ledger</h1>
          <p className="mt-1 text-sm text-muted-foreground">All point transactions across the platform.</p>
        </div>
      </div>
      <Card className="notebook-card"><CardContent>
        {!ledger ? <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading...</p> : ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transactions.</p>
        ) : (
          <div className="space-y-1">
            {ledger.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--nb-ink)]/5">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tx.amount > 0 ? "bg-green-100 text-green-600 dark:bg-green-900/50" : "bg-red-100 text-red-600 dark:bg-red-900/50"}`}>
                  {tx.amount > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--nb-ink)] truncate">{tx.description}</p>
                  <p className="text-[10px] text-muted-foreground">{tx.type.replace(/_/g, " ")} • {new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <span className={`text-xs font-bold shrink-0 ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>{tx.amount > 0 ? "+" : ""}{tx.amount}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
