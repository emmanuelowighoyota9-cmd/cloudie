import { Copy, MoveDown, MoveUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LayoutElement, TemplateSchema } from "@/lib/docTemplateEngine";

/**
 * Property panel for the element selected on the canvas.
 *
 * Every field writes straight back into the same `LayoutElement` the renderer
 * consumes, so the inspector and the drag handles are two views of one model.
 */

interface ElementInspectorProps {
  element: LayoutElement;
  index: number;
  total: number;
  schema: TemplateSchema;
  onChange: (element: LayoutElement) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (direction: -1 | 1) => void;
}

const selectClass =
  "h-11 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary sm:h-9";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  optional = false,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: number;
  optional?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <Row label={label}>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value === undefined ? "" : value}
        placeholder={optional ? "auto" : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(optional ? undefined : 0);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="h-11 w-full min-w-0 text-xs sm:h-8"
      />
    </Row>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Row label={label}>
      <div className="flex items-stretch gap-1.5">
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#0f172a"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5 sm:h-8 sm:w-9"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 min-w-0 flex-1 font-mono text-[11px] sm:h-8"
        />
      </div>
    </Row>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Row label={label}>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function ElementInspector({
  element,
  index,
  total,
  schema,
  onChange,
  onDelete,
  onDuplicate,
  onReorder,
}: ElementInspectorProps) {
  const set = (patch: Record<string, unknown>) => onChange({ ...element, ...patch } as LayoutElement);

  const fieldOptions = [
    { label: "— none —", value: "" },
    ...schema.fields.map((f) => ({ label: `${f.label} (${f.id})`, value: f.id })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold capitalize text-foreground">{element.kind}</p>
          <p className="text-[10px] text-muted-foreground">
            Layer {index + 1} of {total}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 sm:h-7 sm:w-7"
            title="Bring forward"
            disabled={index >= total - 1}
            onClick={() => onReorder(1)}
          >
            <MoveUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 sm:h-7 sm:w-7"
            title="Send backward"
            disabled={index <= 0}
            onClick={() => onReorder(-1)}
          >
            <MoveDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-11 w-11 sm:h-7 sm:w-7" title="Duplicate" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 text-destructive sm:h-7 sm:w-7"
            title="Delete"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content + binding */}
      {element.kind === "text" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <SelectInput
            label="Bind to field"
            value={element.bind ?? ""}
            options={fieldOptions}
            onChange={(value) => set({ bind: value || undefined })}
          />
          {!element.bind && (
            <Row label="Static text">
              <Textarea
                rows={2}
                value={element.text ?? ""}
                onChange={(e) => set({ text: e.target.value })}
                className="text-xs"
              />
            </Row>
          )}
        </div>
      )}

      {(element.kind === "badge" || element.kind === "qr" || element.kind === "barcode" || element.kind === "image") && (
        <div className="rounded-lg border border-border p-3">
          <SelectInput
            label="Bind to field"
            value={element.bind ?? ""}
            options={fieldOptions}
            onChange={(value) => set({ bind: value })}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {element.kind === "image"
              ? "Image fields render uploaded assets or data URLs. Only the first page preview shows a placeholder."
              : element.kind === "badge"
                ? "Status fields get colour-coded automatically from their value."
                : "Bound values are encoded at render time — never user HTML."}
          </p>
        </div>
      )}

      {/* Geometry */}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Position & size</p>
        <div className="grid grid-cols-2 gap-2">
          {element.kind === "line" ? (
            <>
              <NumberInput label="X1" value={element.x1} onChange={(v) => set({ x1: v ?? 0 })} />
              <NumberInput label="Y1" value={element.y1} onChange={(v) => set({ y1: v ?? 0 })} />
              <NumberInput label="X2" value={element.x2} onChange={(v) => set({ x2: v ?? 0 })} />
              <NumberInput label="Y2" value={element.y2} onChange={(v) => set({ y2: v ?? 0 })} />
            </>
          ) : (
            <>
              <NumberInput label="X" value={element.x} onChange={(v) => set({ x: v ?? 0 })} />
              <NumberInput label="Y" value={element.y} onChange={(v) => set({ y: v ?? 0 })} />
              {element.kind === "text" && (
                <NumberInput label="Width" value={element.w} optional onChange={(v) => set({ w: v })} />
              )}
              {element.kind === "qr" && (
                <NumberInput label="Size" value={element.size} min={8} onChange={(v) => set({ size: v ?? 96 })} />
              )}
              {(element.kind === "rect" || element.kind === "image") && (
                <>
                  <NumberInput label="Width" value={element.w} min={8} onChange={(v) => set({ w: v ?? 100 })} />
                  <NumberInput label="Height" value={element.h} min={8} onChange={(v) => set({ h: v ?? 100 })} />
                </>
              )}
              {element.kind === "barcode" && (
                <>
                  <NumberInput label="Width" value={element.w} optional min={40} onChange={(v) => set({ w: v })} />
                  <NumberInput label="Height" value={element.h} optional min={16} onChange={(v) => set({ h: v })} />
                </>
              )}
              {element.kind === "badge" && (
                <>
                  <NumberInput label="Width" value={element.w} optional min={24} onChange={(v) => set({ w: v })} />
                  <NumberInput label="Height" value={element.h} optional min={16} onChange={(v) => set({ h: v })} />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Type-specific styling */}
      {element.kind === "text" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Typography</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Size" value={element.size} min={6} onChange={(v) => set({ size: v ?? 16 })} />
            <NumberInput
              label="Line height"
              value={element.lineHeight}
              optional
              min={8}
              onChange={(v) => set({ lineHeight: v })}
            />
            <NumberInput
              label="Letter spacing"
              value={element.letterSpacing}
              optional
              step={0.2}
              onChange={(v) => set({ letterSpacing: v })}
            />
            <NumberInput
              label="Max chars"
              value={element.maxChars}
              optional
              min={1}
              onChange={(v) => set({ maxChars: v })}
            />
          </div>
          <SelectInput
            label="Weight"
            value={String(element.weight ?? 400)}
            options={["400", "500", "600", "700", "800"].map((w) => ({ label: w, value: w }))}
            onChange={(v) => set({ weight: Number(v) })}
          />
          <SelectInput
            label="Align"
            value={element.align ?? "left"}
            options={[
              { label: "Left", value: "left" },
              { label: "Centre", value: "center" },
              { label: "Right", value: "right" },
            ]}
            onChange={(v) => set({ align: v })}
          />
          <SelectInput
            label="Family"
            value={element.family ?? "sans"}
            options={[
              { label: "Sans", value: "sans" },
              { label: "Serif", value: "serif" },
              { label: "Mono", value: "mono" },
            ]}
            onChange={(v) => set({ family: v })}
          />
          <ColorInput label="Colour" value={element.color ?? "#0f172a"} onChange={(v) => set({ color: v })} />
          <div className="flex flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={!!element.uppercase}
                onChange={(e) => set({ uppercase: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              Uppercase
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={!!element.italic}
                onChange={(e) => set({ italic: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              Italic
            </label>
          </div>
        </div>
      )}

      {element.kind === "rect" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Appearance</p>
          <ColorInput label="Fill" value={element.fill ?? "#f1f5f9"} onChange={(v) => set({ fill: v })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Radius" value={element.rx} optional min={0} onChange={(v) => set({ rx: v })} />
            <NumberInput
              label="Border width"
              value={element.strokeWidth}
              optional
              min={0}
              step={0.5}
              onChange={(v) => set({ strokeWidth: v })}
            />
          </div>
          <ColorInput label="Border colour" value={element.stroke ?? "#e2e8f0"} onChange={(v) => set({ stroke: v })} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Border</span>
            <button
              type="button"
              onClick={() => set({ stroke: element.stroke ? undefined : "#e2e8f0" })}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                element.stroke ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {element.stroke ? "on" : "off"}
            </button>
          </div>
        </div>
      )}

      {element.kind === "line" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <ColorInput label="Colour" value={element.stroke ?? "#cbd5e1"} onChange={(v) => set({ stroke: v })} />
          <NumberInput
            label="Thickness"
            value={element.strokeWidth}
            min={0.5}
            step={0.5}
            onChange={(v) => set({ strokeWidth: v ?? 1 })}
          />
        </div>
      )}

      {(element.kind === "qr" || element.kind === "barcode") && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <ColorInput label="Bar / module colour" value={element.color ?? "#0f172a"} onChange={(v) => set({ color: v })} />
          {element.kind === "qr" && (
            <ColorInput label="Background" value={element.bg ?? "#ffffff"} onChange={(v) => set({ bg: v })} />
          )}
        </div>
      )}

      {element.kind === "image" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Radius" value={element.rx} optional min={0} onChange={(v) => set({ rx: v })} />
          </div>
          <SelectInput
            label="Fit"
            value={element.fit ?? "cover"}
            options={[
              { label: "Cover", value: "cover" },
              { label: "Contain", value: "contain" },
            ]}
            onChange={(v) => set({ fit: v })}
          />
        </div>
      )}

      {element.kind === "badge" && (
        <div className="rounded-lg border border-border p-3">
          <NumberInput label="Font size" value={element.size} optional min={8} onChange={(v) => set({ size: v })} />
        </div>
      )}
    </div>
  );
}
