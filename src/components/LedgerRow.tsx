import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One wallet/points ledger movement, as used by the dashboard activity feed
 * and the wallet pages.
 *
 * Contract (from the Master Prompt): a signed monospace amount, the
 * description, a workspace badge saying which product produced the movement,
 * and a relative timestamp. Amounts are NGN and always signed — credits show
 * a leading "+", debits a leading "−", so a column of rows scans as a
 * balance column rather than a list of absolute numbers.
 */
export function LedgerRow({
  amountNgn,
  description,
  workspace,
  createdAt,
}: {
  amountNgn: number;
  description: string;
  workspace: string;
  /** Epoch milliseconds. */
  createdAt: number;
}) {
  const credit = amountNgn >= 0;

  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-colors duration-200 hover:bg-muted/50">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          credit
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            : "bg-primary/10 text-primary",
        )}
        aria-hidden
      >
        {credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{description}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="rounded-full border-border px-2 py-0 text-[10px] font-medium text-muted-foreground"
          >
            {workspace}
          </Badge>
          <span className="truncate text-[11px] text-muted-foreground">
            · {formatRelativeTime(createdAt)}
          </span>
        </div>
      </div>

      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold tabular-nums",
          credit ? "text-emerald-600 dark:text-emerald-300" : "text-foreground",
        )}
      >
        {credit ? "+" : "−"}₦{Math.abs(amountNgn).toLocaleString("en-NG")}
      </span>
    </div>
  );
}

/** "just now" / "12m ago" / "3h ago" / "5d ago", falling back to a date. */
export function formatRelativeTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "recently";
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/**
 * Which workspace produced a ledger movement. Ledger rows carry a `type`
 * from the wallet schema; the description is only used to break ties between
 * services that share a type (e.g. purchases).
 */
export function workspaceFromLedgerType(type: string, description: string): string {
  const t = (type ?? "").toLowerCase();
  const d = (description ?? "").toLowerCase();

  if (t.includes("referral")) return "Referrals";
  if (t.includes("shipment")) return "Shipments";
  if (t.includes("document") || t.includes("invoice")) return "Documents";
  if (t.includes("email") || t.includes("campaign")) return "Email";
  if (t.includes("vtu") || d.includes("airtime") || d.includes("data bundle") || d.includes("electricity"))
    return "VTU";
  if (t.includes("marketplace") || t.includes("vendor")) return "Marketplace";
  if (t.includes("deposit") || t.includes("funding") || t.includes("bonus") || t.includes("refund"))
    return "Wallet";
  if (t.includes("admin")) return "Admin";
  if (d.includes("shipment")) return "Shipments";
  if (d.includes("document") || d.includes("invoice")) return "Documents";
  return "Wallet";
}
