/**
 * Visual layout-builder helpers.
 *
 * The admin editor manipulates the exact same `LayoutElement` union the
 * renderer consumes, so anything arranged in the builder is what the engine
 * exports. Everything here is pure geometry + factories — no React, no DOM
 * painting (text measuring is the only optional browser touch).
 */

import {
  formatValueForField,
  type DocumentValues,
  type FieldDef,
  type LayoutElement,
  type TemplateConfiguration,
  type TemplatePage,
  type TemplateSchema,
} from "./docTemplateEngine";

// ─── Element kinds ────────────────────────────────────────────────────────────

export const ELEMENT_KINDS = ["text", "rect", "line", "image", "qr", "barcode", "badge"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const ELEMENT_LABELS: Record<ElementKind, string> = {
  text: "Text",
  rect: "Panel",
  line: "Rule",
  image: "Image",
  qr: "QR code",
  barcode: "Barcode",
  badge: "Status badge",
};

/** Kinds that draw their content from a bound field. */
export const BOUND_KINDS: ElementKind[] = ["image", "qr", "barcode", "badge"];

export const MIN_SIZE = 8;
export const SNAP = 4;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function snap(value: number, enabled = true): number {
  return enabled ? Math.round(value / SNAP) * SNAP : Math.round(value);
}

// ─── Text measurement (editor hit-boxes only) ─────────────────────────────────

const FONT_STACK: Record<string, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', Courier, monospace",
};

let measureCanvas: CanvasRenderingContext2D | null = null;

/** Approximate rendered width so hit-boxes match the exported SVG closely. */
export function measureTextWidth(
  text: string,
  size: number,
  weight: number,
  family: string,
): number {
  const longest = text
    .split("\n")
    .reduce((max, line) => (line.length > max.length ? line : max), "");
  if (!longest) return size * 2;
  if (typeof document !== "undefined") {
    try {
      if (!measureCanvas) {
        const canvas = document.createElement("canvas");
        measureCanvas = canvas.getContext("2d");
      }
      if (measureCanvas) {
        measureCanvas.font = `${weight} ${size}px ${FONT_STACK[family] ?? FONT_STACK.sans}`;
        return measureCanvas.measureText(longest).width;
      }
    } catch {
      /* fall through to the estimate */
    }
  }
  // Conservative Helvetica-ish estimate.
  return longest.length * size * 0.56;
}

// ─── Display text ─────────────────────────────────────────────────────────────

export function elementDisplayText(
  el: LayoutElement,
  schema: TemplateSchema,
  values: DocumentValues,
): string {
  if (el.kind === "text") {
    if (!el.bind) return el.text ?? "";
    const raw = values[el.bind];
    if (raw === undefined || raw === "") return el.bind;
    return formatValueForField(
      schema.fields.find((f) => f.id === el.bind),
      raw,
    );
  }
  if (el.kind === "badge") {
    const raw = values[el.bind];
    if (raw === undefined || raw === "") return el.bind || "Status";
    return formatValueForField(
      schema.fields.find((f) => f.id === el.bind),
      raw,
    );
  }
  return "";
}

// ─── Editor preview values ────────────────────────────────────────────────────

/** Type-appropriate sample content, so a layout can be judged with real text. */
const SAMPLE_BY_TYPE: Record<string, string> = {
  text: "Sample text",
  textarea:
    "Sample body copy used to judge line length, wrapping and vertical rhythm while the layout is being designed.",
  number: "1250",
  currency: "1250.00",
  date: "2026-03-14",
  time: "14:32",
  datetime: "2026-03-14T14:32",
  select: "",
  radio: "",
  status: "",
  image: "",
  color: "#1d4ed8",
  url: "https://example.com/documents/1042",
  reference: "REF-2026-0042",
  address: "215 Kingsway, London WC2B 6EX",
  country: "United Kingdom",
};

/**
 * Values the builder previews with.
 *
 * Real drafts start from `defaultValues`, which is mostly empty strings — you
 * cannot judge a layout against nothing, so the editor uses declared defaults
 * where they exist and realistic samples everywhere else.
 */
export function previewValues(schema: TemplateSchema): DocumentValues {
  const out: DocumentValues = {};
  for (const f of schema.fields) {
    if (f.default !== undefined && f.default !== "") {
      out[f.id] = f.default;
      continue;
    }
    if (f.type === "checkbox") {
      out[f.id] = true;
      continue;
    }
    if (f.type === "select" || f.type === "radio" || f.type === "status") {
      const option = f.options?.[0]?.value;
      out[f.id] = option ?? (f.type === "status" ? "in transit" : "");
      continue;
    }
    if (f.type === "number" && (f.min !== undefined || f.max !== undefined)) {
      out[f.id] = String(Math.min(Math.max(f.min ?? 0, 1), f.max ?? Number.MAX_SAFE_INTEGER));
      continue;
    }
    out[f.id] = SAMPLE_BY_TYPE[f.type] ?? "Sample";
  }
  return out;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

export function elementBox(el: LayoutElement, text = ""): Box {
  switch (el.kind) {
    case "rect":
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case "image":
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case "qr":
      return { x: el.x, y: el.y, w: el.size, h: el.size };
    case "barcode":
      return { x: el.x, y: el.y, w: el.w ?? 240, h: el.h ?? 60 };
    case "line": {
      const w = Math.abs(el.x2 - el.x1);
      const h = Math.abs(el.y2 - el.y1);
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        w: Math.max(w, 6),
        h: Math.max(h, 6),
      };
    }
    case "badge": {
      const size = el.size ?? 13;
      const label = text || "Status";
      return {
        x: el.x,
        y: el.y,
        w: el.w ?? Math.max(70, label.length * size * 0.68 + 24),
        h: el.h ?? size + 16,
      };
    }
    case "text": {
      const size = el.size ?? 16;
      const lines = (text || " ").split("\n");
      const lineHeight = el.lineHeight ?? size * 1.35;
      const w = el.w ?? measureTextWidth(text, size, el.weight ?? 400, el.family ?? "sans");
      const boxX =
        el.align === "right"
          ? el.x + (el.w ?? 0) - w
          : el.align === "center"
            ? el.x + (el.w ?? 0) / 2 - w / 2
            : el.x;
      return {
        x: boxX,
        y: el.y - size,
        w: Math.max(w, 10),
        h: Math.max(lineHeight * lines.length, size),
      };
    }
  }
}

export function moveElement(el: LayoutElement, dx: number, dy: number): LayoutElement {
  if (el.kind === "line") {
    return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

/** Apply a new bounding box back onto the element, honouring each kind. */
export function resizeElement(el: LayoutElement, box: Box): LayoutElement {
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const w = Math.max(MIN_SIZE, Math.round(box.w));
  const h = Math.max(MIN_SIZE, Math.round(box.h));

  switch (el.kind) {
    case "qr":
      return { ...el, x, y, size: w };
    case "line":
      return { ...el, x1: x, y1: y, x2: x + w, y2: y + h };
    case "text":
      // Text boxes are anchored on the baseline, not the top edge.
      return { ...el, x, y: y + (el.size ?? 16), w };
    case "barcode":
      return { ...el, x, y, w, h };
    default:
      return { ...el, x, y, w, h };
  }
}

export function nudgeElement(el: LayoutElement, dx: number, dy: number): LayoutElement {
  return moveElement(el, dx, dy);
}

// ─── Factories ────────────────────────────────────────────────────────────────

export function defaultElement(
  kind: ElementKind,
  x: number,
  y: number,
  bind?: string,
): LayoutElement {
  const bx = Math.round(x);
  const by = Math.round(y);
  const id = bind ?? "";

  switch (kind) {
    case "text":
      return id
        ? { kind: "text", x: bx, y: by + 16, bind: id, size: 16, weight: 400, color: "#0f172a", family: "sans", align: "left" }
        : { kind: "text", x: bx, y: by + 16, text: "New text", size: 16, weight: 400, color: "#0f172a", family: "sans", align: "left" };
    case "rect":
      return { kind: "rect", x: bx, y: by, w: 220, h: 110, fill: "#f1f5f9", rx: 12 };
    case "line":
      return { kind: "line", x1: bx, y1: by, x2: bx + 220, y2: by, stroke: "#cbd5e1", strokeWidth: 1 };
    case "image":
      return { kind: "image", x: bx, y: by, w: 180, h: 120, bind: id, rx: 8, fit: "cover" };
    case "qr":
      return { kind: "qr", x: bx, y: by, size: 96, bind: id, color: "#0f172a", bg: "#ffffff" };
    case "barcode":
      return { kind: "barcode", x: bx, y: by, w: 240, h: 60, bind: id, color: "#0f172a" };
    case "badge":
      return { kind: "badge", x: bx, y: by, bind: id, size: 13 };
  }
}

export function duplicateElement(el: LayoutElement): LayoutElement {
  return moveElement(el, 16, 16);
}

/** A minimal, already-valid template so a new document starts from something real. */
export function blankTemplateDraft(options?: { organization?: string }): {
  schema: TemplateSchema;
  configuration: TemplateConfiguration;
} {
  const organization = (options?.organization ?? "").trim().slice(0, 60);

  const fields: FieldDef[] = [
    { id: "title", type: "text", label: "Document title", default: "Untitled document", required: true, maxLength: 60 },
    { id: "reference", type: "reference", label: "Reference", default: "DOC-0001", required: true },
    { id: "body", type: "textarea", label: "Body copy", default: "Write the document content here.", maxLength: 400 },
  ];
  const headerElements: LayoutElement[] = [
    { kind: "rect", x: 0, y: 0, w: 794, h: 128, fill: "#0f172a" },
    { kind: "text", x: 56, y: 78, bind: "title", size: 26, weight: 800, color: "#ffffff", maxChars: 40 },
    // No `w` here on purpose: text with an explicit width is stretched to
    // exactly that width by the renderer, which would squash the value.
    { kind: "text", x: 738, y: 74, align: "right", bind: "reference", size: 12, color: "#94a3b8" },
    { kind: "text", x: 56, y: 196, bind: "body", size: 13, color: "#334155", lineHeight: 22, maxChars: 200 },
    { kind: "line", x1: 56, y1: 172, x2: 738, y2: 172, stroke: "#e2e8f0", strokeWidth: 1 },
  ];

  // Owner-authored documents are custom-branded: the customer's organization
  // name becomes a normal, editable field on the letterhead.
  if (organization) {
    fields.splice(1, 0, {
      id: "organization",
      type: "text",
      label: "Issued by",
      default: organization,
      maxLength: 60,
      help: "Shown on the document letterhead. Defaults to your organization name.",
    });
    headerElements.splice(2, 0, {
      kind: "text",
      x: 56,
      y: 106,
      bind: "organization",
      size: 11,
      weight: 600,
      color: "#94a3b8",
      uppercase: true,
      letterSpacing: 1.5,
      maxChars: 44,
    });
  }

  return {
    schema: { fields },
    configuration: {
      renderScale: 2,
      pages: [
        {
          width: 794,
          height: 1123,
          background: "#ffffff",
          elements: headerElements,
        },
      ],
    },
  };
}

export const PAGE_PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: "A4 portrait", width: 794, height: 1123 },
  { label: "A4 landscape", width: 1123, height: 794 },
  { label: "US Letter", width: 816, height: 1056 },
  { label: "Card", width: 960, height: 560 },
  { label: "Wide", width: 1000, height: 620 },
  { label: "Square", width: 1000, height: 1000 },
  { label: "Story", width: 1080, height: 1920 },
];

export function pageLabel(page: TemplatePage): string {
  return `${page.width} × ${page.height}`;
}
