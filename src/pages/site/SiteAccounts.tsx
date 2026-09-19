import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useState } from "react";
import { toast } from "sonner";
import {
  Landmark, PiggyBank, CreditCard, ArrowDownLeft, ArrowUpRight,
  Plus, Wallet,
} from "lucide-react";

const ACCOUNT_COLORS: Record<string, string> = {
  checking: "from-[#003087] to-[#0050a0]",
  savings: "from-[#00695c] to-[#00897b]",
  credit: "from-[#b71c1c] to-[#c62828]",
};
const ACCOUNT_ICONS: Record<string, typeof Landmark> = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
};
function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function maskAccount(n: string) {
  return `••••${n.slice(-4)}`;
}

export default function SiteAccounts() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const accounts = useQuery(api.tenants.myAccounts, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const depositMut = useMutation(api.tenants.depositToAccount);
  const withdrawMut = useMutation(api.tenants.withdrawFromAccount);
  const primary = site?.branding?.primaryColor || "#003087";
  if (!site) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Site not found</div></div>;

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedAcct, setSelectedAcct] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDeposit = async () => {
    if (!selectedAcct || !amount || !siteId) return;
    setBusy(true);
    try {
      await depositMut({ tenantId: siteId as Id<"tenantSites">, accountId: selectedAcct as Id<"tenantAccounts">, amount: Number(amount), description: desc || undefined });
      toast.success("Deposit successful");
      setDepositOpen(false); setAmount(""); setDesc(""); setSelectedAcct("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleWithdraw = async () => {
    if (!selectedAcct || !amount || !siteId) return;
    setBusy(true);
    try {
      await withdrawMut({ tenantId: siteId as Id<"tenantSites">, accountId: selectedAcct as Id<"tenantAccounts">, amount: Number(amount), description: desc || undefined });
      toast.success("Withdrawal processed");
      setWithdrawOpen(false); setAmount(""); setDesc(""); setSelectedAcct("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (site === undefined || accounts === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }

  return (
    <SiteLayout active="accounts" authenticated>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Accounts</h1>
            <p className="mt-1 text-sm text-gray-500">Manage your {site.siteType === "bank" ? "banking" : "investment"} accounts.</p>
          </div>
        </div>

        {!accounts || accounts.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
            <Wallet className="mx-auto h-14 w-14 text-gray-300" />
            <h3 className="mt-4 text-lg font-bold text-gray-900">No accounts yet</h3>
            <p className="mt-2 text-sm text-gray-500">Contact the bank administrator to open your first account.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acct) => {
              const Icon = ACCOUNT_ICONS[acct.accountType] || Landmark;
              return (
                <div key={acct._id} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${ACCOUNT_COLORS[acct.accountType]} p-6 text-white shadow-lg hover:shadow-xl transition-shadow`}>
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-[10px] font-bold bg-white/15 rounded-full px-2.5 py-1 uppercase tracking-wider">{acct.accountType}</span>
                  </div>
                  <p className="mt-5 text-sm text-white/80">{acct.name}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">{fmtCurrency(acct.balance)}</p>
                  <div className="mt-3 border-t border-white/15 pt-3 flex items-center justify-between">
                    <p className="font-mono text-[11px] text-white/50">{maskAccount(acct.accountNumber)}</p>
                    {!acct.isActive && <span className="text-[10px] font-bold text-red-300 uppercase">Closed</span>}
                  </div>
                  {acct.isActive && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => { setSelectedAcct(acct._id); setDepositOpen(true); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 text-xs font-semibold hover:bg-white/25 transition-colors"
                      >
                        <ArrowDownLeft className="h-3.5 w-3.5" /> Deposit
                      </button>
                      <button
                        onClick={() => { setSelectedAcct(acct._id); setWithdrawOpen(true); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 text-xs font-semibold hover:bg-white/25 transition-colors"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" /> Withdraw
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Deposit Dialog */}
        {depositOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDepositOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Make a Deposit</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Paycheck"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setDepositOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleDeposit} disabled={busy || !amount} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 shadow-lg" style={{ backgroundColor: primary }}>
                  {busy ? "Processing..." : "Deposit"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Withdraw Dialog */}
        {withdrawOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setWithdrawOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Make a Withdrawal</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. ATM withdrawal"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setWithdrawOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleWithdraw} disabled={busy || !amount} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-lg">
                  {busy ? "Processing..." : "Withdraw"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
