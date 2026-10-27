import { Code2, type LucideIcon } from "lucide-react";
import { motion, type Easing } from "framer-motion";
import React, { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EASE_OUT_QUINT } from "@/components/motion";

const SPRING_EASING = "var(--ease-spring)";

type EasingLike = string | [number, number, number, number];
const EASING_LABELS_OUT_QUINT = "Out-quint: cubic-bezier(0.22, 1, 0.36, 1)";
const EASING_LABELS_SPRING = "Spring: cubic-bezier(0.34, 1.56, 0.64, 1)";

const SPRING_EASING_INTERNAL = SPRING_EASING;

const NEUTRALS = [
  { name: "background", hsl: "0 0% 0%", usedFor: "Primary canvas — the page itself." },
  { name: "surface", hsl: "0 0% 3.1%", usedFor: "Secondary surfaces beside the page." },
  { name: "card", hsl: "0 0% 6.7%", usedFor: "Raised panels, inputs and content blocks." },
  { name: "foreground", hsl: "0 0% 100%", usedFor: "Primary ink — headings and body text." },
  { name: "muted-foreground", hsl: "0 0% 63.1%", usedFor: "Secondary ink, captions and labels." },
  { name: "border", hsl: "0 0% 15.3%", usedFor: "Dividers, input outlines and hairlines." },
  { name: "input", hsl: "0 0% 15.3%", usedFor: "Field backgrounds and tappable surfaces." },
  { name: "ring", hsl: "160 84% 54%", usedFor: "Keyboard focus rings and interactive emphasis." },
] as const;

const SEMANTICS = [
  { name: "primary", hsl: "160 84% 54%", lightFg: "#04120c", usedFor: "Brand actions, active state, links and the emerald accent the platform is known for." },
  { name: "success", hsl: "142 72% 48%", lightFg: "#041a0d", usedFor: "Positive confirmations, completed states and earned credits." },
  { name: "warning", hsl: "36 93% 52%", lightFg: "#211802", usedFor: "Pending work, cautions and states that need attention but are not broken." },
  { name: "destructive", hsl: "0 84% 60%", lightFg: "#3b0a0a", usedFor: "Errors, irreversible actions, refunds and failed states." },
  { name: "info", hsl: "220 85% 58%", lightFg: "#0a182b", usedFor: "Neutral information, links, system notices and in-progress hints." },
] as const;

/* Workspace accents. Cloudie is black, emerald and white, so the six workspaces
   are separated inside that one family — a green-to-teal ramp plus one neutral
   — rather than by six unrelated hues. Administration keeps the single warm
   accent so it can never be mistaken for a workspace. */
const ACCENTS = [
  { name: "ws-shipments", hsl: "160 84% 39%", usedFor: "Emerald. The brand accent, and the shipments workspace." },
  { name: "ws-personal", hsl: "160 64% 52%", usedFor: "Mint lift. Panels that need one step of brightness above the card." },
  { name: "ws-ticketing", hsl: "173 80% 50%", usedFor: "Teal. Ticketing, and the cool end of the ramp." },
  { name: "ws-business", hsl: "160 84% 30%", usedFor: "Jade, the deep end. Reserved surfaces and pressed states." },
  { name: "ws-services", hsl: "166 75% 64%", usedFor: "Pale teal. The lightest tint, for services and chart series three." },
  { name: "ws-marketplace", hsl: "240 5% 90%", usedFor: "Neutral. The marketplace is deliberately the odd one out." },
  { name: "ws-admin", hsl: "0 91% 71%", usedFor: "The one warm accent. Administration only — never a workspace." },
] as const;

function hslToCss(hsl: string, alpha?: number): string {
  const parts = hsl.match(/[\\d.]+/g);
  if (!parts || parts.length < 3) return "hsl(0 0% 0%)";
  const h = parts[0];
  const s = parts[1].endsWith("%") ? parts[1] : `${parts[1]}%`;
  const l = parts[2].endsWith("%") ? parts[2] : `${parts[2]}%`;
  if (alpha !== undefined) return `hsl(${h} ${s} ${l} / ${alpha})`;
  return `hsl(${h} ${s} ${l})`;
}

/* One geometric family across the whole product. Headings are the same
   typeface as body text, separated by weight and by tight (-3.5%) tracking. */
const TYPOGRAPHY = [
  { label: "display", family: "Plus Jakarta Sans", css: "48px / 1.03 800", sample: "The fastest way to move money across a platform that already has your trust." },
  { label: "h1", family: "Plus Jakarta Sans", css: "clamp(1.75rem, 2.2vw, 2.25rem) / 1.1 700", sample: "Your personal workspace, ready in one tap." },
  { label: "h2", family: "Plus Jakarta Sans", css: "clamp(1.25rem, 1.6vw, 1.5rem) / 1.15 700", sample: "Pay and manage the services you use most." },
  { label: "h3", family: "Plus Jakarta Sans", css: "1.125rem / 1.25 600", sample: "Recent activity" },
  { label: "body-lg", family: "Plus Jakarta Sans", css: "1rem / 1.5 400", sample: "Your personal workspace connects points activity, orders, notifications and tools." },
  { label: "body", family: "Plus Jakarta Sans", css: "0.875rem / 1.5 400", sample: "Ready for instant Cloudie services across airtime, data, electricity and more." },
  { label: "sm", family: "Plus Jakarta Sans", css: "0.8125rem / 1.45 400", sample: "No wallet transactions yet. Fund your wallet to start using Cloudie." },
  { label: "xs", family: "Plus Jakarta Sans", css: "0.6875rem / 1.4 400", sample: "AVAILABLE BALANCE · NGN" },
  { label: "mono", family: "System mono", css: "0.8125rem / 1.5 400", sample: "NGN 5,240.00  ·  pts 1,840" },
] as const;

const SPACING = [
  { step: 1, value: "0.25rem" },
  { step: 2, value: "0.5rem" },
  { step: 3, value: "0.75rem" },
  { step: 4, value: "1rem" },
  { step: 6, value: "1.5rem" },
  { step: 8, value: "2rem" },
  { step: 12, value: "3rem" },
  { step: 16, value: "4rem" },
  { step: 20, value: "5rem" },
  { step: 24, value: "6rem" },
] as const;

const RADII = [
  { token: "radius-sm", css: "calc(var(--radius) - 4px)" },
  { token: "radius-md", css: "calc(var(--radius) - 2px)" },
  { token: "radius", css: "var(--radius)" },
  { token: "radius-lg", css: "var(--radius-lg)" },
  { token: "radius-xl", css: "var(--radius-xl)" },
  { token: "radius-2xl", css: "calc(var(--radius) + 8px)" },
  { token: "full", css: "9999px" },
] as const;

const ELEVATIONS = [
  { layer: "elev-1", label: "Hairline" },
  { layer: "elev-2", label: "Inset field" },
  { layer: "elev-3", label: "Card" },
  { layer: "elev-4", label: "Modal / sheet" },
] as const;

const MOTION_DEMO_TIMINGS = [
  { label: "fast", css: "var(--duration-fast)" },
  { label: "base", css: "var(--duration-base)" },
  { label: "slow", css: "var(--duration-slow)" },
] as const;

const MOTION_EASING = [
  { label: "out-quint", css: "var(--ease-out-quint)", labelLong: EASING_LABELS_OUT_QUINT },
  { label: "spring", css: SPRING_EASING, labelLong: EASING_LABELS_SPRING },
];

const STATUS_MATRIX = [
  { kind: "shipment", statuses: [
    { value: "pending", label: "Pending" },
    { value: "dispatched", label: "Dispatched" },
    { value: "in_transit", label: "In transit" },
    { value: "out_for_delivery", label: "Out for delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "returned", label: "Returned" },
  ]},
  { kind: "job", statuses: [
    { value: "draft", label: "Draft" },
    { value: "queued", label: "Queued" },
    { value: "processing", label: "Processing" },
    { value: "ready", label: "Ready" },
    { value: "failed", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
  ]},
  { kind: "tenant", statuses: [
    { value: "pending", label: "Pending" },
    { value: "active", label: "Active" },
    { value: "suspended", label: "Suspended" },
    { value: "archived", label: "Archived" },
  ]},
  { kind: "kyc", statuses: [
    { value: "pending", label: "Pending" },
    { value: "reviewing", label: "Reviewing" },
    { value: "verified", label: "Verified" },
    { value: "rejected", label: "Rejected" },
    { value: "expired", label: "Expired" },
  ]},
  { kind: "order", statuses: [
    { value: "pending", label: "Pending" },
    { value: "paid", label: "Paid" },
    { value: "processing", label: "Processing" },
    { value: "shipped", label: "Shipped" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "refunded", label: "Refunded" },
  ]},
  { kind: "dispute", statuses: [
    { value: "open", label: "Open" },
    { value: "under_review", label: "Under review" },
    { value: "resolved_in_merchant_favor", label: "Resolved (merchant)" },
    { value: "resolved_in_customer_favor", label: "Resolved (customer)" },
    { value: "escalated", label: "Escalated" },
    { value: "closed", label: "Closed" },
  ]},
  { kind: "vendor", statuses: [
    { value: "invited", label: "Invited" },
    { value: "onboarding", label: "Onboarding" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "suspended", label: "Suspended" },
    { value: "deactivated", label: "Deactivated" },
  ]},
] as const;

const STATUS_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  pending: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  dispatched: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
  in_transit: { dot: "bg-info", text: "text-info", bg: "bg-info/10" },
  out_for_delivery: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
  delivered: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  failed: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" },
  cancelled: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  returned: { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  draft: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  queued: { dot: "bg-info", text: "text-info", bg: "bg-info/10" },
  processing: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
  ready: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  active: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  suspended: { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  archived: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  reviewing: { dot: "bg-info", text: "text-info", bg: "bg-info/10" },
  verified: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  rejected: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" },
  expired: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  paid: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  shipped: { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
  completed: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  refunded: { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  open: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" },
  under_review: { dot: "bg-info", text: "text-info", bg: "bg-info/10" },
  resolved_in_merchant_favor: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  resolved_in_customer_favor: { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  escalated: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10" },
  closed: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  invited: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
  onboarding: { dot: "bg-info", text: "text-info", bg: "bg-info/10" },
  paused: { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  deactivated: { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40" },
};

type PointsFlash = { kind: "credit" | "debit"; from: number; to: number; value: number };
type PointsFlashNullable = PointsFlash | null;

const POINTS_STATES = [
  { id: "default", balance: 1840, flash: null as PointsFlashNullable, note: "Normal state — no recent movement to flash." },
  { id: "credited", balance: 2340, flash: { kind: "credit", from: 1840, to: 2340, value: 500 }, note: "A credit just landed — the new balance flashes up, then settles." },
  { id: "debited", balance: 1240, flash: { kind: "debit", from: 1840, to: 1240, value: 600 }, note: "A debit just landed — the new balance flashes down, then settles." },
  { id: "low", balance: 120, flash: null as PointsFlashNullable, note: "Low balance — the chip warns before the customer runs out." },
  { id: "zero", balance: 0, flash: null as PointsFlashNullable, note: "Zero balance — the chip says so plainly instead of pretending." },
];

const POINTS_COST_VARIANTS = [
  { id: "enabled", balance: 1840, points: 450, max: 2000, active: true, note: "Enough credits — the chip reads ready, the button is tappable." },
  { id: "disabled", balance: 0, points: 0, max: 2000, active: false, note: "Wallet is hidden — the chip is muted and the button cannot be pressed." },
  { id: "insufficient", balance: 120, points: 450, max: 2000, active: true, note: "Not enough credits — the chip turns destructive and the button is disabled." },
];

/* ── Shared primitives ──────────────────────────────────────────── */

function SectionLabel({ icon, label }: { icon?: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-3.5" aria-hidden />
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </h2>
    </div>
  );
}

function TokenSwatch({ name, hsl, fg, bg, usedFor, lightLabel }: {
  name: string; hsl: string; fg?: string; bg?: string; usedFor: string; lightLabel: string;
}) {
  return (
    <div className="group relative rounded-xl border border-border/70 bg-card/60 p-4 transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold text-foreground">{name}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80 break-all">{hsl}</p>
          {fg && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              foreground: <span className="font-mono">{fg}</span>
            </p>
          )}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{lightLabel}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="h-9 w-full rounded-lg border border-border/60" style={bg ? { backgroundColor: bg } : undefined} />
        <div className="h-9 w-full rounded-lg border border-border/60 flex items-center justify-center text-[10px] font-medium" style={fg ? { backgroundColor: bg ?? "transparent", color: fg } : undefined}>
          {fg || "—"}
        </div>
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/85">{usedFor}</p>
    </div>
  );
}

function TypographyRow({ label, family, css, sample }: { label: string; family: string; css: string; sample: string }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">{label}</span>
        <span className="text-[10px] font-medium text-muted-foreground/70">·</span>
        <span className="text-[10px] font-mono text-muted-foreground/80">{family}</span>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground/60">{css}</p>
      <p className="text-sm text-foreground/90">{sample}</p>
    </div>
  );
}

function SpacingBar({ step, value }: { step: number; value: string }) {
  const sizeClass = step <= 4 ? "h-5" : step <= 8 ? "h-6" : step <= 12 ? "h-7" : "h-8";
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 shrink-0 text-right text-[11px] font-mono text-muted-foreground/85">{step}</span>
      <div className={cn("pointer-events-none flex-1 rounded-md border border-border/80 bg-primary/20", sizeClass)} style={{ width: value }} title={`${value} (${step} × 4px)`} />
      <span className="w-20 shrink-0 text-[11px] font-mono text-muted-foreground/70">{value}</span>
    </div>
  );
}

function RadiusBox({ token, css }: { token: string; css: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="shrink-0 rounded-[var(--tw-rotate)] border-2 border-border/70 bg-primary/10 p-4 text-center text-[10px] font-mono text-primary" style={{ borderRadius: css, width: 48, height: 48 }}>
        <div className="truncate">{token}</div>
      </div>
      <div>
        <p className="text-[11px] font-mono font-semibold text-foreground">{token}</p>
        <p className="text-[10px] font-mono text-muted-foreground/70">{css}</p>
      </div>
    </div>
  );
}

function ElevationTile({ layer, label }: { layer: string; label: string }) {
  return (
    <div className={cn("relative rounded-xl border border-border/70 bg-card/60 p-4", layer)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono font-semibold text-foreground">{layer}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-[10px] font-mono text-muted-foreground/60">
        {layer === "elev-1" ? "0 1px 2px hsl(var(--shadow-color) / 0.06), 0 1px 3px hsl(var(--shadow-color) / 0.04)" :
         layer === "elev-2" ? "0 2px 4px hsl(var(--shadow-color) / 0.05), 0 4px 12px hsl(var(--shadow-color) / 0.06)" :
         layer === "elev-3" ? "0 4px 8px hsl(var(--shadow-color) / 0.05), 0 12px 28px hsl(var(--shadow-color) / 0.09)" :
         "0 8px 16px hsl(var(--shadow-color) / 0.06), 0 24px 48px hsl(var(--shadow-color) / 0.12)"}
      </p>
    </div>
  );
}

function MotionDemoRow({ label, css, onPlay }: {
  label: "hover" | "out-quint" | "spring";
  css: string;
  onPlay: (finished: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [hint, setHint] = useState("Press to play");

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setHint("animate →"), 200);
    return () => clearTimeout(t);
  }, [playing]);

  const easing: EasingLike = (label === "spring" ? SPRING_EASING : EASE_OUT_QUINT[0]) as EasingLike;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3">
      <button
        type="button"
        onClick={() => {
          setPlaying(true);
          setHint("playing…");
          onPlay(true);
          setTimeout(() => {
            setPlaying(false);
            setHint("press to replay");
            onPlay(false);
          }, 900);
        }}
        className={cn(
          "flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-semibold transition",
          playing ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 bg-muted/40 text-muted-foreground",
        )}
      >
        {playing ? <span className="h-2 w-2 animate-ping rounded-full bg-primary opacity-60" aria-hidden /> : null}
        {label}
      </button>
      <motion.div
        className={cn(
          "flex h-8 w-24 items-center justify-center rounded-md border border-border/70 bg-card text-center text-[10px] font-mono tabular-nums transition-all",
          playing ? "border-primary/30 bg-primary/5 text-primary scale-105 shadow-sm" : "border-border/70 bg-card text-muted-foreground",
        )}
        animate={playing ? { scale: 1.05 } : { scale: 1 }}
        transition={{ duration: label === "hover" ? 0.22 : label === "spring" ? 0.5 : 0.22, ease: easing as Easing }}
      >
        {playing ? label : "idle"}
      </motion.div>
      <p className="flex-1 text-[10px] font-mono text-muted-foreground/80">{css}</p>
      <p className="w-16 text-right text-[10px] text-muted-foreground/70">{hint}</p>
    </div>
  );
}

function StatusBadge({ value, label }: { value: string; label: string }) {
  const style = STATUS_STYLE[value] ?? STATUS_STYLE.pending;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-border/80",
      style.bg, style.text,
      value === "pending" || value === "draft" || value === "invited" ? "opacity-75" : "",
    )}>
      <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} aria-hidden />
      {label}
    </span>
  );
}

function PointsCostChip({ points, max, balance }: { points: number; max: number; balance: number }) {
  const enough = balance >= points;
  const short = points - balance;
  const suffix = points === max ? "pts" : `/${max.toLocaleString()} pts`;
  return (
    <div className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors">
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
        enough ? "bg-primary/10 text-primary border border-primary/20" : "bg-destructive/10 text-destructive border border-destructive/20",
      )}>
        {points.toLocaleString()}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground">{points.toLocaleString()} pts{suffix}</p>
        <p className="text-[10px] text-muted-foreground">{enough ? "Enough credits" : `Short by ${short.toLocaleString()} pts`}</p>
      </div>
    </div>
  );
}

function PointsChip({ balance, flash, hidden = false, cost }: {
  balance: number;
  flash: PointsFlashNullable;
  hidden?: boolean;
  cost?: { points: number; max: number; active: boolean } | null;
}) {
  const [phase, setPhase] = useState<"idle" | "flash-up" | "flash-down" | "low" | "zero">("idle");

  useEffect(() => {
    if (!flash) {
      if (balance === 0) setPhase("zero");
      else if (balance < 200) setPhase("low");
      else setPhase("idle");
      return;
    }
    setPhase(flash.kind === "credit" ? "flash-up" : "flash-down");
    const timer = setTimeout(() => setPhase("idle"), 1200);
    return () => clearTimeout(timer);
  }, [balance, flash]);

  if (hidden) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <svg className="h-3.5 w-3.5 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </span>
        <span className="text-[11px] font-medium text-muted-foreground/80">Credits hidden</span>
      </div>
    );
  }

  if (cost) {
    return <PointsCostChip points={cost.points} max={cost.max} balance={balance} />;
  }

  const isZero = balance === 0;
  const isLow = balance > 0 && balance < 200;
  const phaseClass =
    phase === "flash-up" ? "scale-[1.14] text-success" :
    phase === "flash-down" ? "scale-95 text-destructive" :
    phase === "low" ? "text-warning" :
    phase === "zero" ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors">
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold border",
        isZero ? "bg-muted/60 text-muted-foreground border-border/70" :
        isLow ? "bg-warning/10 text-warning border-warning/20" : "bg-primary/10 text-primary border-primary/20",
      )}>
        {balance.toLocaleString()}
      </span>
      <div className="min-w-0">
        <motion.p
          className={cn("text-[11px] font-semibold transition-colors", phaseClass)}
          key={phase}
          initial={false}
          animate={{
            opacity: 1,
            scale: phase === "flash-up" ? 1.14 : phase === "flash-down" ? 0.92 : 1,
          }}
          transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
        >
          {balance.toLocaleString()} pts
        </motion.p>
        <p className="text-[10px] text-muted-foreground/80">
          {isZero ? "No credits yet" :
           isLow ? "Low credits" :
           phase === "flash-up" ? `+${flash!.value.toLocaleString()} pts credited` :
           phase === "flash-down" ? `${flash!.value.toLocaleString()} pts used` :
           "Shared across services"}
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page
   ════════════════════════════════════════════════════════════════════ */

export default function DesignSystem() {
  return (
    <div className="cloudie-page min-w-0">
      <section className="gap-2 rounded-3xl border border-border/80 bg-card/70 p-5 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Code2 className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cloudie Design System</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Single source of truth</h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every colour, typeface, spacing step, radius, elevation, motion curve and component specimen below is the
          reference the rest of the platform is expected to match. If a component does not agree with this page, reconcile
          it here first.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <span className="size-3.5 text-foreground/60" aria-hidden /> Tokens
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <span className="size-3.5 text-foreground/60" aria-hidden /> Type
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <span className="size-3.5 text-foreground/60" aria-hidden /> Spacing / radius
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <span className="size-3.5 text-foreground/60" aria-hidden /> Motion
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg> Status badges
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg> Points specimen
          </span>
        </div>
      </section>

      <section className="mt-6">
        <SectionLabel label="Colour tokens" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Neutral scale, semantic status tokens and the workspace accents. Each swatch shows its HSL value, the
          foreground it is paired with, and a plain-language “used for” note so the rule behind the colour is as visible
          as the colour itself.
        </p>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NEUTRALS.map((t) => (
              <TokenSwatch
                key={t.name}
                name={t.name}
                hsl={t.hsl}
                fg={t.name === "foreground" ? "#ffffff" : t.name === "muted-foreground" ? "#a1a1aa" : undefined}
                bg={
                  t.name === "background" ? "#000000" :
                  t.name === "surface" ? "#080808" :
                  t.name === "card" ? "#111111" :
                  t.name === "foreground" ? "#ffffff" :
                  t.name === "muted-foreground" ? "#a1a1aa" :
                  t.name === "border" ? "#27272a" :
                  t.name === "input" ? "#27272a" :
                  t.name === "ring" ? "#10b981" : undefined
                }
                lightLabel="dark"
                usedFor={t.usedFor}
              />
            ))}
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Semantic — primary / success / warning / destructive / info</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SEMANTICS.map((t) => (
              <TokenSwatch key={t.name} name={t.name} hsl={t.hsl} fg={t.lightFg} bg={hslToCss(t.hsl, 0.14)} lightLabel="light" usedFor={t.usedFor} />
            ))}
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Workspace accents</p>
          <p className="text-xs text-muted-foreground">
            Six accents, all inside the emerald family plus one neutral, and the admin red. These identify a workspace in
            navigation — they are never used to encode status, and no feedback state depends on hue alone.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ACCENTS.map((t) => (
              <TokenSwatch key={t.name} name={t.name} hsl={t.hsl} fg={hslToCss("#ffffff", 1)} bg={hslToCss(t.hsl, 0.16)} lightLabel="dark" usedFor={t.usedFor} />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel label="Typography scale" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Headers and body share one geometric family — Plus Jakarta Sans — separated by weight and by tight tracking
          (-3.5%) rather than by typeface. Every row lists the family, the responsive size / line-height / weight, and an
          example sentence that matches the real product voice.
        </p>
        <div className="mt-4 space-y-3">
          {TYPOGRAPHY.map((t) => <TypographyRow key={t.label} {...t} />)}
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel label="Spacing scale" />
        <p className="mt-1.5 text-xs text-muted-foreground">Ten steps from 1 to 24. Bars are drawn at the real CSS length so the scale is literal, not illustrative.</p>
        <div className="mt-4 space-y-2.5 rounded-xl border border-border/70 bg-card/60 p-4">
          {SPACING.map((s) => <SpacingBar key={s.step} {...s} />)}
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel label="Radius + elevation" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Border-radius specimens on the left, elevation layers on the right. Elevation is tuned to the theme’s own shadow
          colour so surfaces sit on the page instead of floating above a grey haze.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="grid gap-3">{RADII.map((r) => <RadiusBox key={r.token} {...r} />)}</div>
          <div className="grid gap-3">{ELEVATIONS.map((e) => <ElevationTile key={e.layer} {...e} />)}</div>
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel label="Motion demos" />
        <p className="mt-1.5 text-xs text-muted-foreground">Press each chip to play the associated transition. Timing labels are the real CSS custom properties the product uses, not approximations.</p>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-foreground">Durations</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {MOTION_DEMO_TIMINGS.map((t) => (
            <div key={t.label} className="rounded-xl border border-border/70 bg-card/60 p-3 text-center">
              <p className="text-[11px] font-mono font-semibold text-foreground">{t.label}</p>
              <p className="mt-0.5 text-[10px] font-mono text-muted-foreground/70">{t.css}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-foreground">Hover transition — scale + colour, out-quint</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <MotionDemoRow label="hover" css="var(--duration-base)" onPlay={() => {}} />
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-foreground">State-change transition — out-quint</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MOTION_EASING.filter((e) => e.label === "out-quint").map((e) => (
            <MotionDemoRow key={e.label} label="out-quint" css={e.css} onPlay={() => {}} />
          ))}
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-foreground">Spring transition — spring</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MOTION_EASING.filter((e) => e.label === "spring").map((e) => (
            <MotionDemoRow key={e.label} label="spring" css={e.css} onPlay={() => {}} />
          ))}
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-foreground">Timing labels</p>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p className="text-[10px] font-mono text-muted-foreground/70">{EASING_LABELS_OUT_QUINT}</p>
          <p className="text-[10px] font-mono text-muted-foreground/70">{EASING_LABELS_SPRING}</p>
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel label="StatusBadge matrix" />
        <p className="mt-1.5 text-xs text-muted-foreground">Every status enum the platform owns, rendered with color + dot + text. Status is never communicated by colour alone — the word is always present.</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-4">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-border/70">
                {STATUS_MATRIX.map((group) => (
                  <th key={group.kind} className="border-r border-border/50 px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.kind}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, row) => (
                <tr key={row} className="border-b border-border/40">
                  {STATUS_MATRIX.map((group) => {
                    const status = group.statuses[row];
                    if (!status) return <td key={`${String(group.kind)}-${row}`} className="border-r border-border/40 px-3 py-2.5" />;
                    return (
                      <td key={`${String(group.kind)}-${row}`} className="border-r border-border/40 px-3 py-2.5">
                        <StatusBadge value={status.value as string} label={status.label as string} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground/80">
          Legend: <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-muted-foreground/80" /> muted</span>{" "}
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary/80" /> primary</span>{" "}
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-info/80" /> info</span>{" "}
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success/80" /> success</span>{" "}
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning/80" /> warning</span>{" "}
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-destructive/80" /> destructive</span>
        </p>
      </section>

      <section className="mt-10">
        <SectionLabel label="PointsBalance — five states" />
        <p className="mt-1.5 text-xs text-muted-foreground">The live points chip in five states: default, credited flash, debited flash, low and zero. The flash runs for about a second and then settles back to idle.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS_STATES.map((s) => (
            <div key={s.id} className="rounded-xl border border-border/70 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{s.id}</p>
                <p className="text-[10px] text-muted-foreground/70">
                  {s.balance.toLocaleString()} pts → {s.flash ? s.flash.to.toLocaleString() : s.balance.toLocaleString()}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-center py-2">
                <PointsChip balance={s.balance} flash={s.flash as PointsFlashNullable} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground/85">{s.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center py-2">
          <PointsChip balance={0} flash={null} hidden />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/80">Hidden state — the chip is muted and the balance is not shown.</p>
      </section>

      <section className="mt-10">
        <SectionLabel label="PointsCost — three variants" />
        <p className="mt-1.5 text-xs text-muted-foreground">PointsCost chip in enabled, disabled and insufficient variants. The button beside it turns off or destructive to match the chip.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {POINTS_COST_VARIANTS.map((v) => {
            const disabled = !v.active || v.balance < v.points;
            return (
              <div key={v.id} className="rounded-xl border border-border/70 bg-card/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{v.id}</p>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center justify-center py-2">
                    <PointsChip balance={v.balance} flash={null} cost={{ points: v.points, max: v.max, active: v.active }} />
                  </div>
                  <Button
                    className="w-full justify-center text-[11px]"
                    disabled={disabled}
                    variant={!v.active ? "outline" : v.balance < v.points ? "destructive" : "default"}
                  >
                    {v.id === "disabled" ? "Wallet hidden" :
                     v.balance < v.points ? "Not enough credits" :
                     `Pay ${v.points.toLocaleString()} pts`}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground/85">{v.note}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mt-12 border-t border-border/60 pt-6 text-[11px] text-muted-foreground/70">
        <p className="text-center">
          Cloudie Design System · maintained as the single source of truth for colour, type, spacing, radius, elevation,
          motion, status badges and the points specimen.
        </p>
      </footer>
    </div>
  );
}
