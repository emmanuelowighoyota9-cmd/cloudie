/**
 * The join between the published-site smoke test and the app it checks.
 *
 * `scripts/smoke-live.mjs` runs against a live host, so the suite deliberately
 * does not run it: a network test inside `bun test` would fail wherever the
 * network is closed and hide real failures behind connection errors. What is
 * pinned here is everything that can be wrong *locally* about that check.
 *
 *   - every deep link it probes is a route `src/main.tsx` actually declares, so
 *     a renamed route cannot leave the list quietly probing a path the wildcard
 *     rewrite would answer anyway (that masked case is the whole reason the
 *     check exists);
 *   - the classifier — the part that decides pass/fail — is exercised on
 *     responses: a host 404 page and a 200 that is not the app must fail, the
 *     app shell must pass, and the `404.html` recovery page must pass with its
 *     own mechanism so "works, but only via the fallback" stays visible.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEEP_LINKS,
  PARAMETERISED_LINKS,
  STATIC_ASSETS,
  classifyShell,
} from "../scripts/smoke-live.mjs";

const router = readFileSync("src/main.tsx", "utf8");

const SHELL = {
  status: 200,
  contentType: "text/html; charset=utf-8",
  body: '<!doctype html><html><body><div id="root"></div></body></html>',
};

describe("published-site smoke test", () => {
  test("every probed deep link is a route the router serves", () => {
    expect(DEEP_LINKS).toContain("/dashboard");
    for (const path of DEEP_LINKS) {
      expect(router).toContain(`path="${path}"`);
    }
  });

  test("parameterised probes map to a declared router pattern", () => {
    expect(PARAMETERISED_LINKS.length).toBeGreaterThan(0);
    for (const { route } of PARAMETERISED_LINKS) {
      expect(router).toContain(`path="${route}"`);
    }
  });

  test("the recovery page is probed too", () => {
    expect(STATIC_ASSETS.map((asset) => asset.url)).toContain("/404.html");
  });

  test("a host 404 page fails", () => {
    const result = classifyShell({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "The page could not be found\n\nNOT_FOUND\n\niad1::abc",
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("HTTP 404");
  });

  test("a 200 that is not the app fails", () => {
    for (const body of [
      "<!doctype html><html><body><h1>Maintenance</h1></body></html>",
      "<!doctype html><html><body>NOT_FOUND</body></html>",
    ]) {
      const result = classifyShell({ ...SHELL, body });
      expect(result.ok).toBe(false);
      expect(result.mechanism).toBe("error");
    }
  });

  test("a wrong content type fails even when the shell is inside", () => {
    const result = classifyShell({ ...SHELL, contentType: "text/plain" });
    expect(result.ok).toBe(false);
  });

  test("the app shell passes", () => {
    const result = classifyShell(SHELL);
    expect(result.ok).toBe(true);
    expect(result.mechanism).toBe("rewrite");
  });

  test("the 404.html recovery page passes on its own mechanism", () => {
    const result = classifyShell({
      status: 404,
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><script>sessionStorage.setItem("cloudie:spa-redirect", "/dashboard")</script>',
    });
    expect(result.ok).toBe(true);
    expect(result.mechanism).toBe("recovery-page");
  });
});
