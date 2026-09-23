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
import { bankTheme } from "@/lib/tenantBankTheme";

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

  // Design kit from the banking template applied at tenancy creation.
  const theme = bankTheme(site?.branding);
  const { primary, accent, panel, border, text, muted, radius, inputBg, isDark } = theme;

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedAcct, setSelectedAcct] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  if (!site) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Site not found</div></div>;

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

  // Card faces follow the tenant palette; credit stays deliberately distinct.
  const accountGradient = (type: string) =>
    type === "checking"
      ? `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`
      : type === "savings"
        ? `linear-gradient(135deg, ${accent} 0%, ${primary} 118%)`
        : "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)";

  const fieldStyle = { backgroundColor: inputBg, border: `1px solid ${border}`, color: text, borderRadius: radius } as const;

  const dialog = (
    kind: "deposit" | "withdraw",
    onClose: () => void,
    onSubmit: () => void,
  ) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 shadow-2xl"
        style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius, color: text }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">{kind === "deposit" ? "Make a Deposit" : "Make a Withdrawal"}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: muted }}>Amount</label>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className="w-full px-4 py-3 text-sm outline-none" style={fieldStyle} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: muted }}>Description (optional)</label>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder={kind === "deposit" ? "e.g. Paycheck" : "e.g. ATM withdrawal"}
              className="w-full px-4 py-3 text-sm outline-none" style={fieldStyle} />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium"
            style={{ border: `1px solid ${border}`, borderRadius: radius, color: muted }}>
            Cancel
          </button>
          <button onClick={onSubmit} disabled={busy || !amount}
            className="flex-1 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
            style={{ backgroundColor: kind === "deposit" ? primary : "#DC2626", borderRadius: radius }}>
            {busy ? "Processing..." : kind === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <SiteLayout active="accounts" authenticated>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Accounts</h1>
            <p className="mt-1 text-sm" style={{ color: muted }}>
              Manage your {site.siteType === "bank" ? "banking" : "investment"} accounts.
            </p>
          </div>
        </div>

        {!accounts || accounts.length === 0 ? (
          <div className="p-16 text-center" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <Wallet className="mx-auto h-14 w-14" style={{ color: muted }} />
            <h3 className="mt-4 text-lg font-bold">No accounts yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: muted }}>
              Contact the bank administrator to open your first account.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acct) => {
              const Icon = ACCOUNT_ICONS[acct.accountType] || Landmark;
              return (
                <div
                  key={acct._id}
                  className="relative overflow-hidden p-6 text-white shadow-lg transition-shadow hover:shadow-xl"
                  style={{ backgroundImage: accountGradient(acct.accountType), borderRadius: radius }}
                >
                  {isDark && (
                    <div className="pointer-events-none absolute inset-0"
                      style={{ backgroundImage: "radial-gradient(120% 120% at 100% 0%, rgba(255,255,255,0.14) 0%, transparent 60%)" }} />
                  )}
                  <div className="relative flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                      {acct.accountType}
                    </span>
                  </div>
                  <p className="relative mt-5 text-sm text-white/80">{acct.name}</p>
                  <p className="relative mt-1 text-3xl font-bold tracking-tight">{fmtCurrency(acct.balance)}</p>
                  <div className="relative mt-3 flex items-center justify-between border-t border-white/15 pt-3">
                    <p className="font-mono text-[11px] text-white/50">{maskAccount(acct.accountNumber)}</p>
                    {!acct.isActive && <span className="text-[10px] font-bold text-red-300 uppercase">Closed</span>}
                  </div>
                  {acct.isActive && (
                    <div className="relative mt-4 flex gap-2">
                      <button
                        onClick={() => { setSelectedAcct(acct._id); setDepositOpen(true); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 text-xs font-semibold transition-colors hover:bg-white/25"
                      >
                        <ArrowDownLeft className="h-3.5 w-3.5" /> Deposit
                      </button>
                      <button
                        onClick={() => { setSelectedAcct(acct._id); setWithdrawOpen(true); }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 text-xs font-semibold transition-colors hover:bg-white/25"
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

        {depositOpen && dialog("deposit", () => setDepositOpen(false), handleDeposit)}
        {withdrawOpen && dialog("withdraw", () => setWithdrawOpen(false), handleWithdraw)}
      </div>
    </SiteLayout>
  );
}
