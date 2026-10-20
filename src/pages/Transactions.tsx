import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Wallet, ArrowUpRight, ArrowDownRight, Download, Coins } from "lucide-react";
import { useState, useMemo } from "react";
import { formatNgn } from "@/lib/pricing";

const typeLabels: Record<string, string> = {
  deposit: "Deposit",
  purchase: "Purchase",
  service_charge: "Service Charge",
  refund: "Refund",
  admin_adjustment: "Admin Adjustment",
  referral_reward: "Referral Reward",
  vendor_transaction: "Vendor Transaction",
  marketplace_purchase: "Marketplace Purchase",
  shipment_creation: "Shipment",
  tracking_update: "Tracking",
  document_generation: "Document",
  email_dispatch: "Email",
  image_rendering: "Render",
  credit_points: "Points Credit",
  vtu_purchase: "VTU Purchase",
  vtu_refund: "VTU Refund",
};

export default function Transactions() {
  const ledger = useQuery(api.wallet.getLedger, { limit: 200 });
  const pointLedger = useQuery(api.points.getPointLedger, { limit: 200 });
  const [filter, setFilter] = useState<"all" | "credits" | "debits" | "points">("all");

  const combined = useMemo(() => {
    const rows: Array<{
      _id: string;
      kind: "naira" | "points";
      createdAt: number;
      description: string;
      type: string;
      amount: number;
      balanceAfter: number | null;
      reference: string | undefined;
    }> = [];

    if (ledger) {
      for (const tx of ledger) {
        rows.push({
          _id: tx._id,
          kind: "naira",
          createdAt: tx.createdAt,
          description: tx.description,
          type: tx.type,
          amount: tx.amountNgn,
          balanceAfter: tx.balanceAfterNgn,
          reference: tx.reference,
        });
      }
    }

    if (pointLedger) {
      for (const tx of pointLedger) {
        rows.push({
          _id: tx._id,
          kind: "points",
          createdAt: tx.createdAt,
          description: tx.description,
          type: tx.type,
          amount: tx.amount,
          balanceAfter: tx.balanceAfter,
          reference: tx.reference,
        });
      }
    }

    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  }, [ledger, pointLedger]);

  const filtered = useMemo(() => {
    const rows = combined;
    if (filter === "all") return rows;
    if (filter === "credits") return rows.filter((row) => row.kind === "naira" && row.amount > 0);
    if (filter === "debits") return rows.filter((row) => row.kind === "naira" && row.amount < 0);
    if (filter === "points") return rows.filter((row) => row.kind === "points");
    return rows;
  }, [combined, filter]);

  const handleExportCSV = () => {
    if (!filtered.length) return;
    const headers = ["Date", "Kind", "Description", "Type", "Amount", "Balance After", "Reference"];
    const rows = filtered.map((tx) => [
      new Date(tx.createdAt).toISOString(),
      tx.kind,
      tx.description,
      typeLabels[tx.type] ?? tx.type,
      tx.kind === "naira" ? tx.amount : `${tx.amount} pts`,
      tx.balanceAfter !== null && tx.balanceAfter !== undefined ? `${tx.balanceAfter}${tx.kind === "points" ? " pts" : ""}` : "",
      tx.reference ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cloudie-transactions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cloudie-transactions-page space-y-5 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your NGN wallet and credits activity, together.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="cloudie-filter-bar flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "credits", label: "Credits" },
          { value: "debits", label: "Debits" },
          { value: "points", label: "Credits activity" },
          { value: "purchase", label: "Purchases" },
          { value: "service_charge", label: "Services" },
          { value: "referral_reward", label: "Referrals" },
          { value: "admin_adjustment", label: "Admin" },
          { value: "shipment_creation", label: "Shipments" },
          { value: "document_generation", label: "Documents" },
        ].map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value as "all" | "credits" | "debits" | "points")}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {combined.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><Wallet /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No transactions found</EmptyTitle>
            <EmptyDescription>
              Your NGN wallet and credits transactions will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((tx) => {
              const positive = tx.amount > 0;
              const isPoints = tx.kind === "points";
              return (
                <div key={tx._id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div
                    className={`cloudie-flow-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isPoints
                        ? "bg-primary/10 text-primary"
                        : positive
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {isPoints ? <Coins className="h-4 w-4" /> : positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{typeLabels[tx.type] ?? tx.type}</Badge>
                      <span className="text-[11px] text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isPoints ? "text-primary" : positive ? "text-primary" : "text-destructive"}`}>
                      {isPoints
                        ? `${positive ? "+" : ""}${tx.amount.toLocaleString()} pts`
                        : `${positive ? "+" : ""}₦{Math.abs(tx.amount).toLocaleString("en-NG")}`}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {tx.balanceAfter !== null && tx.balanceAfter !== undefined
                        ? `Bal: ${isPoints ? `${tx.balanceAfter.toLocaleString()} pts` : formatNgn(tx.balanceAfter)}`
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
