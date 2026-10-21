import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type JobProgressStatus = "pending" | "succeeded" | "failed";

export interface JobProgressProps {
  /** Human-readable description of the asynchronous task. */
  label: string;
  /** Completion percentage, clamped to the inclusive range 0–100. */
  progress: number;
  status: JobProgressStatus;
  /** Number of attempts made so far, when known. */
  attempts?: number;
  /** Called when the user asks to cancel a pending job. */
  onCancel?: () => void;
  /** Called when the user asks to retry a failed job. */
  onRetry?: () => void;
  /** Render a single compact row suitable for a job tray. */
  compact?: boolean;
  className?: string;
}

function safeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

/**
 * Inline feedback for asynchronous work.
 *
 * The full variant gives each state its own message and actions. The compact
 * variant is intentionally one row so it can be reused inside a JobTray.
 */
export function JobProgress({
  label,
  progress,
  status,
  attempts,
  onCancel,
  onRetry,
  compact = false,
  className,
}: JobProgressProps) {
  const value = safeProgress(progress);
  const attemptNote =
    typeof attempts === "number" && Number.isFinite(attempts) && attempts > 0
      ? `Attempt ${Math.floor(attempts)}`
      : null;

  if (compact) {
    const StateIcon =
      status === "succeeded" ? CheckCircle2 : status === "failed" ? AlertCircle : LoaderCircle;
    const iconClass =
      status === "succeeded"
        ? "text-emerald-600"
        : status === "failed"
          ? "text-destructive"
          : "text-primary";
    const compactProgress = status === "succeeded" ? 100 : value;
    const progressClass =
      status === "succeeded"
        ? "bg-emerald-600"
        : status === "failed"
          ? "bg-destructive"
          : "bg-primary";

    return (
      <div
        className={cn("flex min-w-0 items-center gap-2.5", className)}
        role="status"
        aria-label={`${label}: ${status}`}
      >
        <StateIcon
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0", iconClass, status === "pending" && "animate-spin")}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={label}>
          {label}
        </span>
        <div
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-20"
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={compactProgress}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", progressClass)}
            style={{ width: `${compactProgress}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === "succeeded") {
    return (
      <div className={cn("flex items-start gap-3 rounded-xl border border-emerald-600/20 bg-emerald-600/5 p-3", className)}>
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">Done</p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className={cn("flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3", className)}>
        <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-destructive">
            {attemptNote ? `Failed after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}.` : "Something went wrong."}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <div className="flex items-start gap-3">
        <LoaderCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{value}%</span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${label} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${value}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {attemptNote ?? "In progress"}
            </span>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X aria-hidden="true" className="h-3 w-3" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobProgress;
