import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";

const root = process.cwd();

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

test("marketplace source keeps NGN and points on separate lines", () => {
  const directories = [
    join(root, "src/pages/marketplace"),
    join(root, "src/features/marketplace"),
  ];
  const violations = directories.flatMap((directory) => sourceFiles(directory)).flatMap((file) =>
    readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, index) =>
      line.includes("₦") && /point/i.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
    ),
  );
  assert.deepEqual(violations, [], `NGN and points appeared on the same source line:\n${violations.join("\n")}`);
});
