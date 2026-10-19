/*
 * Cloudie service worker.
 *
 * Responsibilities:
 *  - App-shell offline fallback for navigations.
 *  - Cache-first static asset caching (JS/CSS/images/fonts) with background refresh.
 *
 * Hard rules (see Cloudie security spec):
 *  - NEVER cache API or realtime traffic. Convex serves data over a different
 *    origin (wss/https to *.convex.cloud) and is explicitly skipped below.
 *  - NEVER cache non-GET requests or range/partial responses.
 *  - Never cache authenticated JSON responses that could leak between accounts.
 */
const CACHE_VERSION = "cloudie-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/logo.svg",
  "/app-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable();
      }
      await self.clients.claim();
    })(),
  );
});

/** Only same-origin, static, GET requests (excluding sw.js) are ever cached. */
function isCacheableAsset(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/sw.js") return false;
  if (url.pathname.startsWith("/api/")) return false;
  // Convex HTTP / auth routes must always hit the network.
  if (url.pathname.startsWith("/.well-known/")) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(
      url.pathname,
    )
  );
}

/**
 * Prevent SPA HTML fallbacks or error pages from ever being cached or served
 * as JavaScript or CSS modules (which triggers "'text/html' is not a valid
 * JavaScript MIME type").
 */
function hasValidAssetMimeType(url, response) {
  if (!response || !response.ok) return false;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) return false;
  if (/\.(?:js|mjs)$/i.test(url.pathname)) {
    return contentType.includes("javascript") || contentType.includes("ecmascript");
  }
  if (/\.css$/i.test(url.pathname)) {
    return contentType.includes("text/css");
  }
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept cross-origin traffic (API, Convex data, auth) or non-GET.
  if (url.origin !== self.location.origin || request.method !== "GET") return;

  // Navigations: network first (bypassing stale HTTP cache), then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (!isCacheableAsset(request, url)) return;

  // Static assets: stale-while-revalidate with strict MIME-type verification.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      const validCached = cached && hasValidAssetMimeType(url, cached) ? cached : null;
      if (cached && !validCached) {
        await cache.delete(request).catch(() => undefined);
      }

      const network = fetch(request)
        .then((response) => {
          if (
            response &&
            response.ok &&
            response.type === "basic" &&
            hasValidAssetMimeType(url, response)
          ) {
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        })
        .catch(() => undefined);

      return validCached ?? (await network) ?? Response.error();
    })(),
  );
});

// Allow the page to trigger an immediate update after a deploy.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
