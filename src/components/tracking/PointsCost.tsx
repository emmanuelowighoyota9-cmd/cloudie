import { Coins } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The price tag for an action that debits points.
 *
 * Shows what will be charged and, when a live balance is known, what is left
 * afterwards. It flips to the warning tone the moment the balance can't cover
 * the action so the block is visible before the button is pressed.
 */
export function PointsCost({
  cost,
  balance,
  className,
}: {
  cost: number;
  balance?: number | null;
  className?: string;
}) {
  const known = typeof balance === "number";
  const insufficient = known && balance < cost;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
        insufficient
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-surface-2 text-muted-foreground",
        className,
      )}
    >
      <Coins className="size-3 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">−{cost.toLocaleString()} pt</span>
      {known && (
        <>
          <span aria-hidden className="text-muted-foreground/50">·</span>
          <span className="whitespace-nowrap">
            {insufficient ? "need more" : `${Math.max(0, balance - cost).toLocaleString()} left`}
          </span>
        </>
      )}
    </span>
  );
}
