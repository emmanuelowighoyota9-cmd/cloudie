import { useAction, useQuery } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { formatNgn } from "@/lib/pricing";

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    deposit: "Wallet funding", purchase: "Purchase", service_charge: "Service",
    refund: "Refund", admin_adjustment: "Admin adjustment", referral_reward: "Referral",
    vendor_transaction: "Vendor", marketplace_purchase: "Marketplace",
    shipment_creation: "Shipment", document_generation: "Document",
    email_dispatch: "Email", image_rendering: "Render", vtu_purchase: "VTU",
    vtu_refund: "VTU refund", migration: "Wallet migration",
  };
  return labels[type] ?? type;
}

export default function Wallet() {
  const balance = useQuery(api.wallet.getBalance);
  const ledger = useQuery(api.wallet.getLedger, { limit: 100 });
  const recoverPendingCredits = useAction(api.paystack.recoverPendingCredits);

  useEffect(() => {
    recoverPendingCredits({}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="cloudie-wallet-page space-y-5 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">NGN Wallet</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your real naira balance and transaction history.</p>
        </div>
        <Link to="/buy-points" className="w-full sm:w-auto">
          <Button size="sm" className="w-full gap-1.5 sm:w-auto">
            <Plus className="h-4 w-4" /> Fund Wallet
          </Button>
        </Link>
      </div>

      <Card className="cloudie-balance-card">
        <CardContent className="p-6">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Available balance</p>
          <p className="mt-2 cloudie-balance-amount mt-2 text-4xl font-bold text-foreground">{formatNgn(balance ?? 0)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Nigerian Naira · NGN</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!ledger ? (
            <p className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading transactions...</p>
          ) : ledger.length === 0 ? (
            <div className="py-12 text-center">
              <WalletIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No wallet transactions yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {ledger.map((tx) => (
                <div key={tx._id} className="cloudie-activity-row flex items-center gap-3 rounded-lg p-3">
                  <div className={`cloudie-flow-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tx.amountNgn > 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {tx.amountNgn > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                    <p className="text-xs text-slate-400">{typeLabel(tx.type)} • {new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${tx.amountNgn > 0 ? "text-primary" : "text-destructive"}`}>
                      {tx.amountNgn > 0 ? "+" : ""}{formatNgn(tx.amountNgn)}
                    </p>
                    <p className="text-[11px] text-slate-400">Balance {formatNgn(tx.balanceAfterNgn)}</p>
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
