import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Navigation between the customer VTU pages.
 *
 * These are SOURCE-level assertions, deliberately. The property being pinned
 * is a join between two files that live in different layers: the nav declares
 * a set of destinations, and `main.tsx` declares which paths actually resolve.
 * Nothing at runtime compares them, so a renamed or mistyped destination
 * renders a tab that silently 404s, and no other test in the suite would
 * notice — the purchase tests drive the actions, not the links.
 *
 * The other half of the join is coverage: a VTU page that forgot to render
 * `VtuNav` is reachable but has no way to reach its siblings, which is the
 * exact complaint this nav was added to answer.
 */

const router = readFileSync("src/main.tsx", "utf8");
const nav = readFileSync("src/components/vtu/shared.tsx", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");

const QUOTE = String.fromCharCode(34);

/** Every customer-facing VTU route the router serves. */
const VTU_ROUTES = ["/vtu", "/vtu/airtime", "/vtu/bills", "/vtu/history"];

/** Destinations the nav offers, read out of its source. */
function navDestinations(): string[] {
  const marker = "to: " + QUOTE;
  const found: string[] = [];
  let at = nav.indexOf(marker);
  while (at !== -1) {
    const start = at + marker.length;
    const end = nav.indexOf(QUOTE, start);
    if (end === -1) break;
    const value = nav.slice(start, end);
    if (value.startsWith("/vtu")) found.push(value);
    at = nav.indexOf(marker, end);
  }
  return found;
}

/** The customer pages that are expected to carry the nav. */
const VTU_PAGES = [
  "src/pages/VtuCatalog.tsx",
  "src/pages/VtuAirtime.tsx",
  "src/pages/VtuBills.tsx",
  "src/pages/VtuHistory.tsx",
];

describe("VTU nav destinations are real routes", () => {
  test("every destination the nav offers is a route the router serves", () => {
    // A tab pointing at an unrouted path renders fine and 404s on click. The
    // join between these two files exists nowhere else, so it is checked here.
    const destinations = navDestinations();
    expect(destinations.length).toBeGreaterThan(0);
    for (const to of destinations) {
      expect(router).toContain("path=" + QUOTE + to + QUOTE);
    }
  });

  test("every customer VTU route is reachable from the nav", () => {
    // The other direction: a page the nav forgets is an island. Before this,
    // airtime and history were reachable only by going back to the catalogue
    // first and choosing again.
    const destinations = navDestinations();
    for (const route of VTU_ROUTES) {
      expect(destinations).toContain(route);
    }
  });

  test("the nav carries no duplicate destination", () => {
    const destinations = navDestinations();
    expect(new Set(destinations).size).toBe(destinations.length);
  });
});

describe("every VTU page renders the nav", () => {
  for (const page of VTU_PAGES) {
    test(page + " includes the nav and imports it", () => {
      const source = readFileSync(page, "utf8");
      expect(source).toContain("<VtuNav");
      // The usage alone is not enough: a missing import fails the build rather
      // than the nav being silently absent, and both facts matter separately.
      expect(source).toContain("VtuNav,");
      expect(source).toContain("@/components/vtu/shared");
    });
  }
});

describe("the nav sits in the same place on every page", () => {
  /**
   * The nav is the first child of every VTU page, so its vertical position IS
   * the page's top padding. A page that opted out of the shared container
   * renders the same tab row ~40px higher, and clicking a tab then appears to
   * shift the page under you — which reads as the nav being broken.
   *
   * Read off the CONTAINER element rather than searched for as free text: a
   * prose comment mentioning the padding would otherwise satisfy the assertion
   * on its own, which is exactly the kind of test that passes while the page is
   * wrong. Stripping comments first also keeps this honest.
   */
  function containerClass(page: string): string {
    const source = readFileSync(page, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const match = source.match(/className="([^"]*mx-auto w-full max-w-[^"]*)"/);
    if (!match) throw new Error("no page container found in " + page);
    return match[1];
  }

  test("all four VTU pages share the same vertical padding", () => {
    const paddings = new Set<string>();
    for (const page of VTU_PAGES) {
      const classes = containerClass(page);
      expect(classes).toContain("py-10");
      paddings.add(classes.match(/py-10[^"]*/)?.[0] ?? "none");
    }
    // One distinct value across four pages, so they cannot drift apart.
    expect(paddings.size).toBe(1);
  });
});

describe("the sidebar agrees with the nav", () => {
  test("the sidebar keeps a single VTU entry rather than duplicating the nav", () => {
    // Two entries for the same section ("Airtime & Data" and "VTU History")
    // disagreed with the in-page nav about where you are, which is why the
    // history entry was dropped: the nav is the source of truth.
    expect(sidebar).toContain(
      '{ label: ' + QUOTE + 'Airtime & Data' + QUOTE + ', icon: Zap, to: ' + QUOTE + '/vtu' + QUOTE + ' }',
    );
    expect(sidebar).not.toContain("to: " + QUOTE + "/vtu/history" + QUOTE);
  });

  test("the sidebar matches /vtu by PREFIX, not exactly", () => {
    // Exact matching left /vtu/airtime and /vtu/bills with no highlighted
    // sidebar entry at all, because neither equals "/vtu" nor starts with
    // "/vtu/history". `/dashboard` keeps exact matching, since it is not a
    // route prefix for anything else.
    expect(sidebar).not.toContain('path === ' + QUOTE + '/vtu' + QUOTE);
    expect(sidebar).toContain('if (path === ' + QUOTE + '/dashboard' + QUOTE + ')');
    expect(sidebar).toContain("location.pathname.startsWith(path)");
  });
});

describe("the nav is accessible", () => {
  test("it is a labelled nav with the current page announced", () => {
    // The highlight alone is a visual-only cue; `aria-current` is what tells a
    // screen reader which destination is active.
    expect(nav).toContain("aria-label=" + QUOTE + "VTU sections" + QUOTE);
    expect(nav).toContain("aria-current");
  });

  test("touch targets clear 44px", () => {
    // The tab row is the most-tapped control on these pages.
    expect(nav).toContain("min-h-11");
  });
});
