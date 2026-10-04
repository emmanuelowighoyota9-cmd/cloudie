import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Wallet, ArrowUpRight, ArrowDownRight, Download } from "lucide-react";
import { useState, useMemo } from "react";

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
};

export default function Transactions() {
  const ledger = useQuery(api.wallet.getLedger, { limit: 200 });
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!ledger) return [];
    if (filter === "all") return ledger;
    if (filter === "credits") return ledger.filter((l) => l.amountNgn > 0);
    if (filter === "debits") return ledger.filter((l) => l.amountNgn < 0);
    return ledger.filter((l) => l.type === filter);
  }, [ledger, filter]);

  const handleExportCSV = () => {
    if (!filtered.length) return;
    const headers = ["Date", "Description", "Type", "Amount", "Balance After", "Reference"];
    const rows = filtered.map((tx) => [
      new Date(tx.createdAt).toISOString(),
      tx.description,
      typeLabels[tx.type] ?? tx.type,
      tx.amountNgn,
      tx.balanceAfterNgn,
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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Transactions</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your complete NGN wallet transaction history.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "credits", label: "Credits" },
          { value: "debits", label: "Debits" },
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
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Transactions List */}
      {ledger === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-4 animate-pulse"><div className="flex items-center gap-4"><div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-700" /><div className="flex-1 space-y-2"><div className="h-3 w-48 bg-slate-100 dark:bg-slate-700 rounded" /><div className="h-2 w-24 bg-slate-100 dark:bg-slate-700 rounded" /></div><div className="h-4 w-16 bg-slate-100 dark:bg-slate-700 rounded" /></div></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><Wallet /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No transactions found</EmptyTitle>
            <EmptyDescription>
              {filter !== "all" ? "Try a different filter." : "Your NGN wallet transactions will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  tx.amountNgn > 0
                    ? "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                    : "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400"
                }`}>
                  {tx.amount > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{tx.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{typeLabels[tx.type] ?? tx.type}</Badge>
                    <span className="text-[11px] text-slate-400">{new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amountNgn.toLocaleString("en-NG")}
                  </p>
                  <p className="text-[10px] text-slate-400">Bal: {tx.balanceAfterNgn.toLocaleString("en-NG")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
