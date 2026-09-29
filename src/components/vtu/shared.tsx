/**
 * VTU presentation shared by every customer-facing VTU surface.
 *
 * The WORDS are deliberately NOT here. They live in `@/lib/vtu`, which is
 * Convex-safe precisely so the server can read them too, and which is the one
 * place a transaction status is described to a customer. What lives here is
 * only the CHROME: the tone and icon for a status, and the icon for a service
 * type.
 *
 * Both are shared rather than re-declared per page for the same reason: a
 * delivered top-up that is green on the history page and blue on the purchase
 * page is a customer wondering which one is true. Two maps, one file, one
 * answer.
 */

import {
  CheckCircle2,
  Clock,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  Radio,
  Trophy,
  Tv,
  Wifi,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { vtuStatusCopy, type VtuVisibleStatus } from "@/lib/vtu";

/**
 * Tone and icon per VISIBLE status.
 *
 * Typed on `VtuVisibleStatus`, which excludes `failed`: because it is not a
 * resting state, no client can ever observe it (the verdict and the reversal
 * that follows it commit inside one mutation — see `vtuSchema/types.ts`). So
 * there is no entry to add for it, and — the part that actually matters — no
 * fallback wording to accidentally show in its place.
 */
export const VTU_STATUS_TONE: Record<
  VtuVisibleStatus,
  { tone: string; icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    tone: "text-muted-foreground border-border bg-muted/50",
    icon: Clock,
  },
  processing: {
    tone: "text-sky-700 dark:text-sky-400 border-sky-500/25 bg-sky-500/10",
    icon: Loader2,
    spin: true,
  },
  confirmed: {
    tone: "text-emerald-700 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  reversed: {
    tone: "text-muted-foreground border-border bg-muted/50",
    icon: CheckCircle2,
  },
  unknown: {
    tone: "text-amber-700 dark:text-amber-400 border-amber-500/25 bg-amber-500/10",
    icon: HelpCircle,
  },
  unresolved: {
    tone: "text-amber-700 dark:text-amber-400 border-amber-500/25 bg-amber-500/10",
    icon: HelpCircle,
  },
};

/**
 * Compact status chip for list rows.
 *
 * Returns NOTHING for a status it has no copy for. The alternative — falling
 * back to another status's wording — is the defect this replaced on the
 * purchase page: it told a customer "Queued" while their transaction was
 * actually waiting on a human.
 */
export function VtuStatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const copy = vtuStatusCopy(status);
  if (!copy) return null;

  const view = VTU_STATUS_TONE[copy.status];
  const Icon = view.icon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        view.tone,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", view.spin && "animate-spin")} aria-hidden />
      {copy.label}
    </span>
  );
}

/** Icon per service type, so the browse page and a history row agree. */
export const VTU_SERVICE_ICONS: Record<string, typeof Zap> = {
  airtime: Radio,
  data: Wifi,
  cable: Tv,
  electricity: Lightbulb,
  exam: GraduationCap,
  betting: Trophy,
};

/** Falls back to the generic VTU glyph rather than rendering an empty slot. */
export function VtuServiceIcon({
  serviceType,
  className,
}: {
  serviceType: string;
  className?: string;
}) {
  const Icon = VTU_SERVICE_ICONS[serviceType] ?? Zap;
  return <Icon className={className} aria-hidden />;
}
