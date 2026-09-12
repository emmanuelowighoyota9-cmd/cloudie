/*
 * Cloudie native PDF engine.
 *
 * First-party document generation: converts a list of layout blocks into a
 * valid PDF 1.4 file (objects, content streams, cross-reference table,
 * trailer). Uses only the PDF standard-14 fonts, so no font embedding or
 * external resources are required. Runs anywhere TypeScript runs — including
 * Convex actions — with no filesystem, DOM, or network access.
 *
 * PDF bytes are validated with isPdf() before persistence.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export type PdfColor = [number, number, number]; // 0-1

export type PdfBlock =
  | { kind: "text"; text: string; size?: number; bold?: boolean; mono?: boolean; color?: PdfColor; align?: "left" | "center" | "right"; lineHeight?: number }
  | { kind: "spacer"; height: number }
  | { kind: "divider" }
  | { kind: "heading"; text: string } // section heading: bold, small caps style
  | { kind: "banner"; text: string; tone?: "dark" | "accent" | "muted" }
  | { kind: "box"; title?: string; lines: { label: string; value: string }[] }
  | { kind: "kv"; label: string; value: string } // single label: value line
  | { kind: "table"; headers: string[]; rows: string[][]; widths?: number[]; fontSize?: number };

export type PdfPageSize = "A4" | "LETTER";

export interface PdfRenderOptions {
  pageSize?: PdfPageSize;
  margin?: number; // points
  title?: string; // document metadata title
  footer?: string; // drawn at the bottom of every page
  accent?: PdfColor; // color for banners/dividers/headings
}

export interface PdfRenderResult {
  bytes: Uint8Array;
  pageCount: number;
  sizeBytes: number;
}

// ─── Geometry & fonts ─────────────────────────────────────────────────────────

const PAGE_SIZES: Record<PdfPageSize, [number, number]> = {
  A4: [595, 842],
  LETTER: [612, 792],
};

const DEFAULT_ACCENT: PdfColor = [0.23, 0.35, 0.85];

// Fonts are identified by resource name; only referenced fonts are emitted.
const F_REG = "F1"; // Helvetica
const F_BOLD = "F2"; // Helvetica-Bold
const F_MONO = "F3"; // Courier

const STANDARD_FONTS: Record<string, string> = {
  [F_REG]: "Helvetica",
  [F_BOLD]: "Helvetica-Bold",
  [F_MONO]: "Courier",
};

// ─── Text encoding (WinAnsi / latin-1 subset) ─────────────────────────────────

const CHAR_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201A": ",", "\u201C": '"', "\u201D": '"',
  "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u2022": "*", "\u00A0": " ",
  "\u20A6": "NGN ", "\u20B9": "INR ", "\u20AC": "EUR ", "\u00A3": "GBP ",
  "\u2192": "->", "\u2264": "<=", "\u2265": ">=",
};

/** Escape a string for a PDF literal text operator, latin-1 only. */
function encodePdfText(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = CHAR_REPLACEMENTS[ch] ?? ch;
    for (const c of mapped) {
      const code = c.charCodeAt(0);
      if (code > 0xff) { out += "?"; continue; }
      if (c === "\\" || c === "(" || c === ")") out += "\\" + c;
      else out += c;
    }
  }
  return out;
}

// Approximate Helvetica advance widths (per 1000 units) for common classes.
function charWidthFactor(ch: string, mono: boolean, bold: boolean): number {
  if (mono) return 600;
  const code = ch.charCodeAt(0);
  if (ch === " ") return 278;
  if (ch === "i" || ch === "l" || ch === "j" || ch === "I" || ch === "!" || ch === "'" || ch === "|") return 222;
  if (ch === "t" || ch === "f" || ch === "r" || ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "-" || ch === ",") return 333;
  if (ch === "m" || ch === "M" || ch === "W") return 889;
  if (ch === "w") return 722;
  if (code >= 48 && code <= 57) return 556; // digits
  if (code >= 65 && code <= 90) return bold ? 722 : 667; // caps
  return bold ? 611 : 556; // default lowercase/others
}

export function textWidth(text: string, size: number, opts: { bold?: boolean; mono?: boolean } = {}): number {
  let units = 0;
  for (const ch of text) units += charWidthFactor(ch, !!opts.mono, !!opts.bold);
  return (units / 1000) * size;
}

// ─── Content stream builder ───────────────────────────────────────────────────

type Op = string;

class PdfPageBuilder {
  readonly ops: Op[] = [];
  usedFonts = new Set<string>();

  addFontRef(ref: string) { this.usedFonts.add(ref); }

  drawText(
    text: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; mono?: boolean; color?: PdfColor } = {},
  ) {
    const size = opts.size ?? 10;
    const ref = opts.mono ? F_MONO : opts.bold ? F_BOLD : F_REG;
    this.addFontRef(ref);
    const [r, g, b] = opts.color ?? [0.1, 0.1, 0.12];
    this.ops.push(
      `BT /${ref} ${size} Tf ${fmt(r)} ${fmt(g)} ${fmt(b)} rg ${fmt(x)} ${fmt(y)} Td (${encodePdfText(text)}) Tj ET`,
    );
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color: PdfColor = [0.8, 0.82, 0.86], width = 0.75) {
    this.ops.push(
      `${fmt(width)} w ${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} RG ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`,
    );
  }

  drawRect(x: number, y: number, w: number, h: number, fill: PdfColor, stroke?: PdfColor) {
    const [fr, fg, fb] = fill;
    let op = `${fmt(fr)} ${fmt(fg)} ${fmt(fb)} rg ${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re f`;
    if (stroke) {
      op += ` ${fmt(stroke[0])} ${fmt(stroke[1])} ${fmt(stroke[2])} RG 0.75 w ${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re S`;
    }
    this.ops.push(op);
  }
}

function fmt(n: number): string {
  const s = n.toFixed(2);
  return s.endsWith(".00") ? s.slice(0, -3) : s.replace(/0$/, "");
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export function renderPdf(blocks: PdfBlock[], options: PdfRenderOptions = {}): PdfRenderResult {
  const [pageW, pageH] = PAGE_SIZES[options.pageSize ?? "A4"];
  const margin = options.margin ?? 56;
  const accent = options.accent ?? DEFAULT_ACCENT;
  const contentW = pageW - margin * 2;
  const footerText = options.footer ?? "Generated by Cloudie";
  const bottomLimit = margin + 24;

  const pages: PdfPageBuilder[] = [];
  let page = new PdfPageBuilder();
  pages.push(page);
  let cursorY = pageH - margin;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < bottomLimit) {
      page = new PdfPageBuilder();
      pages.push(page);
      cursorY = pageH - margin;
    }
  };

  const writeLines = (
    lines: string[],
    opts: { size?: number; bold?: boolean; mono?: boolean; color?: PdfColor; lineHeight?: number; align?: "left" | "center" | "right" } = {},
  ) => {
    const size = opts.size ?? 10;
    const lh = opts.lineHeight ?? size * 1.45;
    for (const line of lines) {
      ensureSpace(lh);
      let x = margin;
      if (opts.align === "center") x = margin + (contentW - textWidth(line, size, opts)) / 2;
      if (opts.align === "right") x = margin + contentW - textWidth(line, size, opts);
      page.drawText(line, x, cursorY - size, opts);
      cursorY -= lh;
    }
  };

  const wrapText = (text: string, size: number, bold: boolean, mono: boolean, width: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (textWidth(candidate, size, { bold, mono }) <= width || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  for (const block of blocks) {
    switch (block.kind) {
      case "banner": {
        const h = 34;
        ensureSpace(h + 14);
        const tone: PdfColor =
          block.tone === "accent" ? accent : block.tone === "muted" ? [0.93, 0.94, 0.97] : [0.1, 0.11, 0.15];
        page.drawRect(margin, cursorY - h, contentW, h, tone);
        page.drawText(block.text, margin + 14, cursorY - h + 12, {
          size: 12, bold: true, color: block.tone === "muted" ? [0.2, 0.2, 0.25] : [1, 1, 1],
        });
        cursorY -= h + 16;
        break;
      }
      case "heading": {
        const size = 11;
        const lh = 20;
        ensureSpace(lh + 8);
        cursorY -= 4;
        page.drawText(block.text.toUpperCase(), margin, cursorY - size, { size, bold: true, color: accent });
        cursorY -= lh;
        page.drawLine(margin, cursorY + 4, margin + contentW, cursorY + 4, accent, 1);
        cursorY -= 6;
        break;
      }
      case "text": {
        const size = block.size ?? 10;
        const bold = !!block.bold;
        const mono = !!block.mono;
        const lines = wrapText(block.text, size, bold, mono, contentW);
        writeLines(lines, { size, bold, mono, color: block.color, align: block.align, lineHeight: block.lineHeight ?? size * 1.45 });
        break;
      }
      case "spacer":
        cursorY -= block.height;
        break;
      case "divider":
        ensureSpace(12);
        cursorY -= 5;
        page.drawLine(margin, cursorY, margin + contentW, cursorY);
        cursorY -= 7;
        break;
      case "kv": {
        const size = 10;
        const lh = 17;
        ensureSpace(lh);
        page.drawText(block.label, margin, cursorY - size, { size, color: [0.42, 0.45, 0.5] });
        const valueX = margin + Math.min(contentW * 0.4, 220);
        page.drawText(block.value, valueX, cursorY - size, { size, bold: true });
        cursorY -= lh;
        break;
      }
      case "box": {
        const lh = 17;
        const titleH = block.title ? 20 : 0;
        const boxH = titleH + block.lines.length * lh + 12;
        ensureSpace(boxH + 10);
        const boxTop = cursorY;
        page.drawRect(margin, boxTop - boxH, contentW, boxH, [0.98, 0.985, 1], [0.85, 0.87, 0.92]);
        let innerY = boxTop - (titleH ? 16 : 8);
        if (block.title) {
          page.drawText(block.title, margin + 12, innerY - 10, { size: 10.5, bold: true, color: accent });
          innerY -= 20;
        }
        for (const line of block.lines) {
          page.drawText(line.label, margin + 12, innerY - 10, { size: 9.5, color: [0.42, 0.45, 0.5] });
          page.drawText(line.value, margin + 12 + Math.min(contentW * 0.38, 200), innerY - 10, { size: 9.5, bold: true });
          innerY -= lh;
        }
        cursorY -= boxH + 14;
        break;
      }
      case "table": {
        const size = block.fontSize ?? 9;
        const lh = size * 1.7;
        const nCols = block.headers.length;
        const widths = block.widths && block.widths.length === nCols
          ? normalizeWidths(block.widths)
          : Array(nCols).fill(1 / nCols);
        const colX = widths.map((_, i) => margin + contentW * widths.slice(0, i).reduce((a, b) => a + b, 0));
        const colW = widths.map((w) => contentW * w);

        // Header row
        ensureSpace(lh * 2);
        page.drawRect(margin, cursorY - lh + 3, contentW, lh, [0.93, 0.94, 0.98]);
        for (let i = 0; i < nCols; i++) {
          page.drawText(block.headers[i], colX[i] + 5, cursorY - lh + 9, { size, bold: true });
        }
        cursorY -= lh + 2;

        // Body rows with wrapping
        for (const row of block.rows) {
          const cellLines = row.map((cell, i) => wrapText(String(cell ?? ""), size, false, false, colW[i] - 10));
          const rowCount = Math.max(...cellLines.map((l) => l.length), 1);
          const rowH = lh * rowCount;
          ensureSpace(rowH + 2);
          for (let i = 0; i < nCols; i++) {
            let yy = cursorY - size;
            for (const line of cellLines[i]) {
              page.drawText(line, colX[i] + 5, yy, { size });
              yy -= lh;
            }
          }
          cursorY -= rowH;
          page.drawLine(margin, cursorY + 2, margin + contentW, cursorY + 2, [0.88, 0.9, 0.93], 0.5);
        }
        cursorY -= 8;
        break;
      }
    }
  }

  // Footer on every page
  for (const p of pages) {
    p.drawLine(margin, bottomLimit - 6, margin + contentW, bottomLimit - 6);
    p.drawText(footerText, margin, bottomLimit - 18, { size: 7.5, color: [0.55, 0.57, 0.62] });
    p.drawText(String(pages.indexOf(p) + 1), pageW - margin - 8, bottomLimit - 18, { size: 7.5, color: [0.55, 0.57, 0.62], });
  }

  return assemble(pages, {
    pageW, pageH, margin,
    usedFonts: collectFonts(pages),
    infoTitle: options.title,
  });
}

function normalizeWidths(widths: number[]): number[] {
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  return widths.map((w) => w / total);
}

function collectFonts(pages: PdfPageBuilder[]): Set<string> {
  const set = new Set<string>();
  for (const p of pages) for (const f of p.usedFonts) set.add(f);
  return set;
}

// ─── PDF file assembly ────────────────────────────────────────────────────────

function escapeInfoString(s: string): string {
  return encodePdfText(s);
}

function assemble(
  pages: PdfPageBuilder[],
  ctx: { pageW: number; pageH: number; margin: number; usedFonts: Set<string>; infoTitle?: string },
): PdfRenderResult {
  const pageCount = pages.length;
  const firstPageObj = 3; // 1 catalog, 2 pages tree
  const fontObjStart = firstPageObj + pageCount * 2;

  // Font resource dict shared by all pages
  let fontResources = "<< /Font <<";
  const fontObjNums: Record<string, number> = {};
  let nextFontObj = fontObjStart;
  for (const ref of Array.from(ctx.usedFonts).sort()) {
    fontObjNums[ref] = nextFontObj++;
    fontResources += ` /${ref} ${fontObjNums[ref]} 0 R`;
  }
  fontResources += " >> >>";

  const objects: string[] = [];
  const pushObj = (body: string) => { objects.push(body); return objects.length; };

  // 1: Catalog
  pushObj(`<< /Type /Catalog /Pages 2 0 R >>`);
  // 2: Pages tree
  const kids = pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(" ");
  pushObj(`<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`);

  // Page + content objects
  pages.forEach((p, i) => {
    const contentObjNum = firstPageObj + i * 2 + 1;
    const stream = p.ops.join("\n");
    pushObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ctx.pageW} ${ctx.pageH}] ` +
      `/Resources ${fontResources} /Contents ${contentObjNum} 0 R >>`,
    );
    pushObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  // Font objects
  for (const [ref, base] of Object.entries(STANDARD_FONTS)) {
    if (!(ref in fontObjNums)) continue;
    pushObj(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
  }

  // Info object (last)
  const infoObjNum = objects.length + 1;
  const infoParts = [`<< /Producer (Cloudie Native PDF Engine)`, `/CreationDate (D:${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}Z)`];
  if (ctx.infoTitle) infoParts.push(`/Title (${escapeInfoString(ctx.infoTitle)})`);
  pushObj(infoParts.join(" ") + " >>");

  // Serialize with xref offsets
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((body, idx) => {
    offsets.push(out.length);
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = out.length;
  const size = objects.length + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoObjNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // Latin-1 encode (all chars are <= 0xFF by construction)
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;

  return { bytes, pageCount, sizeBytes: bytes.length };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Validate that bytes are a structurally valid PDF (header + EOF + xref). */
export function isPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 200) return false;
  const head = String.fromCharCode(...bytes.slice(0, 8));
  if (!head.startsWith("%PDF-")) return false;
  const tailStart = Math.max(0, bytes.length - 1024);
  let tail = "";
  for (let i = tailStart; i < bytes.length; i++) tail += String.fromCharCode(bytes[i]);
  if (!tail.includes("%%EOF")) return false;
  if (!tail.includes("startxref")) return false;
  if (!tail.includes("/Root 1 0 R")) return false;
  return true;
}

/** Extract lightweight metadata from rendered bytes (for verification). */
export function pdfStats(bytes: Uint8Array): { pages: number; hasXref: boolean; version: string } {
  let text = "";
  const limit = Math.min(bytes.length, 512 * 1024);
  for (let i = 0; i < limit; i++) text += String.fromCharCode(bytes[i]);
  const pages = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
  return {
    pages,
    hasXref: /xref\n0 \d+/.test(text),
    version: headVersion(text),
  };
}

function headVersion(text: string): string {
  const m = text.match(/^%PDF-(\d\.\d)/);
  return m ? m[1] : "unknown";
}

/** Canonical sample document used by the acceptance test. */
export function buildAcceptanceDocument(input: {
  docTitle: string; docType: string; templateName: string; templateVersion: number;
  ownerName: string; ownerEmail: string; tenantName?: string | null;
  renderedAt: number; pageCountTarget?: number;
}): PdfBlock[] {
  const date = new Date(input.renderedAt).toUTCString();
  return [
    { kind: "banner", text: input.docTitle.toUpperCase(), tone: "dark" },
    { kind: "text", text: `Document type: ${input.docType}`, size: 10, color: [0.4, 0.42, 0.48] },
    { kind: "text", text: `Template: ${input.templateName} (v${input.templateVersion})`, size: 10, color: [0.4, 0.42, 0.48] },
    { kind: "divider" },
    { kind: "heading", text: "Issued to" },
    { kind: "box", lines: [
      { label: "Name", value: input.ownerName },
      { label: "Email", value: input.ownerEmail },
      ...(input.tenantName ? [{ label: "Workspace", value: input.tenantName }] : []),
      { label: "Issued", value: date },
    ] },
    { kind: "heading", text: "Line items" },
    { kind: "table",
      headers: ["Item", "Description", "Qty", "Amount"],
      widths: [2, 4, 1, 1.6],
      rows: [
        ["PLATFORM-01", "Cloudie platform access", "1", "120.00"],
        ["LOGISTICS-02", "Shipment handling", "2", "80.00"],
        ["DOCS-03", "Document generation", "1", "40.00"],
      ],
    },
    { kind: "kv", label: "Total", value: "240.00" },
    { kind: "spacer", height: 10 },
    { kind: "text", text: "This document was generated natively by the Cloudie document engine. " +
      "No third-party document-generation service was used. Validate authenticity by the reference above.", size: 8.5, color: [0.45, 0.47, 0.52] },
  ];
}
