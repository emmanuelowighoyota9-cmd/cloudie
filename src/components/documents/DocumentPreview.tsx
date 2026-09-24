import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildPageSvg,
  svgToDataUrl,
  type BuildSvgOptions,
  type DocumentValues,
  type TemplateConfiguration,
  type TemplateSchema,
} from "@/lib/docTemplateEngine";

/**
 * Live preview of a SoftBaker template.
 *
 * Re-renders synchronously on every keystroke: the same engine that produces
 * the exported artifacts builds the SVG here, so what the user sees is exactly
 * what gets generated. Nothing is fetched — the SVG is self-contained.
 */

interface DocumentPreviewProps {
  configuration: TemplateConfiguration;
  schema: TemplateSchema;
  values: DocumentValues;
  sensitive?: boolean;
  className?: string;
  compact?: boolean;
}

export function DocumentPreview({
  configuration,
  schema,
  values,
  sensitive = false,
  className,
  compact = false,
}: DocumentPreviewProps) {
  const [page, setPage] = useState(0);

  const options: BuildSvgOptions = useMemo(() => ({ sensitive, images: {} }), [sensitive]);

  const pages = useMemo(() => {
    return (configuration.pages ?? []).map((p) => buildPageSvg(p, schema, values, options, 1));
  }, [configuration, schema, values, options]);

  const total = pages.length;
  const safeIndex = Math.min(page, Math.max(0, total - 1));
  const active = pages[safeIndex];

  if (total === 0) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-dashed border-border p-10", className)}>
        <p className="text-sm text-muted-foreground">This template has no layout pages.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:14px_14px]" />
        <AnimatePresence mode="wait">
          <motion.img
            key={safeIndex}
            src={svgToDataUrl(active)}
            alt="Document preview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative mx-auto block h-auto w-full max-w-full rounded-lg shadow-sm"
            style={{ maxHeight: compact ? 260 : 460, objectFit: "contain" }}
          />
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {total > 1 ? (
          <div className="flex items-center gap-1" role="group" aria-label="Preview pages">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                aria-label={`Preview page ${i + 1}`}
                className={cn(
                  "h-6 min-w-6 rounded-md border px-1.5 text-[11px] font-medium transition-colors",
                  i === safeIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Layers className="h-3 w-3" /> {configuration.pages[0]?.width}×{configuration.pages[0]?.height}px
          </span>
        )}

        {sensitive && (
          <span className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3 w-3" /> Stamped
          </span>
        )}
      </div>
    </div>
  );
}
