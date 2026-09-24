import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPageSvg,
  svgToDataUrl,
  type DocumentValues,
  type LayoutElement,
  type TemplatePage,
  type TemplateSchema,
} from "@/lib/docTemplateEngine";
import {
  clamp,
  elementBox,
  elementDisplayText,
  moveElement,
  resizeElement,
  snap as snapValue,
  type Box,
} from "@/lib/documentLayout";
import { cn } from "@/lib/utils";

/**
 * Visual layout canvas.
 *
 * The base layer is the REAL rendered page (the engine's own SVG), so the
 * builder is always pixel-faithful to the export. Hit boxes are transparent
 * overlays whose geometry comes from the same element data, giving direct
 * drag-to-move and corner-resize without re-implementing any painting.
 */

interface ElementCanvasProps {
  page: TemplatePage;
  schema: TemplateSchema;
  values: DocumentValues;
  /** @deprecated No longer stamps. Kept for compatibility. */
  sensitive?: boolean;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onChange: (elements: LayoutElement[]) => void;
  showGrid?: boolean;
  snapToGrid?: boolean;
}


export function ElementCanvas({
  page,
  schema,
  values,
  sensitive: _sensitive = false,
  selectedIndex,
  onSelect,
  onChange,
  showGrid = false,
  snapToGrid = true,
}: ElementCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.8);
  const [hovered, setHovered] = useState<number | null>(null);

  // Refs mirror props so window-level drag listeners never read stale values.
  const elementsRef = useRef<LayoutElement[]>(page.elements);
  elementsRef.current = page.elements;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const snapRef = useRef(snapToGrid);
  snapRef.current = snapToGrid;
  const pageRef = useRef(page);
  pageRef.current = page;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<LayoutElement[] | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(clamp(width / page.width, 0.15, 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page.width]);

  /** Coalesce updates to one per animation frame while dragging. */
  const schedule = useCallback((elements: LayoutElement[]) => {
    pendingRef.current = elements;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next) onChangeRef.current(next);
    });
  }, []);

  const boxes = useMemo(
    () =>
      page.elements.map((el) =>
        elementBox(el, elementDisplayText(el, schema, values)),
      ),
    [page.elements, schema, values],
  );

  // Anything reaching past the page edge is clipped at export time, so flag it
  // while the admin is still designing rather than at save time.
  const clipped = useMemo(
    () =>
      boxes.map(
        (b) =>
          b.x < -1 || b.y < -1 || b.x + b.w > page.width + 1 || b.y + b.h > page.height + 1,
      ),
    [boxes, page.width, page.height],
  );

  const baseSvg = useMemo(
    () => buildPageSvg(page, schema, values, {}, 1),
    [page, schema, values],
  );

  const beginDrag = useCallback(
    (event: React.PointerEvent, index: number, mode: "move" | "resize") => {
      event.preventDefault();
      event.stopPropagation();
      onSelect(index);

      const startX = event.clientX;
      const startY = event.clientY;
      const originBox: Box = boxes[index] ?? { x: 0, y: 0, w: 0, h: 0 };
      const originEl = elementsRef.current[index];
      if (!originEl) return;

      const apply = (elements: LayoutElement[]) => schedule(elements);

      const onMove = (ev: PointerEvent) => {
        const s = scaleRef.current || 1;
        const dx = (ev.clientX - startX) / s;
        const dy = (ev.clientY - startY) / s;
        const snapOn = snapRef.current;
        const pageSize = pageRef.current;
        const elements = elementsRef.current;
        const index2 = index;

        if (mode === "move") {
          const targetX = snapValue(originBox.x + dx, snapOn);
          const targetY = snapValue(originBox.y + dy, snapOn);
          const boundedX = clamp(targetX, 0, Math.max(0, pageSize.width - originBox.w));
          const boundedY = clamp(targetY, 0, Math.max(0, pageSize.height - originBox.h));
          const moved = moveElement(originEl, boundedX - originBox.x, boundedY - originBox.y);
          const next = elements.slice();
          next[index2] = moved;
          apply(next);
          return;
        }

        const targetW = snapValue(originBox.w + dx, snapOn);
        const targetH = snapValue(originBox.h + dy, snapOn);
        const boundedW = clamp(targetW, 8, pageSize.width - originBox.x);
        const boundedH = clamp(targetH, 8, pageSize.height - originBox.y);
        const resized = resizeElement(originEl, {
          x: originBox.x,
          y: originBox.y,
          w: boundedW,
          h: boundedH,
        });
        const next = elements.slice();
        next[index2] = resized;
        apply(next);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [boxes, onSelect, schedule],
  );

  const width = Math.round(page.width * scale);
  const height = Math.round(page.height * scale);

  return (
    <div className="w-full" ref={containerRef}>
      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-border shadow-sm"
        style={{ width, height, background: page.background ?? "#ffffff" }}
        onPointerDown={() => onSelect(null)}
      >
        <img
          src={svgToDataUrl(baseSvg)}
          alt="Document layout"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
        />

        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(15,23,42,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.10) 1px, transparent 1px)",
              backgroundSize: `${Math.max(8, 40 * scale)}px ${Math.max(8, 40 * scale)}px`,
            }}
          />
        )}

        {page.elements.map((el, index) => {
          const box = boxes[index];
          if (!box) return null;
          const isSelected = selectedIndex === index;
          const isHovered = hovered === index;
          const isClipped = clipped[index];
          return (
            <div
              key={`${el.kind}-${index}`}
              role="button"
              tabIndex={-1}
              aria-label={`${el.kind} element ${index + 1}`}
              onPointerDown={(e) => beginDrag(e, index, "move")}
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered((h) => (h === index ? null : h))}
              className={cn(
                "absolute cursor-move touch-none",
                isSelected ? "z-20" : "z-10",
              )}
              style={{
                left: box.x * scale,
                top: box.y * scale,
                width: Math.max(box.w * scale, 6),
                height: Math.max(box.h * scale, 6),
              }}
            >
              <span
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-sm border",
                  isSelected
                    ? "border-2 border-primary bg-primary/5"
                    : isHovered
                      ? "border border-primary/50"
                      : "border border-transparent",
                  isClipped && "border-2 border-dashed border-destructive bg-destructive/10",
                )}
              />
              {isClipped && (
                <span className="pointer-events-none absolute right-1 top-1 whitespace-nowrap rounded bg-destructive/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                  Off page
                </span>
              )}
              {isSelected && (
                <>
                  <span
                    role="presentation"
                    onPointerDown={(e) => beginDrag(e, index, "resize")}
                    className="absolute -bottom-3 -right-3 z-30 flex h-6 w-6 cursor-nwse-resize touch-none items-center justify-center sm:-bottom-1 sm:-right-1 sm:h-3 sm:w-3"
                  >
                    <span className="h-2.5 w-2.5 rounded-sm border border-background bg-primary sm:h-2 sm:w-2" />
                  </span>
                  <span className="pointer-events-none absolute left-1 top-1 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                    {el.kind}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Drag to move · corner handle to resize · {Math.round(scale * 100)}% zoom · {page.width}×{page.height}px
        {clipped.some(Boolean) && (
          <span className="ml-2 font-medium text-destructive">
            · {clipped.filter(Boolean).length} element{clipped.filter(Boolean).length === 1 ? "" : "s"} off page
          </span>
        )}
      </p>
    </div>
  );
}
