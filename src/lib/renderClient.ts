/**
 * Cloudie client render pipeline.
 *
 * The document engine produces SVG (pure, shared with the server). Here we
 * turn that SVG into the delivered artifacts entirely in the browser:
 *
 *   SVG ──▶ <canvas> ──▶ PNG  (downloadable image)
 *                     └─▶ JPEG ──▶ PDF (via the dependency-free raster writer)
 *
 * Rendering client-side means the live preview and the exported document come
 * from the exact same code path, and the platform needs no native rasterizer.
 * Bytes are then uploaded to Cloudie storage and the server records + charges
 * for the render.
 */

import {
  buildDocumentSvgs,
  svgToDataUrl,
  type BuildSvgOptions,
  type DocumentValues,
  type TemplateConfiguration,
  type TemplateSchema,
} from "./docTemplateEngine";
import { buildRasterPdf } from "./rasterPdf";

export interface RenderArtifacts {
  /** PNG of page 1 — the shareable image artifact. */
  imagePng: Blob;
  /** Multi-page PDF bytes. */
  pdfBytes: Uint8Array;
  pageCount: number;
  sizeBytes: number;
  imageWidth: number;
  imageHeight: number;
}

const JPEG_QUALITY = 0.92;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not rasterize the document preview"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      type,
      quality,
    );
  });
}

async function svgToCanvas(svg: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(svgToDataUrl(svg));
  const width = img.naturalWidth || img.width || 1000;
  const height = img.naturalHeight || img.height || 1000;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot render documents (no 2D canvas)");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Render every page of a template configuration into downloadable artifacts.
 * `options.sensitive` forces the engine's non-removable stamp (server-owned flag —
 * pass the template's sensitivity, never user input).
 */
export async function renderDocumentArtifacts(
  configuration: TemplateConfiguration,
  schema: TemplateSchema,
  values: DocumentValues,
  options: BuildSvgOptions & { title?: string; creationDate?: number } = {},
): Promise<RenderArtifacts> {
  const svgs = buildDocumentSvgs(configuration, schema, values, options);
  if (svgs.length === 0) throw new Error("This template has no pages to render");

  const pages: Array<{ jpeg: Uint8Array; widthPx: number; heightPx: number }> = [];
  const sizes: Array<{ widthPx: number; heightPx: number }> = [];
  let imagePng: Blob | null = null;
  let imageWidth = 0;
  let imageHeight = 0;

  for (let i = 0; i < svgs.length; i++) {
    const canvas = await svgToCanvas(svgs[i]);
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    pages.push({
      jpeg: new Uint8Array(await jpegBlob.arrayBuffer()),
      widthPx: canvas.width,
      heightPx: canvas.height,
    });
    sizes.push({ widthPx: canvas.width, heightPx: canvas.height });
    if (i === 0) {
      imagePng = await canvasToBlob(canvas, "image/png");
      imageWidth = canvas.width;
      imageHeight = canvas.height;
    }
  }

  const pdf = buildRasterPdf(pages, sizes, {
    title: options.title ?? "Document",
    author: "Cloudie",
    subject: "Generated document",
    creationDate: options.creationDate,
  });

  if (!imagePng) throw new Error("Canvas export failed");

  return {
    imagePng,
    pdfBytes: pdf.bytes,
    pageCount: pdf.pageCount,
    sizeBytes: pdf.sizeBytes,
    imageWidth,
    imageHeight,
  };
}

/** Upload one artifact and return its Convex storage id. */
export async function uploadArtifact(uploadUrl: string, blob: Blob): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const json = (await res.json()) as { storageId?: string };
  if (!json.storageId) throw new Error("Upload did not return a storage id");
  return json.storageId;
}

export function newAttemptId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `attempt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Human-readable byte size for UI chrome. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Trigger a browser download for a blob (used for PNG/PDF export). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
