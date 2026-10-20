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
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <h1 className="page-title text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

/**
 * Stat tile tones.
 *
 * Every tile is a tinted emerald/status chip on the card surface — the icon
 * colour reinforces the label, it never carries the meaning on its own. The old
 * version paired a `bg-*-50` light tint with a `dark:` override, which is how a
 * panel ends up with pale blue squares on a black page.
 */
const STAT_COLORS = {
  blue: "bg-info/12 text-info",
  green: "bg-primary/12 text-primary",
  amber: "bg-warning/12 text-warning",
  red: "bg-error/12 text-error",
  purple: "bg-surface-2 text-foreground",
  indigo: "bg-info/12 text-info",
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
    <Card className="interactive-card h-full border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {value === undefined ? (
              <div
                className="mt-2 h-7 w-16 animate-pulse rounded bg-surface-2"
                aria-hidden
              />
            ) : (
              <p className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
            )}
            {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${STAT_COLORS[color]}`}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Status tones on the enterprise palette.
 *
 * Four tones carry every record state: settled (green), in progress (amber),
 * blocked (red), moving (blue), and inert (grey). Each is a tinted chip with a
 * hairline of the same hue, so it reads on the black card surface without
 * shouting.
 */
const TONE = {
  settled: "border-success/30 bg-success/12 text-success",
  progress: "border-warning/30 bg-warning/12 text-warning",
  blocked: "border-error/30 bg-error/12 text-error",
  moving: "border-info/30 bg-info/12 text-info",
  inert: "border-border bg-surface-2 text-muted-foreground",
} as const;

const BADGE_STYLES: Record<string, string> = {
  active: TONE.settled,
  approved: TONE.settled,
  verified: TONE.settled,
  completed: TONE.settled,
  delivered: TONE.settled,
  resolved: TONE.settled,
  dismissed: TONE.inert,
  closed: TONE.inert,
  pending: TONE.progress,
  under_review: TONE.progress,
  reviewing: TONE.progress,
  processing: TONE.progress,
  escrow: TONE.progress,
  more_information_required: TONE.progress,
  out_for_delivery: TONE.moving,
  in_transit: TONE.moving,
  picked_up: TONE.moving,
  open: TONE.blocked,
  rejected: TONE.blocked,
  suspended: TONE.blocked,
  refunded: TONE.progress,
  disputed: TONE.blocked,
  failed: TONE.blocked,
  cancelled: TONE.inert,
  draft: TONE.inert,
  // Tracking lifecycle states (shipment timelines, public tracker).
  created: TONE.inert,
  booked: TONE.progress,
  at_origin_facility: TONE.moving,
  departed_origin: TONE.moving,
  arrived_destination_country: TONE.moving,
  customs_clearance: TONE.progress,
  customs_cleared: TONE.progress,
  at_destination_facility: TONE.moving,
  delivery_attempted: TONE.blocked,
  exception: TONE.blocked,
  on_hold: TONE.blocked,
  returned: TONE.blocked,
};

/**
 * A status pill.
 *
 * The status NAME is always printed — colour is never the only signal, so the
 * badge still means something in greyscale, in a screenshot, and to a
 * colour-blind reader.
 */
export function StatusBadge({ status }: { status: string }) {
  const style = BADGE_STYLES[status] ?? TONE.inert;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${style}`}>
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
