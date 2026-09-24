import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Small shared primitives for the Cloudie document workspace. */

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  completed: { label: "Generated", className: "bg-primary/12 text-primary" },
  shared: { label: "Shared", className: "bg-accent/20 text-accent-foreground" },
  failed: { label: "Failed", className: "bg-destructive/12 text-destructive" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
  rendering: { label: "Rendering", className: "bg-muted text-muted-foreground" },
  revoked: { label: "Revoked", className: "bg-muted text-muted-foreground" },
  expired: { label: "Expired", className: "bg-destructive/12 text-destructive" },
  active: { label: "Active", className: "bg-primary/12 text-primary" },
  private: { label: "Private", className: "bg-muted text-muted-foreground" },
  not_found: { label: "Not found", className: "bg-muted text-muted-foreground" },
  rate_limited: { label: "Busy", className: "bg-muted text-muted-foreground" },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30",
        accent && "border-primary/30 bg-primary/[0.04]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function EmptyBlock({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

export function formatDateTime(value?: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
