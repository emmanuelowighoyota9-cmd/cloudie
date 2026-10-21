import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtNaira, fmtPoints, type Naira, type Points } from "@/components/money/FundsGate";
import type { MarketplaceOrderDraft } from "./orderState";

export type PurchaseResult =
  | { status: "pending"; reference: string }
  | { status: "success"; reference: string; pointsCredited: Points; walletAfter: Naira }
  | { status: "failed"; reference: string; reason: string; charged: false }
  | { status: "failed_ambiguous"; reference: string; reason: string };

type Props = {
  open: boolean;
  draft: MarketplaceOrderDraft | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<PurchaseResult>;
  onRefresh?: (reference: string) => Promise<PurchaseResult | null>;
  onViewOrder?: (reference: string) => void;
  onContactSupport?: (reference: string) => void;
};

export function PurchaseDialog({ open, draft, onOpenChange, onConfirm, onRefresh, onViewOrder, onContactSupport }: Props) {
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dismiss = (next: boolean) => {
    if (!busy) onOpenChange(next);
  };

  const confirm = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      setResult(await onConfirm());
    } catch (error) {
      // A thrown transport error does not prove whether the server charged the wallet.
      setResult({ status: "failed_ambiguous", reference: "unconfirmed", reason: error instanceof Error ? error.message : "The order status could not be confirmed." });
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!result || result.status !== "pending" || !onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      const next = await onRefresh(result.reference);
      if (next) setResult(next);
    } finally {
      setRefreshing(false);
    }
  };

  const close = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={dismiss}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border shadow-none sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader className="pr-7 text-left">
          <DialogTitle>
            {result?.status === "success" ? "Purchase complete" : result?.status === "failed" ? "Purchase failed" : result?.status === "failed_ambiguous" ? "Confirming your order" : result?.status === "pending" ? "Order processing" : "Review your purchase"}
          </DialogTitle>
          <DialogDescription>
            {result?.status === "success" ? "Your receipt is ready." : result?.status === "pending" ? "Your order is awaiting confirmation. You can safely close this dialog and check your orders later." : result?.status === "failed_ambiguous" ? "We could not confirm the complete order outcome yet." : "Check the NGN charge and reward before confirming."}
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <section aria-label="Purchase summary" className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="break-words font-semibold">{draft.productName}</p><p className="text-sm text-muted-foreground">Quantity: {draft.quantity}</p></div>
              <span className="shrink-0 font-semibold">{fmtNaira(draft.price)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
              <span className="text-muted-foreground">Wallet after purchase</span><span className="font-medium">{fmtNaira(draft.walletAfter)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Points reward</span><span className="font-semibold text-emerald-700 dark:text-emerald-300">{fmtPoints(draft.pointsReward)}</span>
            </div>
          </section>
        )}

        {result?.status === "pending" && (
          <div role="status" className="flex gap-3 rounded-lg border p-3 text-sm"><Clock3 className="mt-0.5 size-4 shrink-0" /><div className="min-w-0"><p className="font-medium">Order reference</p><p className="break-all text-muted-foreground">{result.reference}</p><p className="mt-1 text-muted-foreground">Status updates appear when the order service reports them.</p></div></div>
        )}
        {result?.status === "success" && (
          <div role="status" className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5 text-emerald-600" /> Receipt</div>
            <p className="text-sm">Order reference: <span className="break-all font-medium">{result.reference}</span></p>
            {draft && <p className="text-sm">Paid: <span className="font-semibold">{fmtNaira(draft.price)}</span></p>}
            <p className="text-sm">Wallet balance: <span className="font-semibold">{fmtNaira(result.walletAfter)}</span></p>
            <p className="text-sm">Points credited: <span className="font-semibold">{fmtPoints(result.pointsCredited)}</span></p>
          </div>
        )}
        {result?.status === "failed" && (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4" /> Purchase failed</div>
            <p>{result.reason}</p><p className="font-semibold">You were not charged.</p><p className="break-all text-muted-foreground">Reference: {result.reference}</p>
          </div>
        )}
        {result?.status === "failed_ambiguous" && (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4" /> Order outcome not fully confirmed</div>
            <p>Your payment was received, but points delivery is delayed. Ref {result.reference}. This will resolve automatically, or contact support.</p>
            {result.reason && <p className="text-muted-foreground">{result.reason}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!result && <><Button variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button onClick={() => void confirm()} disabled={!draft || busy}>{busy ? "Submitting…" : "Confirm purchase"}</Button></>}
          {result?.status === "pending" && <><Button variant="outline" onClick={close}>Close safely</Button>{onRefresh && <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className="size-4" />{refreshing ? "Refreshing…" : "Refresh status"}</Button>}{onViewOrder && <Button onClick={() => onViewOrder(result.reference)}>View order <ExternalLink className="size-4" /></Button>}</>}
          {result?.status === "success" && <><Button variant="outline" onClick={() => onViewOrder?.(result.reference)}>View order</Button><Button onClick={close}>Done</Button></>}
          {result?.status === "failed" && <><Button variant="outline" onClick={() => onContactSupport?.(result.reference)}>Contact support</Button><Button onClick={() => setResult(null)}>Try again</Button></>}
          {result?.status === "failed_ambiguous" && <><Button variant="outline" onClick={() => onContactSupport?.(result.reference)}>Contact support</Button><Button onClick={close}>Close</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PurchaseDialog;
