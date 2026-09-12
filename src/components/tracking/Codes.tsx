import { useMemo } from "react";
import { qrToSvgPath } from "@/lib/qr";
import { code128Svg } from "@/lib/barcode";
import { cn } from "@/lib/utils";

/**
 * Renders a QR code as inline SVG using the in-app encoder (src/lib/qr.ts).
 * Fully offline — no external image or QR service is involved.
 */
export function QrCodeSvg({
  value,
  size = 96,
  ecl = "medium",
  className,
}: {
  value: string;
  size?: number;
  ecl?: "low" | "medium" | "quartile" | "high";
  className?: string;
}) {
  const { path, viewBox } = useMemo(() => {
    const { size: n, path: p } = qrToSvgPath(value, ecl);
    // 2-module quiet zone on every side.
    return { path: p, viewBox: `-2 -2 ${n + 4} ${n + 4}` };
  }, [value, ecl]);

  return (
    <svg
      role="img"
      aria-label={`QR code for ${value}`}
      width={size}
      height={size}
      viewBox={viewBox}
      className={cn("shrink-0", className)}
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={viewBox.split(" ")[2] as unknown as number} height={viewBox.split(" ")[3] as unknown as number} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}

/**
 * Renders a scannable Code 128-B barcode as inline SVG using the in-app
 * generator (src/lib/barcode.ts). Bars only; spaces are the background.
 */
export function BarcodeSvg({
  value,
  height = 64,
  moduleWidth = 2,
  showText = true,
  className,
}: {
  value: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
  className?: string;
}) {
  const { width, bars } = useMemo(
    () => code128Svg(value, { moduleWidth, height }),
    [value, moduleWidth, height],
  );

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <svg
        role="img"
        aria-label={`Barcode for ${value}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full"
        preserveAspectRatio="none"
      >
        <rect x={0} y={0} width={width} height={height} fill="white" />
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.width} height={height} fill="black" />
        ))}
      </svg>
      {showText && (
        <span className="font-mono text-[10px] tracking-[0.2em] text-black">{value}</span>
      )}
    </div>
  );
}
