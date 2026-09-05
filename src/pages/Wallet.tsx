import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, ArrowUpRight, ArrowDownRight, Plus } from "lucide-react";
import { Link } from "react-router";

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    deposit: "Deposit", purchase: "Purchase", service_charge: "Service",
    refund: "Refund", admin_adjustment: "Admin", referral_reward: "Referral",
    vendor_transaction: "Vendor", marketplace_purchase: "Marketplace",
    shipment_creation: "Shipment", document_generation: "Document",
    email_dispatch: "Email", image_rendering: "Render",
  };
  return labels[type] ?? type;
}

export default function Wallet() {
  const balance = useQuery(api.points.getBalance);
  const ledger = useQuery(api.points.getLedger, { limit: 100 });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Wallet</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your points balance and transaction history.</p>
        </div>
        <Link to="/buy-points">
          <Button size="sm" className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            <Plus className="h-4 w-4" /> Buy Points
          </Button>
        </Link>
      </div>

      {/* Balance */}
      <Card className="notebook-card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 border-blue-200 dark:border-blue-800">
        <CardContent className="p-6">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Points Balance</p>
          <p className="mt-2 text-4xl font-bold text-blue-900 dark:text-blue-100">
            {(balance ?? 0).toLocaleString()}
          </p>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!ledger ? (
            <p className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading transactions...</p>
          ) : ledger.length === 0 ? (
            <div className="py-12 text-center">
              <Coins className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No transactions yet.</p>
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
                    {tx.amount > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--nb-ink)]">{tx.description}</p>
                  <p className="text-xs text-slate-400">
                    {typeLabel(tx.type)} • {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                  </div>
                  <p
                    className={`text-sm font-bold shrink-0 ${
                      tx.amount > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
