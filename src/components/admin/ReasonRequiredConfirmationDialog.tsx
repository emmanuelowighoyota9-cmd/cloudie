import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ReasonRequiredDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  minReasonLength?: number;
  /** Optional controlled visibility. Defaults to open when omitted. */
  open?: boolean;
  /** Called when the dialog is dismissed. */
  onOpenChange?: (open: boolean) => void;
  /** Called with the trimmed reason after valid confirmation. May be async. */
  onConfirm: (reason: string) => void | Promise<void>;
  cancelLabel?: string;
  className?: string;
}

/**
 * Confirmation modal for destructive or privileged overrides.
 * A non-empty reason meeting minReasonLength is required before confirming.
 */
export function ReasonRequiredDialog({
  title,
  description,
  confirmLabel,
  destructive = false,
  minReasonLength = 10,
  open = true,
  onOpenChange,
  onConfirm,
  cancelLabel = "Cancel",
  className,
}: ReasonRequiredDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmedReason = reason.trim();
  const requiredLength = Number.isFinite(minReasonLength)
    ? Math.max(0, Math.floor(minReasonLength))
    : 10;
  const isValid = trimmedReason.length >= requiredLength;

  function dismiss() {
    if (busy) return;
    setReason("");
    onOpenChange?.(false);
  }

  async function confirm() {
    if (!isValid || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmedReason);
      setReason("");
      onOpenChange?.(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
        else onOpenChange?.(true);
      }}
    >
      <DialogContent
        className={className ?? "sm:max-w-md"}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Confirmation summary
            </p>
            <p className="mt-1 text-sm text-foreground">{description}</p>
          </div>

          {destructive && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>This action is logged.</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason-required-dialog-reason">Reason (required)</Label>
            <Textarea
              id="reason-required-dialog-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this action is necessary…"
              className="min-h-24"
              maxLength={1000}
              aria-invalid={reason.length > 0 && !isValid}
              aria-describedby="reason-required-dialog-count"
              disabled={busy}
            />
            <p
              id="reason-required-dialog-count"
              className={`text-xs ${isValid ? "text-muted-foreground" : "text-muted-foreground"}`}
              aria-live="polite"
            >
              {trimmedReason.length} characters · {requiredLength} required
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={!isValid || busy}
          >
            {busy ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReasonRequiredDialog;
