#!/usr/bin/env node
/**
 * Published-site smoke test.
 *
 * WHY THIS EXISTS. `/dashboard` and its siblings are client-side routes: they
 * only work because the host hands unknown paths to the app shell (Apache
 * rewrite rules in `public/.htaccess`) or because `dist/404.html` parks the path and
 * `src/main.tsx` replays it. Break either half and `/` keeps working while every
 * deep link answers with the host's own 404 — which is exactly how the outage
 * looked in production. Nothing in the repo could catch it, because the repo was
 * correct and the *deployment* was stale.
 *
 * Run it after publishing:
 *   npm run smoke:live                        # default production URL
 *   npm run smoke:live -- https://example.com # any host
 *
 * Read-only GETs. No credentials, no writes, nothing that mutates data.
 */
import { pathToFileURL } from "node:url";

const DEFAULT_BASE = "https://cloudie.wuaze.com";
const TIMEOUT_MS = 20_000;
const SHELL_MARKER = '<div id="root">';
const RECOVERY_MARKER = "cloudie:spa-redirect";
const HOST_404_MARKERS = ["The page could not be found", "NOT_FOUND"];

/** Deep links whose path is served literally by `src/main.tsx`. */
export const DEEP_LINKS = [
  "/",
  "/auth",
  "/dashboard",
  "/vtu/airtime",
  "/marketplace",
  "/tracking",
  "/admin",
];

/**
 * Deep links that exercise a router pattern rather than a literal path. The
 * `route` value is the pattern the router must declare for the URL to render.
 */
export const PARAMETERISED_LINKS = [
  { url: "/site/demo/banking", route: "/site/:siteId/banking" },
  { url: "/d/demo-slug", route: "/d/:slug" },
];

/** Files that are served verbatim and must not be swallowed by the rewrite. */
export const STATIC_ASSETS = [
  { url: "/manifest.webmanifest", expectMarker: "name" },
  { url: "/sw.js", expectMarker: "CACHE_VERSION" },
  { url: "/404.html", expectMarker: RECOVERY_MARKER },
];

/**
 * Decides whether a response is the app shell, the recovery page, or a failure.
 *
 * The recovery page counts as a pass on purpose: a host without rewrite support
 * answers with `dist/404.html` (HTTP 404) and the browser still lands in the app.
 * The reported mechanism tells the two apart, because "works, but only via the
 * fallback" is worth knowing.
 */
export function classifyShell({ status, contentType, body }) {
  const isHtml = /text\/html/i.test(contentType ?? "");
  const text = body ?? "";

  if (isHtml && text.includes(RECOVERY_MARKER)) {
    return {
      ok: true,
      mechanism: "recovery-page",
      detail: `served 404.html (HTTP ${status})`,
    };
  }
  if (status !== 200) {
    return { ok: false, mechanism: "error", detail: `HTTP ${status}` };
  }
  if (!isHtml) {
    return {
      ok: false,
      mechanism: "error",
      detail: `content-type ${contentType}`,
    };
  }
  const hostMarker = HOST_404_MARKERS.find((marker) => text.includes(marker));
  if (hostMarker) {
    return {
      ok: false,
      mechanism: "error",
      detail: `host 404 page (matched "${hostMarker}")`,
    };
  }
  if (!text.includes(SHELL_MARKER)) {
    return {
      ok: false,
      mechanism: "error",
      detail: "no app mount point in the response",
    };
  }
  return { ok: true, mechanism: "rewrite", detail: "app shell (HTTP 200)" };
}

async function fetchResponse(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

async function checkDeepLink(base, path) {
  try {
    const result = classifyShell(await fetchResponse(base + path));
    return { path, ...result };
  } catch (error) {
    return {
      path,
      ok: false,
      mechanism: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkStaticAsset(base, { url, expectMarker }) {
  try {
    const { status, body } = await fetchResponse(base + url);
    if (status !== 200) {
      return {
        path: url,
        ok: false,
        mechanism: "error",
        detail: `HTTP ${status}`,
      };
    }
    if (!body.includes(expectMarker)) {
      return {
        path: url,
        ok: false,
        mechanism: "error",
        detail: `served something else — no "${expectMarker}"`,
      };
    }
    return { path: url, ok: true, mechanism: "static", detail: "served as-is" };
  } catch (error) {
    return {
      path: url,
      ok: false,
      mechanism: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const base = (process.argv[2] ?? DEFAULT_BASE).replace(/\/$/, "");
  const targets = [
    ...DEEP_LINKS,
    ...PARAMETERISED_LINKS.map((entry) => entry.url),
    ...STATIC_ASSETS.map((entry) => entry.url),
  ];
  console.log(`smoke:live → ${base} (${targets.length} checks)\n`);

  const checks = [
    ...(await Promise.all(DEEP_LINKS.map((path) => checkDeepLink(base, path)))),
    ...(await Promise.all(
      PARAMETERISED_LINKS.map((entry) => checkDeepLink(base, entry.url)),
    )),
    ...(await Promise.all(
      STATIC_ASSETS.map((asset) => checkStaticAsset(base, asset)),
    )),
  ];

  for (const check of checks) {
    const mark = check.ok ? "pass" : "FAIL";
    const note =
      check.ok && check.mechanism === "recovery-page"
        ? " (no rewrite on this host — the browser recovers via 404.html)"
        : "";
    console.log(`${mark}  ${check.path.padEnd(22)} ${check.detail}${note}`);
  }

  const failures = checks.filter((check) => !check.ok);
  const mechanisms = new Set(
    checks.filter((check) => check.ok).map((check) => check.mechanism),
  );
  console.log(
    `\n${checks.length - failures.length}/${checks.length} passed` +
      (mechanisms.has("recovery-page")
        ? " — deep links pass through the 404.html fallback; add a rewrite to serve them with HTTP 200."
        : ""),
  );

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} deep link(s) are not reaching the app.`,
    );
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
