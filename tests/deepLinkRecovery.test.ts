/**
 * Deep-link recovery — the join between `public/404.html` and `src/main.tsx`.
 *
 * WHY THIS EXISTS. Hosts that serve the Vite output without an SPA fallback
 * answer a direct load of `/dashboard` with a static 404 page instead of the
 * app shell. `/` keeps working, so the failure looks like "the dashboard is
 * gone" rather than "the host has no rewrite". `public/404.html` closes that
 * gap by parking the requested path and loading `/`, and `src/main.tsx` replays
 * the parked path before `BrowserRouter` reads `window.location`.
 *
 * The two halves are a join nothing at runtime compares: they agree only on a
 * `sessionStorage` key and on where the parking happens. Rename the key — or
 * move the replay after `createRoot(...).render(...)`, when the router has
 * already resolved `/` — and deep links silently break again with no failing
 * test anywhere. These assertions run the REAL script and the REAL snippet
 * against fake globals, so they fail on behaviour, not on a copy of it.
 *
 * The host itself is left alone: a host that neither rewrites deep links nor
 * serves `404.html` cannot be repaired from this repository, and the deployment
 * configs that do rewrite (`vercel.json`, `deploy/nginx/`) are checked by eye.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const FALLBACK_PATH = "public/404.html";
const ENTRY_PATH = "src/main.tsx";

const fallbackHtml = readFileSync(FALLBACK_PATH, "utf8");
const entrySource = readFileSync(ENTRY_PATH, "utf8");

/** The inline script the static 404 page runs before anything else. */
const fallbackScript = (() => {
  const match = fallbackHtml.match(/<script>([\s\S]*?)<\/script>/);
  if (!match)
    throw new Error(`${FALLBACK_PATH} no longer contains an inline script`);
  return match[1];
})();

/**
 * `restoreDeepLink()` plus the module-scope call that runs it, lifted verbatim
 * out of the real entry file so the test exercises shipped code.
 */
const restoreSource = (() => {
  const marker = "/**\n * Restores a deep link parked by";
  const start = entrySource.indexOf(marker);
  const call = "restoreDeepLink();";
  const end = entrySource.indexOf(call);
  if (start === -1 || end === -1) {
    throw new Error(`${ENTRY_PATH} no longer parks/restores the deep link`);
  }
  return entrySource.slice(start, end + call.length);
})();

const STORAGE_KEY = "cloudie:spa-redirect";

type FakeEnv = {
  store: Record<string, string>;
  location: {
    pathname: string;
    search: string;
    hash: string;
    replaced: string[];
    replace: (url: string) => void;
  };
  history: { replaceState: (...args: unknown[]) => void };
  writes: unknown[][];
  sessionStorage: {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem: (k: string) => void;
  };
};

/** A minimal `location` + `sessionStorage` pair, enough for both halves. */
function makeEnv(
  initialPath: string,
  initialStore: Record<string, string> = {},
): FakeEnv {
  const store: Record<string, string> = { ...initialStore };
  const writes: unknown[][] = [];
  const [withoutHash, hash = ""] = initialPath.split("#");
  const [pathname, query = ""] = withoutHash.split("?");

  const location = {
    pathname,
    search: query ? `?${query}` : "",
    hash: hash ? `#${hash}` : "",
    replaced: [] as string[],
    replace(url: string) {
      this.replaced.push(url);
    },
  };

  return {
    store,
    writes,
    location,
    history: {
      replaceState: (...args: unknown[]) => {
        writes.push(args);
      },
    },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
  };
}

/** Runs the shipped 404 page script. */
function runFallback(env: FakeEnv, sessionStorage = env.sessionStorage) {
  new Function("location", "sessionStorage", fallbackScript)(
    env.location,
    sessionStorage,
  );
}

/** Runs the shipped restore snippet in its own module scope. */
function runRestore(env: FakeEnv, sessionStorage = env.sessionStorage) {
  new Function("window", "sessionStorage", restoreSource)(
    { location: env.location, history: env.history },
    sessionStorage,
  );
}

/** Moves the fake browser to `/`, as the real redirect does. */
function landOnRoot(env: FakeEnv) {
  env.location.pathname = "/";
  env.location.search = "";
  env.location.hash = "";
}

describe("deep-link recovery", () => {
  test("the fallback ships with the build", () => {
    // Vite copies `public/**` to the output root, which is where hosts look for
    // a static 404 page. Without the file, deep links stay broken.
    expect(existsSync(FALLBACK_PATH)).toBe(true);
    expect(fallbackScript.length).toBeGreaterThan(0);
  });

  test("both halves agree on the storage key", () => {
    expect(fallbackHtml).toContain(`setItem("${STORAGE_KEY}"`);
    expect(entrySource).toContain(`getItem("${STORAGE_KEY}"`);
    expect(entrySource).toContain(`removeItem("${STORAGE_KEY}"`);
  });

  test("the replay happens before the router renders", () => {
    // `BrowserRouter` resolves `window.location` when it mounts, so a replay
    // placed after `createRoot(...).render(...)` is too late and silently
    // drops every user back on the landing page.
    const restoreAt = entrySource.indexOf("restoreDeepLink();");
    const renderAt = entrySource.indexOf("createRoot(");
    expect(restoreAt).toBeGreaterThan(-1);
    expect(renderAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeLessThan(renderAt);
  });

  test("a parked /dashboard survives the round trip", () => {
    const env = makeEnv("/dashboard");
    runFallback(env);

    expect(env.store[STORAGE_KEY]).toBe("/dashboard");
    expect(env.location.replaced).toEqual(["/"]);
    expect(env.writes).toHaveLength(0);

    landOnRoot(env);
    runRestore(env);

    expect(env.writes).toEqual([[null, "", "/dashboard"]]);
    expect(env.store[STORAGE_KEY]).toBeUndefined();
  });

  test("query and hash survive the round trip", () => {
    const env = makeEnv("/site/acme/banking?tab=cards#kyc");
    runFallback(env);
    landOnRoot(env);
    runRestore(env);

    expect(env.writes).toEqual([
      [null, "", "/site/acme/banking?tab=cards#kyc"],
    ]);
  });

  test("a normal load is left alone", () => {
    const env = makeEnv("/");
    runRestore(env);
    expect(env.writes).toHaveLength(0);
  });

  test("off-site targets are refused", () => {
    for (const hostile of [
      "https://evil.example.com/steal",
      "//evil.example.com",
    ]) {
      const env = makeEnv("/", { [STORAGE_KEY]: hostile });
      runRestore(env);
      expect(env.writes).toHaveLength(0);
    }
  });

  test("blocked storage still loads the app", () => {
    const env = makeEnv("/dashboard");
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(() => runFallback(env, blocked)).not.toThrow();
    expect(env.location.replaced).toEqual(["/"]);
    expect(() => runRestore(env, blocked)).not.toThrow();
    expect(env.writes).toHaveLength(0);
  });
});
