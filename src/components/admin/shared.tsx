import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-[0_12px_40px_-32px_hsl(var(--shadow-color)/0.5)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

const STAT_COLORS = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
} as const;

export function StatCard({
  title,
  value,
  icon: Icon,
  color = "blue",
  hint,
}: {
  title: string;
  value: number | string | undefined;
  icon: LucideIcon;
  color?: keyof typeof STAT_COLORS;
  hint?: string;
}) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </p>
            {value === undefined ? (
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
            ) : (
              <p className="mt-1 truncate text-2xl font-bold text-slate-900 dark:text-white">
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
            )}
            {hint && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>}
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STAT_COLORS[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const BADGE_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  verified: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  resolved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  dismissed: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  under_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  reviewing: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  escrow: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  more_information_required: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  out_for_delivery: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  in_transit: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  picked_up: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  open: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  suspended: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  refunded: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  disputed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: string }) {
  const style = BADGE_STYLES[status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Confirmation dialog for destructive admin actions. Requires a typed-free
 * reason (min length configurable) before the action button enables.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  resource,
  actionLabel,
  destructive = true,
  requireReason = true,
  minReasonLength = 5,
  extraField,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description: string;
  resource?: string;
  actionLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  minReasonLength?: number;
  extraField?: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string };
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reasonOk = !requireReason || reason.trim().length >= minReasonLength;

  const handleConfirm = async () => {
    if (!reasonOk || busy) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="h-5 w-5 text-red-500" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
            {resource && <span className="mt-1 block font-medium text-slate-700 dark:text-slate-300">{resource}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {extraField && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-extra">{extraField.label}</Label>
              <Input
                id="confirm-extra"
                type={extraField.type ?? "text"}
                value={extraField.value}
                onChange={(e) => extraField.onChange(e.target.value)}
                placeholder={extraField.placeholder}
              />
            </div>
          )}
          {requireReason && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-reason">
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this action is being taken (recorded in the audit log)"
                rows={3}
              />
              <p className="text-[11px] text-slate-400">
                Your identity, the reason, and a timestamp are recorded in the audit log.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!reasonOk || busy}
            className={destructive ? "bg-red-600 text-white hover:bg-red-700" : ""}
          >
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
      <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{message}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function AdminSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

/** Download rows as CSV in the browser. Rows are string[][] with a header row. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  if (rows.length === 0) return;
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fmtDate(ts: number | undefined | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
