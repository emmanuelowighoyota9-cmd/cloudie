import { cn } from "@/lib/utils";
import {
  Building2,
  Factory,
  Landmark,
  MapPin,
  PackageCheck,
  Plane,
  Truck,
  Warehouse,
} from "lucide-react";

export type RouteStopView = {
  label: string;
  city: string | null;
  country: string | null;
  sequence: number;
  status: string;
  arrivalAt: number | null | undefined;
  departureAt: number | null | undefined;
};

const STOP_ICONS: Record<string, typeof MapPin> = {
  warehouse: Warehouse,
  airport: Plane,
  sorting_center: Factory,
  distribution_center: Building2,
  customs_facility: Landmark,
  delivery_hub: Truck,
  country: MapPin,
  state: MapPin,
  city: MapPin,
};

export function stopIcon(kind: string | undefined) {
  return (kind && STOP_ICONS[kind]) || MapPin;
}

function stopLabel(stop: RouteStopView) {
  const parts = [stop.city, stop.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : stop.label;
}

function stopDone(stop: RouteStopView) {
  return stop.status === "departed" || stop.status === "arrived";
}

/**
 * Native route visualization — pure SVG/HTML built from application data.
 * No map provider: origin → route stops (completed / current / remaining) → destination.
 */
export function RouteViz({
  origin,
  destination,
  currentLabel,
  stops,
  className,
}: {
  origin: string | null;
  destination: string | null;
  currentLabel: string | null;
  stops: RouteStopView[];
  className?: string;
}) {
  // Chain: origin (if any) + route stops + destination (if any, deduped).
  const nodes: Array<{ label: string; kind?: string; state: "done" | "current" | "todo" }> = [];
  if (origin) nodes.push({ label: origin, kind: "country", state: "done" });
  for (const s of stops) {
    const done = stopDone(s);
    const isCurrent = !done && currentLabel !== null && stopLabel(s) === currentLabel;
    nodes.push({
      label: stopLabel(s),
      kind: s.label,
      state: done ? "done" : isCurrent ? "current" : "todo",
    });
  }
  if (destination) {
    const existing = nodes.find((n) => n.label === destination);
    if (existing) existing.state = existing.state === "done" ? "done" : existing.state;
    else nodes.push({ label: destination, kind: "country", state: "todo" });
  }
  // If nothing at all, show a minimal placeholder chain.
  if (nodes.length === 0) return null;

  // If no stop is marked current, the first pending stop reads as "next".
  const hasCurrent = nodes.some((n) => n.state === "current");
  if (!hasCurrent) {
    const firstTodo = nodes.find((n) => n.state === "todo");
    if (firstTodo && origin) firstTodo.state = "current";
  }

  const width = 100;
  const rowH = 34;
  const height = nodes.length * rowH + 6;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        role="img"
        aria-label="Shipment route"
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[220px]"
        style={{ maxHeight: nodes.length * 44 }}
        preserveAspectRatio="xMinYMin meet"
      >
        {nodes.slice(0, -1).map((n, i) => {
          const y1 = i * rowH + 18;
          const y2 = (i + 1) * rowH + 18;
          const done = n.state === "done";
          return (
            <g key={`edge-${i}`}>
              <line x1={17} y1={y1} x2={17} y2={y2} stroke="currentColor" strokeWidth={1.5} className="text-slate-200 dark:text-slate-700" strokeDasharray="3 3" />
              <line x1={17} y1={y1} x2={17} y2={y2} stroke="currentColor" strokeWidth={1.5} className={done ? "text-blue-600" : "text-transparent"} />
            </g>
          );
        })}
        {nodes.map((n, i) => {
          const y = i * rowH + 18;
          const Icon = stopIcon(n.kind);
          const color =
            n.state === "done"
              ? "text-blue-600 dark:text-blue-400"
              : n.state === "current"
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-slate-300 dark:text-slate-600";
          return (
            <g key={`node-${i}`}>
              {n.state === "current" && (
                <circle cx={17} cy={y} r={11} className="fill-indigo-50 dark:fill-indigo-950/60 animate-pulse" />
              )}
              <foreignObject x={17 - 10} y={y - 10} width={20} height={20}>
                <Icon className={cn("h-5 w-5", color)} strokeWidth={2} />
              </foreignObject>
              <text x={36} y={y + 4} className="fill-slate-700 text-[11px] font-medium dark:fill-slate-200">
                {n.label}
              </text>
              {n.state === "current" && (
                <text x={36} y={y + 16} className="fill-indigo-500 text-[9px] font-semibold uppercase tracking-wider">
                  Current location
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
        <PackageCheck className="h-3 w-3" /> Route visualization — generated from application data
      </p>
    </div>
  );
}
