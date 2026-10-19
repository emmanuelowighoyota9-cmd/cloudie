/**
 * VTU presentation shared by every customer-facing VTU surface.
 *
 * The WORDS are deliberately NOT here. They live in `@/lib/vtu`, which is
 * Convex-safe precisely so the server can read them too, and which is the one
 * place a transaction status is described to a customer. What lives here is
 * only the CHROME: the tone and icon for a status, the icon for a service
 * type, and the handful of shapes the shop repeats.
 *
 * Both are shared rather than re-declared per page for the same reason: a
 * delivered top-up that is green on the history page and blue on the purchase
 * page is a customer wondering which one is true. Two maps, one file, one
 * answer.
 *
 * ── The sub-brand ────────────────────────────────────────────────────
 *
 * Airtime and bills is the customer's shop, so it reads the way a top-up app
 * reads: a warm cream canvas, deep plum ink, and a signal-yellow selection.
 * Those are TOKENS (`--vtu-*` in `index.css`), not utilities sprinkled through
 * the pages, so the four screens cannot disagree about what "selected" looks
 * like — and `[aria-pressed="true"]` is what carries it, so the highlight and
 * what a screen reader is told are the same fact.
 *
 * The chrome stays here rather than in `components/ui` because it is not
 * general: a cream canvas is the right answer for a phone-shaped shop and the
 * wrong one for a shipment ledger.
 */

import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  GraduationCap,
  HelpCircle,
  History,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Radio,
  Receipt,
  Sparkles,
  Trophy,
  Tv,
  Wifi,
  Zap,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
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
    tone: "text-sky-400 border-sky-500/25 bg-sky-500/10",
    icon: Loader2,
    spin: true,
  },
  confirmed: {
    tone: "text-emerald-400 border-emerald-500/25 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  reversed: {
    tone: "text-muted-foreground border-border bg-muted/50",
    icon: CheckCircle2,
  },
  unknown: {
    tone: "text-amber-400 border-amber-500/25 bg-amber-500/10",
    icon: HelpCircle,
  },
  unresolved: {
    tone: "text-amber-400 border-amber-500/25 bg-amber-500/10",
    icon: HelpCircle,
  },
};

/**
 * Compact status chip for list rows.
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

/**
 * The destinations that make up the customer's VTU experience.
 */
const VTU_DESTINATIONS = [
  { to: "/vtu", label: "Browse", icon: LayoutGrid },
  { to: "/vtu/airtime", label: "Airtime", icon: Radio },
  { to: "/vtu/data", label: "Data", icon: Wifi },
  { to: "/vtu/electricity", label: "Electricity", icon: Lightbulb },
  { to: "/vtu/exam-pins", label: "Exam Pins", icon: GraduationCap },
  { to: "/vtu/history", label: "History", icon: Clock },
] as const;

/**
 * The canvas every VTU page sits on.
 */
export function VtuShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        "cloudie-vtu-shell min-h-[calc(100dvh-4rem)] bg-background text-foreground",
        "-mx-3 -my-4 sm:-mx-5 sm:-my-6 lg:-mx-8 lg:-my-8",
        className,
      )}
    >
      {/* Mobile-first Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/80 px-3.5 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-xs transition-all hover:bg-muted active:scale-95"
            aria-label="Go back"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-4" />
            </span>
            <div>
              <span className="font-display text-sm font-bold tracking-tight text-foreground sm:text-base">
                Cloudie Pay
              </span>
              <span className="ml-2 hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline-block">
                Instant VTU &amp; Bills
              </span>
            </div>
          </div>
        </div>
        <Link
          to="/vtu/history"
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted"
        >
          <History className="h-3.5 w-3.5 text-primary" />
          <span>Receipts</span>
        </Link>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 pb-8 sm:space-y-6 sm:px-5 sm:py-7 lg:px-8 lg:py-9">
        {children}
      </div>
    </div>
  );
}

/**
 * The ink band: the balance, and the screen you are standing on.
 *
 * Purely a container — pages put their own heading and balance in it, because
 * the band is the one place the three screens legitimately differ.
 */
export function VtuBand({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "vtu-band relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.06] p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Navigation across the VTU pages.
 */
export function VtuNav({ className }: { className?: string }) {
  const location = useLocation();

  return (
    <nav
      aria-label="VTU sections"
      className={cn(
        "sticky top-14 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-border/80 bg-card/90 p-1.5 shadow-md backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {VTU_DESTINATIONS.map((item) => {
        const active = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold tracking-tight transition-all active:scale-95",
              active
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-surface-2/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A tappable choice: a network, an amount, a plan, a category.
 */
export function VtuChoice({
  selected,
  onClick,
  children,
  className,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "min-h-14 rounded-2xl border p-3.5 text-left transition-all duration-150 active:scale-[0.98] disabled:opacity-60",
        selected
          ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/25 shadow-xs"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The four Nigerian networks, by the name the customer knows them.
 *
 * `mark` is a TOKEN, not a hex: the brand colour of a network is content, and
 * a rebrand is one edit in `index.css` rather than four components.
 */
export const VTU_NETWORKS = [
  { key: "mtn", label: "MTN", mark: "bg-vtu-brand-mtn text-vtu-accent-ink", initial: "M" },
  { key: "airtel", label: "Airtel", mark: "bg-vtu-brand-airtel text-vtu-band-fg", initial: "A" },
  { key: "glo", label: "Glo", mark: "bg-vtu-brand-glo text-vtu-band-fg", initial: "G" },
  { key: "9mobile", label: "9mobile", mark: "bg-vtu-brand-9mobile text-vtu-band-fg", initial: "9" },
] as const;

/**
 * The round brand badge from the mock the shop is built to.
 *
 * Drawn rather than hot-linked: a customer's top-up must not depend on a
 * third-party image host, and an `<img>` that 404s would leave a blank circle
 * exactly where the customer is trying to check they picked the right network.
 */
export function VtuNetworkMark({
  network,
  className,
}: {
  network: string;
  className?: string;
}) {
  const mark = VTU_NETWORKS.find((n) => n.key === network);
  if (!mark) return null;
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
        mark.mark,
        className,
      )}
      aria-hidden
    >
      {mark.initial}
    </span>
  );
}

/** A titled block, so every section on every VTU page has the same rhythm. */
export function VtuSection({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-vtu-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The three-step rail above a purchase.
 *
 * Present so the customer can see that confirming is a step and not a second
 * charge, which is the single most common doubt on a top-up screen.
 */
export function VtuSteps({
  steps,
  current,
  className,
}: {
  steps: readonly string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                done
                  ? "bg-vtu-accent text-vtu-accent-ink"
                  : active
                    ? "bg-vtu-band text-vtu-band-fg"
                    : "bg-vtu-chip text-vtu-muted",
              )}
              aria-hidden
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs",
                active ? "font-semibold text-vtu-text" : "text-vtu-muted",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span className="h-px min-w-3 flex-1 bg-vtu-line" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One label/value line in a confirmation or a receipt. */
export function VtuRow({
  label,
  value,
  mono,
  strong,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("vtu-receipt-row min-h-11", className)}>
      <dt className="shrink-0 text-xs text-vtu-muted">{label}</dt>
      <dd
        className={cn(
          "break-anywhere min-w-0 text-right text-sm",
          mono && "font-mono text-[13px]",
          strong ? "font-semibold" : "font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The confirmation step.
 *
 * Everything the customer is about to spend sits here in one block with the
 * amount they are buying above it, because this is the last screen before
 * money moves and the mock's whole point is that nothing is hidden behind a
 * scroll.
 */
export function VtuConfirmPanel({
  amount,
  amountHint,
  rows,
  children,
  className,
}: {
  amount: string;
  amountHint?: ReactNode;
  rows: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("vtu-panel overflow-hidden", className)}>
      <div className="bg-vtu-band px-5 py-6 text-center sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">
          You are about to pay
        </p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums text-vtu-band-fg">
          {amount}
        </p>
        {amountHint ? (
          <p className="mt-1 text-xs text-vtu-band-fg/70">{amountHint}</p>
        ) : null}
      </div>
      <div className="px-5 py-2 sm:px-6">
        <dl>{rows}</dl>
      </div>
      <div className="space-y-3 border-t border-vtu-line px-5 py-5 sm:px-6">
        {children}
      </div>
    </div>
  );
}

/**
 * The receipt.
 *
 * The mark at the top is status-coloured through the SAME map the history
 * rows use, so a payment that is still processing cannot be shown here with a
 * tick. `reversed` (a refund) is deliberately not a success mark: the customer
 * got their points back, and telling them "successful" would be a lie about a
 * top-up that failed.
 */
export function VtuReceipt({
  status,
  rows,
  token,
  children,
  className,
}: {
  status: string;
  rows: ReactNode;
  token?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const copy = vtuStatusCopy(status);
  const view = copy ? VTU_STATUS_TONE[copy.status] : null;
  const Icon = view?.icon ?? Clock;

  return (
    <div className={cn("vtu-panel px-5 py-6 sm:px-6", className)}>
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full",
            copy?.status === "confirmed"
              ? "bg-vtu-band text-vtu-band-fg"
              : "bg-vtu-chip text-vtu-muted",
          )}
        >
          <Icon className={cn("h-7 w-7", view?.spin && "animate-spin")} aria-hidden />
        </span>
        <p className="mt-3 text-base font-semibold">
          {copy ? copy.label : "This purchase"}
        </p>
        {copy && <p className="mt-1 text-sm text-vtu-muted">{copy.detail}</p>}
      </div>

      <dl className="mt-4">
        {rows}
        {token}
      </dl>

      {children ? <div className="mt-5 space-y-3">{children}</div> : null}
    </div>
  );
}
