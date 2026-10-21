import type { CSSProperties } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LoaderCircle,
  ShieldAlert,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type StatusDomain =
  | "shipment"
  | "job"
  | "tenant"
  | "kyc"
  | "order"
  | "dispute"
  | "vendor";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "purple";
type StatusDefinition = { label?: string; tone: Tone; icon?: LucideIcon };

const TONE_COLOR: Record<Tone, string> = {
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#2563eb",
  neutral: "#64748b",
  purple: "#7c3aed",
};

const SHARED: Record<string, StatusDefinition> = {
  active: { tone: "success", icon: CheckCircle2 },
  approved: { tone: "success", icon: CheckCircle2 },
  verified: { tone: "success", icon: CheckCircle2 },
  completed: { tone: "success", icon: CheckCircle2 },
  succeeded: { tone: "success", icon: CheckCircle2 },
  delivered: { tone: "success", icon: CheckCircle2 },
  resolved: { tone: "success", icon: CheckCircle2 },
  paid: { tone: "success", icon: CheckCircle2 },
  refunded: { tone: "purple" },
  pending: { tone: "warning", icon: Clock3 },
  submitted: { tone: "warning", icon: Clock3 },
  under_review: { tone: "warning", icon: Clock3 },
  reviewing: { tone: "warning", icon: Clock3 },
  processing: { tone: "info", icon: LoaderCircle },
  provisioning: { tone: "info", icon: LoaderCircle },
  running: { tone: "info", icon: LoaderCircle },
  queued: { tone: "info", icon: Clock3 },
  retrying: { tone: "warning", icon: Clock3 },
  escrow: { tone: "warning" },
  booked: { tone: "warning" },
  customs_clearance: { tone: "warning" },
  customs_cleared: { tone: "info" },
  more_information_required: { tone: "warning", icon: FileCheck2 },
  resubmission_required: { tone: "warning", icon: FileCheck2 },
  picked_up: { tone: "info", icon: Truck },
  in_transit: { tone: "info", icon: Truck },
  out_for_delivery: { tone: "info", icon: Truck },
  at_origin_facility: { tone: "info", icon: Truck },
  departed_origin: { tone: "info", icon: Truck },
  arrived_destination_country: { tone: "info", icon: Truck },
  at_destination_facility: { tone: "info", icon: Truck },
  arrived: { tone: "info", icon: Truck },
  departed: { tone: "info", icon: Truck },
  open: { tone: "danger", icon: AlertCircle },
  disputed: { tone: "danger", icon: ShieldAlert },
  failed: { tone: "danger", icon: XCircle },
  rejected: { tone: "danger", icon: XCircle },
  suspended: { tone: "danger", icon: ShieldAlert },
  locked: { tone: "danger", icon: ShieldAlert },
  lockdown: { tone: "danger", icon: ShieldAlert },
  blocked: { tone: "danger", icon: ShieldAlert },
  exception: { tone: "danger", icon: AlertCircle },
  delivery_attempted: { tone: "warning", icon: Truck },
  on_hold: { tone: "warning", icon: Clock3 },
  cancelled: { tone: "neutral", icon: XCircle },
  canceled: { tone: "neutral", icon: XCircle },
  closed: { tone: "neutral" },
  dismissed: { tone: "neutral" },
  draft: { tone: "neutral" },
  inactive: { tone: "neutral" },
  disabled: { tone: "neutral" },
  archived: { tone: "neutral" },
  returned: { tone: "purple", icon: Truck },
  paused: { tone: "warning", icon: Clock3 },
  expired: { tone: "danger", icon: Clock3 },
  escalated: { tone: "purple", icon: AlertCircle },
  investigating: { tone: "purple", icon: AlertCircle },
  trial: { tone: "purple" },
  failed_delivery: { tone: "danger", icon: XCircle },
};

const DOMAIN_OVERRIDES: Record<StatusDomain, Record<string, StatusDefinition>> = {
  shipment: {
    created: { tone: "neutral" },
    exception: { tone: "danger", icon: AlertCircle },
  },
  job: {
    cancelled: { tone: "neutral", icon: XCircle },
    queued: { tone: "info", icon: Clock3 },
  },
  tenant: {
    locked: { label: "Locked down", tone: "danger", icon: ShieldAlert },
    is_active: { label: "Active", tone: "success", icon: CheckCircle2 },
  },
  kyc: {
    submitted: { tone: "warning", icon: FileCheck2 },
    resubmission_required: { label: "Resubmission required", tone: "warning", icon: FileCheck2 },
  },
  order: {
    escrow: { tone: "warning" },
    disputed: { tone: "danger", icon: ShieldAlert },
  },
  dispute: {
    open: { tone: "danger", icon: AlertCircle },
    under_review: { label: "Under review", tone: "warning", icon: Clock3 },
    resolved: { tone: "success", icon: CheckCircle2 },
  },
  vendor: {
    active: { tone: "success", icon: CheckCircle2 },
    pending: { tone: "warning", icon: Clock3 },
    rejected: { tone: "danger", icon: XCircle },
  },
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanize(value: string): string {
  return value.trim().replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getStatusDefinition(domain: StatusDomain, value: string): StatusDefinition {
  const key = normalize(value);
  return DOMAIN_OVERRIDES[domain][key] ?? SHARED[key] ?? { tone: "neutral" };
}

type StatusBadgeProps = {
  className?: string;
  showIcon?: boolean;
} & (
  | { domain: StatusDomain; value: string; status?: never; label?: string }
  | { status: string; label?: string; domain?: StatusDomain; value?: string }
);

export function StatusBadge(props: StatusBadgeProps) {
  const rawValue = props.value ?? props.status ?? "";
  const domain = props.domain ?? "order";
  const definition = getStatusDefinition(domain, rawValue);
  const color = TONE_COLOR[definition.tone];
  const Icon = props.showIcon === false ? undefined : definition.icon;
  const style = {
    "--status-color": color,
    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
  } as CSSProperties;
  const text = props.label ?? definition.label ?? (humanize(rawValue) || "Unknown");

  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none text-foreground ${props.className ?? ""}`}
      style={style}
      data-status-domain={domain}
      data-status-value={normalize(rawValue)}
      aria-label={`${domain}: ${text}`}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {Icon && <Icon aria-hidden="true" className="size-3 shrink-0" />}
      <span>{text}</span>
    </span>
  );
}

export const STATUS_MATRIX: Record<StatusDomain, string[]> = {
  shipment: [
    "pending", "created", "booked", "picked_up", "processing", "at_origin_facility",
    "departed_origin", "in_transit", "arrived_destination_country", "customs_clearance",
    "customs_cleared", "at_destination_facility", "out_for_delivery", "delivery_attempted",
    "delivered", "exception", "on_hold", "failed", "cancelled", "returned",
  ],
  job: ["queued", "pending", "running", "processing", "retrying", "paused", "completed", "succeeded", "failed", "cancelled"],
  tenant: ["draft", "pending", "provisioning", "active", "is_active", "trial", "locked", "suspended", "disabled", "inactive", "archived", "expired"],
  kyc: ["submitted", "under_review", "approved", "rejected", "resubmission_required", "more_information_required"],
  order: ["pending", "paid", "escrow", "processing", "completed", "refunded", "disputed", "cancelled", "failed"],
  dispute: ["open", "under_review", "investigating", "escalated", "resolved", "dismissed", "closed"],
  vendor: ["pending", "active", "approved", "verified", "suspended", "rejected", "inactive", "blocked"],
};
