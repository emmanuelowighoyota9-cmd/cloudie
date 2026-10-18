#!/usr/bin/env node
/**
 * Convex removal gate.
 *
 * Default mode inventories active imports/configuration during migration.
 * Pass --strict to fail if runtime source, manifests, or workflows still
 * reference Convex. Documentation and this script's explanatory text are
 * intentionally excluded from the strict source scan.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const roots = ["src", "api/src", ".github/workflows"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".sh"]);
const pattern = /(?:from\s+["'][^"']*convex|import\s*\(["'][^"']*convex|require\(["'][^"']*convex|VITE_CONVEX_URL|CONVEX_DEPLOYMENT|npx\s+convex|@convex-dev\/auth|["']convex["']|convex-test)/i;
const matches = [];

async function walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
    } else if (extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      const content = await readFile(absolute, "utf8");
      const lines = content.split(/\r?\n/);
      const hits = lines.flatMap((line, index) => pattern.test(line)
        ? [{ line: index + 1, text: line.trim().slice(0, 180) }]
        : []);
      if (hits.length) matches.push({ path: relative(root, absolute), hits });
    }
  }
}

for (const path of roots) await walk(join(root, path));

try {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  for (const section of ["dependencies", "devDependencies"]) {
    for (const name of ["convex", "convex-test", "@convex-dev/auth"]) {
      if (pkg[section]?.[name]) {
        matches.push({ path: "package.json", hits: [{ line: 1, text: section + " dependency remains: " + name }] });
      }
    }
  }
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (/convex/i.test(name + " " + command)) {
      matches.push({ path: "package.json", hits: [{ line: 1, text: "Convex script remains: " + name }] });
    }
  }
} catch {}

try {
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  const rootDeps = {
    ...(lock.packages?.[""]?.dependencies ?? {}),
    ...(lock.packages?.[""]?.devDependencies ?? {}),
  };
  for (const name of ["convex", "convex-test", "@convex-dev/auth"]) {
    if (rootDeps[name]) {
      matches.push({ path: "package-lock.json", hits: [{ line: 1, text: "locked root dependency remains: " + name }] });
    }
  }
  for (const name of Object.keys(lock.packages ?? {})) {
    if (/^node_modules\/(?:convex|convex-test|@convex-dev\/auth)$/.test(name) && !rootDeps[name.replace(/^node_modules\//, "")]) {
      matches.push({ path: "package-lock.json", hits: [{ line: 1, text: "locked package remains: " + name }] });
    }
  }
} catch {}

const total = matches.reduce((sum, item) => sum + item.hits.length, 0);
console.log("Convex removal audit: " + total + " active reference(s) across " + matches.length + " file(s).");
for (const item of matches) {
  console.log("\n" + item.path);
  for (const hit of item.hits) console.log("  " + hit.line + ": " + hit.text);
}
if (strict && total > 0) {
  console.error("\nFAIL: Convex references remain. Do not declare full removal.");
  process.exitCode = 1;
} else if (strict) {
  console.log("\nPASS: no Convex references found in audited source/manifests/workflows.");
} else {
  console.log("\nInventory mode only; this does not certify that Convex has been removed.");
}
