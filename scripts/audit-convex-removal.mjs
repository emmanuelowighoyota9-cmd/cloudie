#!/usr/bin/env node
/**
 * Convex removal gate.
 *
 * Default mode is an inventory-only audit during migration. Pass --strict to
 * fail if runtime source, package manifests, or CI/deployment workflows still
 * reference Convex. The strict gate is intended for the final cutover.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const roots = ["src", "api/src", "scripts", ".github/workflows"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".sh"]);
const pattern = /convex|VITE_CONVEX_URL|CONVEX_DEPLOYMENT/i;
const matches = [];

async function walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("." ) && entry.name !== ".github") continue;
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
    } else if (extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      const content = await readFile(absolute, "utf8");
      const lines = content.split(/\r?\n/);
      const hits = lines.flatMap((line, index) => pattern.test(line) ? [{ line: index + 1, text: line.trim().slice(0, 180) }] : []);
      if (hits.length) matches.push({ path: relative(root, absolute), hits });
    }
  }
}

for (const path of roots) await walk(join(root, path));
for (const path of ["package.json", "package-lock.json", "bun.lockb", "bun.lock"]) {
  try {
    const content = await readFile(join(root, path), "utf8");
    const lines = content.split(/\r?\n/);
    const hits = lines.flatMap((line, index) => pattern.test(line) ? [{ line: index + 1, text: line.trim().slice(0, 180) }] : []);
    if (hits.length) matches.push({ path, hits });
  } catch {}
}

const total = matches.reduce((sum, item) => sum + item.hits.length, 0);
console.log(`Convex removal audit: ${total} matching line(s) across ${matches.length} file(s).`);
for (const item of matches) {
  console.log(`\n${item.path}`);
  for (const hit of item.hits) console.log(`  ${hit.line}: ${hit.text}`);
}
if (strict && total > 0) {
  console.error("\nFAIL: Convex references remain. Do not declare full removal.");
  process.exitCode = 1;
} else if (strict) {
  console.log("\nPASS: no Convex references found in audited source/manifests/workflows.");
} else {
  console.log("\nInventory mode only; this does not certify that Convex has been removed.");
}
