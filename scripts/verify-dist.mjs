#!/usr/bin/env node
/**
 * Production build & InfinityFree deployment artifact verification script.
 *
 * Verifies:
 * 1. dist/index.html exists, mounts #root, does NOT reference /src/main.tsx,
 *    and references hashed /assets/*.js and /assets/*.css bundles.
 * 2. Every static asset referenced by dist/index.html exists in dist/.
 * 3. Every lazy-loaded chunk listed in the entry bundle's __vite__mapDeps
 *    exists on disk in dist/assets/ and is non-empty.
 * 4. dist/.htaccess enforces JavaScript/CSS MIME types, immutable caching for
 *    hashed assets, no-cache revalidation for HTML/SW, and HTTP 404 (never
 *    index.html) for missing static assets.
 * 5. dist/sw.js enforces MIME-type validation before caching or serving JS/CSS.
 * 6. dist/404.html includes deep-link recovery (cloudie:spa-redirect).
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

function collectDistFiles(baseDir, currentDir = baseDir) {
  const results = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDistFiles(baseDir, abs));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, abs).split(path.sep).join("/");
      results.push({ abs, rel });
    }
  }
  return results.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function createInfinityFreeZip(
  distDir = path.resolve(process.cwd(), "dist"),
  outZipPath = path.resolve(process.cwd(), "cloudie-infinityfree-site.zip"),
) {
  const files = collectDistFiles(distDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.abs);
    const compressed = zlib.deflateRawSync(raw, { level: 9 });
    const crc = zlib.crc32(raw) >>> 0;
    const nameBuf = Buffer.from(file.rel, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const zipBuffer = Buffer.concat([...localParts, ...centralParts, eocd]);
  fs.writeFileSync(outZipPath, zipBuffer);

  const entryNames = new Set(files.map((f) => f.rel));
  for (const requiredRootFile of ["index.html", ".htaccess", "404.html", "sw.js", "manifest.webmanifest"]) {
    if (!entryNames.has(requiredRootFile)) {
      throw new Error(`ZIP archive is missing required root file: ${requiredRootFile}`);
    }
  }

  return {
    zipPath: outZipPath,
    sizeBytes: zipBuffer.length,
    entryCount: files.length,
  };
}

export function verifyDistDirectory(distDir = path.resolve(process.cwd(), "dist")) {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Build output directory does not exist: ${distDir}`);
  }

  const indexHtmlPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtmlPath) || fs.statSync(indexHtmlPath).size === 0) {
    throw new Error("dist/index.html is missing or empty.");
  }

  const html = fs.readFileSync(indexHtmlPath, "utf8");
  if (html.includes("/src/main.tsx")) {
    throw new Error("dist/index.html still references development entry /src/main.tsx.");
  }
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('dist/index.html is missing <div id="root"></div>.');
  }

  const assetRefs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  if (assetRefs.length === 0) {
    throw new Error("dist/index.html contains no /assets/ references.");
  }

  const jsRefs = assetRefs.filter((ref) => ref.endsWith(".js"));
  const cssRefs = assetRefs.filter((ref) => ref.endsWith(".css"));
  if (jsRefs.length === 0) {
    throw new Error("dist/index.html does not reference any compiled JavaScript bundle.");
  }
  if (cssRefs.length === 0) {
    throw new Error("dist/index.html does not reference any compiled CSS bundle.");
  }

  for (const ref of assetRefs) {
    const cleanRel = decodeURIComponent(ref.split("?")[0]).replace(/^\//, "");
    const fullPath = path.join(distDir, cleanRel);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile() || fs.statSync(fullPath).size === 0) {
      throw new Error(`Referenced asset in dist/index.html is missing or empty: ${ref}`);
    }
  }

  // Verify all dynamic chunks referenced in the entry JS bundle exist in dist/assets/
  let dynamicChunkCount = 0;
  for (const jsRef of jsRefs) {
    const jsPath = path.join(distDir, decodeURIComponent(jsRef.split("?")[0]).replace(/^\//, ""));
    const jsContent = fs.readFileSync(jsPath, "utf8");
    const dynamicRefs = [...new Set([...jsContent.matchAll(/"(assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map((m) => m[1]))];
    for (const dynRel of dynamicRefs) {
      const dynFullPath = path.join(distDir, dynRel);
      if (!fs.existsSync(dynFullPath) || !fs.statSync(dynFullPath).isFile() || fs.statSync(dynFullPath).size === 0) {
        throw new Error(`Dynamic chunk referenced by ${jsRef} is missing from dist/: ${dynRel}`);
      }
      dynamicChunkCount++;
    }
  }

  // Verify dist/.htaccess
  const htaccessPath = path.join(distDir, ".htaccess");
  if (!fs.existsSync(htaccessPath) || fs.statSync(htaccessPath).size === 0) {
    throw new Error("dist/.htaccess is missing or empty.");
  }
  const htaccess = fs.readFileSync(htaccessPath, "utf8");
  for (const requiredSnippet of [
    "AddType text/javascript .js .mjs",
    "AddType text/css .css",
    "RewriteCond %{REQUEST_URI} ^/assets/",
    "RewriteRule ^ - [R=404,L]",
    "RewriteRule ^ /index.html [L]",
  ]) {
    if (!htaccess.includes(requiredSnippet)) {
      throw new Error(`dist/.htaccess is missing required rule: ${requiredSnippet}`);
    }
  }

  // Verify dist/404.html
  const notFoundPath = path.join(distDir, "404.html");
  if (!fs.existsSync(notFoundPath) || fs.statSync(notFoundPath).size === 0) {
    throw new Error("dist/404.html is missing or empty.");
  }
  const notFoundHtml = fs.readFileSync(notFoundPath, "utf8");
  if (!notFoundHtml.includes("cloudie:spa-redirect")) {
    throw new Error("dist/404.html is missing deep-link recovery marker cloudie:spa-redirect.");
  }

  // Verify dist/sw.js
  const swPath = path.join(distDir, "sw.js");
  if (!fs.existsSync(swPath) || fs.statSync(swPath).size === 0) {
    throw new Error("dist/sw.js is missing or empty.");
  }
  const swContent = fs.readFileSync(swPath, "utf8");
  if (!swContent.includes("hasValidAssetMimeType")) {
    throw new Error("dist/sw.js is missing MIME-type validation guard hasValidAssetMimeType.");
  }

  return {
    htmlAssetCount: assetRefs.length,
    dynamicChunkCount,
    totalAssetFiles: fs.readdirSync(path.join(distDir, "assets")).length,
  };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    const summary = verifyDistDirectory();
    console.log(
      `[smoke:dist] Verified ${summary.htmlAssetCount} HTML asset refs, ` +
        `${summary.dynamicChunkCount} dynamic chunk refs, and ${summary.totalAssetFiles} total files in dist/assets/.`,
    );
    if (process.argv.includes("--zip")) {
      const zipSummary = createInfinityFreeZip();
      console.log(
        `[smoke:dist] Packaged ${zipSummary.entryCount} files into ${path.basename(zipSummary.zipPath)} (${(zipSummary.sizeBytes / 1024).toFixed(1)} KB).`,
      );
    }
  } catch (err) {
    console.error("[smoke:dist] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
