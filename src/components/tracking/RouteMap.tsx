import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Native route map — hand-built SVG, no map provider, no network calls.
 *
 * Landmasses are coarse lon/lat polygons projected with a simple equirectangular
 * projection. The route between stops is interpolated along a great circle so
 * long-haul legs bow realistically. Everything is derived from application data.
 */

const RAD = Math.PI / 180;

type LonLat = { lon: number; lat: number };

// World canvas: 360 × 180 units, one unit per degree.
const WORLD_W = 360;
const WORLD_H = 180;

function project({ lon, lat }: LonLat) {
  return { x: lon + 180, y: 90 - lat };
}

// ─── Coarse landmass outlines (lon, lat) ─────────────────────────────────────

const LAND: LonLat[][] = [
  // North America
  [
    { lon: -168, lat: 66 }, { lon: -160, lat: 71 }, { lon: -140, lat: 70 },
    { lon: -125, lat: 70 }, { lon: -110, lat: 68 }, { lon: -95, lat: 68 },
    { lon: -80, lat: 73 }, { lon: -75, lat: 68 }, { lon: -64, lat: 60 },
    { lon: -55, lat: 52 }, { lon: -65, lat: 45 }, { lon: -71, lat: 42 },
    { lon: -76, lat: 35 }, { lon: -81, lat: 25 }, { lon: -90, lat: 29 },
    { lon: -97, lat: 26 }, { lon: -105, lat: 22 }, { lon: -110, lat: 24 },
    { lon: -115, lat: 30 }, { lon: -125, lat: 40 }, { lon: -125, lat: 48 },
    { lon: -135, lat: 58 }, { lon: -150, lat: 60 },
  ],
  // Central America bridge
  [
    { lon: -105, lat: 22 }, { lon: -95, lat: 17 }, { lon: -88, lat: 16 },
    { lon: -83, lat: 9 }, { lon: -77, lat: 8 }, { lon: -84, lat: 12 },
    { lon: -92, lat: 15 }, { lon: -100, lat: 18 },
  ],
  // South America
  [
    { lon: -77, lat: 8 }, { lon: -72, lat: 11 }, { lon: -62, lat: 10 },
    { lon: -52, lat: 5 }, { lon: -35, lat: -5 }, { lon: -38, lat: -13 },
    { lon: -48, lat: -25 }, { lon: -58, lat: -35 }, { lon: -62, lat: -41 },
    { lon: -65, lat: -54 }, { lon: -75, lat: -52 }, { lon: -73, lat: -45 },
    { lon: -71, lat: -30 }, { lon: -70, lat: -18 }, { lon: -77, lat: -5 },
    { lon: -80, lat: 0 },
  ],
  // Africa
  [
    { lon: -17, lat: 15 }, { lon: -17, lat: 21 }, { lon: -10, lat: 27 },
    { lon: 0, lat: 32 }, { lon: 11, lat: 34 }, { lon: 25, lat: 32 },
    { lon: 32, lat: 31 }, { lon: 35, lat: 23 }, { lon: 43, lat: 12 },
    { lon: 51, lat: 11 }, { lon: 42, lat: -2 }, { lon: 40, lat: -12 },
    { lon: 35, lat: -22 }, { lon: 25, lat: -34 }, { lon: 18, lat: -35 },
    { lon: 12, lat: -18 }, { lon: 9, lat: -1 }, { lon: 9, lat: 4 },
    { lon: -5, lat: 5 }, { lon: -13, lat: 8 },
  ],
  // Eurasia
  [
    { lon: -9, lat: 43 }, { lon: -10, lat: 38 }, { lon: -6, lat: 36 },
    { lon: 3, lat: 36 }, { lon: 10, lat: 37 }, { lon: 18, lat: 40 },
    { lon: 24, lat: 36 }, { lon: 29, lat: 41 }, { lon: 36, lat: 36 },
    { lon: 35, lat: 31 }, { lon: 43, lat: 12 }, { lon: 51, lat: 11 },
    { lon: 60, lat: 25 }, { lon: 67, lat: 25 }, { lon: 72, lat: 20 },
    { lon: 80, lat: 13 }, { lon: 80, lat: 8 }, { lon: 88, lat: 22 },
    { lon: 95, lat: 16 }, { lon: 99, lat: 10 }, { lon: 105, lat: 10 },
    { lon: 109, lat: 15 }, { lon: 120, lat: 15 }, { lon: 127, lat: 35 },
    { lon: 122, lat: 40 }, { lon: 130, lat: 42 }, { lon: 140, lat: 45 },
    { lon: 143, lat: 52 }, { lon: 155, lat: 60 }, { lon: 168, lat: 62 },
    { lon: 180, lat: 66 }, { lon: 180, lat: 71 }, { lon: 160, lat: 71 },
    { lon: 140, lat: 73 }, { lon: 120, lat: 73 }, { lon: 100, lat: 77 },
    { lon: 80, lat: 73 }, { lon: 60, lat: 70 }, { lon: 40, lat: 68 },
    { lon: 30, lat: 70 }, { lon: 20, lat: 70 }, { lon: 10, lat: 63 },
    { lon: 5, lat: 58 }, { lon: -2, lat: 51 }, { lon: -6, lat: 48 },
  ],
  // Greenland
  [
    { lon: -45, lat: 60 }, { lon: -52, lat: 66 }, { lon: -55, lat: 72 },
    { lon: -45, lat: 82 }, { lon: -25, lat: 82 }, { lon: -20, lat: 75 },
    { lon: -28, lat: 68 }, { lon: -40, lat: 60 },
  ],
  // Australia
  [
    { lon: 113, lat: -22 }, { lon: 114, lat: -34 }, { lon: 129, lat: -32 },
    { lon: 138, lat: -35 }, { lon: 147, lat: -38 }, { lon: 153, lat: -28 },
    { lon: 146, lat: -19 }, { lon: 142, lat: -11 }, { lon: 132, lat: -11 },
    { lon: 126, lat: -14 },
  ],
  // British Isles
  [
    { lon: -10, lat: 52 }, { lon: -9, lat: 57 }, { lon: -3, lat: 58 },
    { lon: 0, lat: 53 }, { lon: 1, lat: 51 }, { lon: -5, lat: 50 },
  ],
  // Japan
  [
    { lon: 130, lat: 33 }, { lon: 136, lat: 35 }, { lon: 141, lat: 41 },
    { lon: 145, lat: 43 }, { lon: 141, lat: 38 }, { lon: 134, lat: 33 },
  ],
];

// ─── Great-circle interpolation ──────────────────────────────────────────────

function toVec({ lon, lat }: LonLat) {
  const phi = lat * RAD;
  const lam = lon * RAD;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
}

function toLonLat(v: number[]): LonLat {
  const [x, y, z] = v;
  return { lon: Math.atan2(y, x) / RAD, lat: Math.atan2(z, Math.hypot(x, y)) / RAD };
}

function slerp(a: LonLat, b: LonLat, t: number): LonLat {
  const va = toVec(a);
  const vb = toVec(b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const k0 = Math.sin((1 - t) * omega) / s;
  const k1 = Math.sin(t * omega) / s;
  return toLonLat([va[0] * k0 + vb[0] * k1, va[1] * k0 + vb[1] * k1, va[2] * k0 + vb[2] * k1]);
}

/** Antimeridian-safe segment: unwrap longitudes so a hop never sweeps the whole map. */
function segmentPath(a: LonLat, b: LonLat, steps = 40) {
  const endLon = b.lon;
  let lon = endLon;
  while (lon - a.lon > 180) lon -= 360;
  while (lon - a.lon < -180) lon += 360;
  const end = { lon, lat: b.lat };
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = project(slerp(a, end, i / steps));
    pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  return pts.join(" ");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type RouteMapStop = {
  label: string;
  sublabel?: string | null;
  lon: number;
  lat: number;
  state: "done" | "current" | "todo";
  kind?: "origin" | "destination" | "stop";
};

export function RouteMap({
  stops,
  inTransit = true,
  className,
}: {
  stops: RouteMapStop[];
  inTransit?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const map = useMemo(() => {
    const pts = stops.filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat));
    if (pts.length < 2) return null;

    const xy = pts.map((s) => ({ ...s, ...project(s) }));
    const xs = xy.map((p) => p.x);
    const ys = xy.map((p) => p.y);

    // Pad generously, then square off to a 2:1 frame so nothing distorts.
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    const pad = 34;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let w = maxX - minX;
    let h = maxY - minY;
    const target = 2;
    if (w / h > target) h = w / target;
    else w = h * target;
    // Never let the frame exceed the world.
    w = Math.min(w, WORLD_W);
    h = Math.min(h, WORLD_H);
    const viewBox = `${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;

    // Graticule inside the visible frame.
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    for (let lon = Math.ceil((x0 - 180) / 20) * 20; lon <= x0 + w - 180; lon += 20) {
      const x = lon + 180;
      lines.push({ x1: x, y1: y0, x2: x, y2: y0 + h });
    }
    for (let lat = Math.ceil((90 - y0 - h) / 20) * 20; lat <= 90 - y0; lat += 20) {
      const y = 90 - lat;
      lines.push({ x1: x0, y1: y, x2: x0 + w, y2: y });
    }

    // Full route + the portion already travelled.
    let full = "";
    for (let i = 0; i < xy.length - 1; i++) {
      full += (full ? " " : "") + segmentPath(xy[i], xy[i + 1]);
    }
    let reached = -1;
    xy.forEach((p, i) => {
      if (p.state === "done" || p.state === "current") reached = i;
    });
    let done = "";
    for (let i = 0; i < Math.min(reached, xy.length - 1); i++) {
      done += (done ? " " : "") + segmentPath(xy[i], xy[i + 1]);
    }

    const land = LAND.map(
      (poly) => poly.map((p, i) => `${i === 0 ? "M" : "L"}${project(p).x.toFixed(1)} ${project(p).y.toFixed(1)}`).join(" ") + " Z",
    );

    return { xy, viewBox, lines, full, done, land, reached };
  }, [stops]);

  if (!map) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-secondary/70 to-accent/40",
        className,
      )}
    >
      <svg
        role="img"
        aria-label="Shipment route map"
        viewBox={map.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <defs>
          <filter id={`glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Graticule */}
        <g stroke="var(--border)" strokeWidth="0.35" strokeOpacity="0.9">
          {map.lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
        </g>

        {/* Landmasses */}
        <g fill="var(--muted)" stroke="var(--border)" strokeWidth="0.5" strokeLinejoin="round">
          {map.land.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        {/* Planned route */}
        <path
          d={map.full}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.1"
          strokeOpacity="0.45"
          strokeDasharray="4 4"
          strokeLinecap="round"
        />

        {/* Travelled route */}
        <path
          d={map.done}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.9"
          strokeLinecap="round"
          filter={`url(#glow-${uid})`}
        />

        {/* Package in motion along the route */}
        {inTransit && (
          <g>
            <g>
              <path
                d="M0,-5 L4,4 L0,2 L-4,4 Z"
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth="0.7"
              />
              <animateMotion dur="9s" repeatCount="indefinite" rotate="auto" path={map.full} />
            </g>
          </g>
        )}

        {/* Markers */}
        <g>
          {map.xy.map((p, i) => {
            const isCurrent = p.state === "current";
            const isDone = p.state === "done";
            const main = isCurrent ? "var(--primary)" : isDone ? "var(--primary)" : "var(--muted-foreground)";
            return (
              <g key={i}>
                {isCurrent && (
                  <>
                    <circle cx={p.x} cy={p.y} r="7" fill="var(--primary)" fillOpacity="0.18">
                      <animate attributeName="r" values="4;10;4" dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="fill-opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={p.x} cy={p.y} r="3.6" fill="none" stroke="var(--primary)" strokeWidth="0.7" />
                  </>
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isCurrent ? 2.6 : 2.1}
                  fill={isCurrent ? "var(--primary)" : p.state === "todo" ? "var(--card)" : main}
                  stroke={main}
                  strokeWidth="1.1"
                />
                <text
                  x={p.x}
                  y={p.y - 6}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: 6.5, fontWeight: 600, paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 1.8, strokeLinejoin: "round" }}
                >
                  {p.label}
                </text>
                {p.sublabel && (
                  <text
                    x={p.x}
                    y={p.y + 10}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 5, paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 1.5, strokeLinejoin: "round" }}
                  >
                    {p.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-card/85 to-transparent px-3 pb-2 pt-8">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Route map
        </span>
        <span className="text-[10px] text-muted-foreground">
          Lat / long from shipment records · no external map provider
        </span>
      </div>
    </div>
  );
}
