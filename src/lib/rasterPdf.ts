/**
 * Raster PDF assembly — pure TypeScript, no dependencies.
 *
 * Builds a valid PDF 1.4 file where every page is a single high-resolution
 * JPEG rendered from the template engine's SVG (via sharp in the Node action).
 * JPEG bytes are embedded verbatim with /DCTDecode, so no image codec is
 * needed here. Offsets are computed on raw bytes (not string length) so the
 * xref table stays correct with binary payloads.
 *
 * Deterministic: identical inputs (including `creationDate`) produce
 * byte-identical output — no clocks, no randomness.
 */

export interface RasterPage {
  jpeg: Uint8Array;
  /** Intrinsic pixel size of the JPEG (used for ColorSpace sanity only). */
  widthPx: number;
  heightPx: number;
}

export interface RasterPdfOptions {
  title?: string;
  author?: string;
  subject?: string;
  /** PDF date string source; pass the document's createdAt for determinism. */
  creationDate?: number;
}

export interface RasterPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  sizeBytes: number;
}

/** Points (1/72in) per CSS pixel at 96dpi — A4 @96dpi 794px → 595.2pt. */
export const PX_TO_PT = 72 / 96;

function pdfDate(ts?: number): string {
  const d = ts === undefined ? new Date(0) : new Date(ts);
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  // eslint-disable-next-line prefer-template
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** PDF string literal escaping (\\, (, )). Latin-1 only — non-ASCII → '?'. */
function escapePdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (code < 32 || code > 255) out += "?";
    else out += ch;
  }
  return out;
}

const encoder = new TextEncoder();

/**
 * Assemble a PDF. `pageWidthPx`/`pageHeightPx` are the SOURCE SVG pixel
 * dimensions; the PDF page is those pixels converted to points, and the JPEG
 * is drawn edge-to-edge (the raster already carries the exact composition).
 */
export function buildRasterPdf(
  pages: RasterPage[],
  pageSizes: Array<{ widthPx: number; heightPx: number }>,
  options: RasterPdfOptions = {},
): RasterPdfResult {
  if (pages.length === 0) throw new Error("buildRasterPdf: no pages");
  if (pages.length !== pageSizes.length) throw new Error("buildRasterPdf: page count mismatch");

  // Object plan: 1=Catalog, 2=Pages, 3=Info, then per page i:
  //   base+0 = Page, base+1 = Contents, base+2 = Image XObject
  const n = pages.length;
  const objCount = 3 + n * 3;
  const objects: Array<{ id: number; body: Uint8Array }> = [];
  const childIds: number[] = [];

  const pageW = (i: number) => pageSizes[i].widthPx * PX_TO_PT;
  const pageH = (i: number) => pageSizes[i].heightPx * PX_TO_PT;

  for (let i = 0; i < n; i++) {
    const base = 4 + i * 3;
    childIds.push(base);
    const w = pageW(i).toFixed(2);
    const h = pageH(i).toFixed(2);
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
    objects.push({
      id: base,
      body: encoder.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i + 1} ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`,
      ),
    });
    objects.push({ id: base + 1, body: encoder.encode(`<< /Length ${content.length} >>\nstream\n${content}endstream`) });
    const img = pages[i];
    const head = encoder.encode(
      `<< /Type /XObject /Subtype /Image /Width ${img.widthPx} /Height ${img.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.byteLength} >>\nstream\n`,
    );
    const tail = encoder.encode("\nendstream");
    // Image object body mixes text + binary: assemble as one buffer.
    const body = new Uint8Array(head.byteLength + img.jpeg.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(img.jpeg, head.byteLength);
    body.set(tail, head.byteLength + img.jpeg.byteLength);
    objects.push({ id: base + 2, body });
  }

  objects.unshift({
    id: 1,
    body: encoder.encode(`<< /Type /Catalog /Pages 2 0 R >>`),
  });
  objects.unshift({
    id: 2,
    body: encoder.encode(
      `<< /Type /Pages /Count ${n} /Kids [${childIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    ),
  });
  objects.unshift({
    id: 3,
    body: encoder.encode(
      `<< /Title (${escapePdfText(options.title ?? "Document")}) /Author (${escapePdfText(options.author ?? "Cloudie")}) /Subject (${escapePdfText(options.subject ?? "Generated document")}) /Producer (${escapePdfText("Cloudie Document Engine")}) /CreationDate (${pdfDate(options.creationDate)}) >>`,
    ),
  });
  // objects array order is now [3=Info, 2=Pages, 1=Catalog, ...pages] — emit by id.
  const byId = new Map(objects.map((o) => [o.id, o]));

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const pushChunk = (c: Uint8Array) => {
    chunks.push(c);
    offset += c.byteLength;
  };
  const pushStr = (s: string) => pushChunk(encoder.encode(s));

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // NOTE: the header comment must be binary-ish; TextEncoder turns >127 into
  // multi-byte UTF-8 which is still valid PDF comment content, but use raw:
  chunks.pop();
  offset = chunks.reduce((s, c) => s + c.byteLength, 0);
  pushChunk(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const xrefOffsets: number[] = [];
  for (let id = 1; id <= objCount; id++) {
    const obj = byId.get(id);
    if (!obj) throw new Error(`buildRasterPdf: missing object ${id}`);
    xrefOffsets[id] = offset;
    pushStr(`${id} 0 obj\n`);
    pushChunk(obj.body);
    pushStr("\nendobj\n");
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objCount; id++) {
    xref += `${String(xrefOffsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return { bytes: out, pageCount: n, sizeBytes: total };
}
