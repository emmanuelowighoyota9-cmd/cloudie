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

/**
 * Every navigation surface a signed-in customer can reach the app through.
 *
 * The VTU feature was reachable on desktop and completely unreachable on a
 * phone: the sidebar carried an entry, while BOTH mobile surfaces — the
 * hamburger drawer and the fixed bottom bar — omitted it. Most bill-payment
 * customers are on a phone, so for them the feature did not exist.
 *
 * This list is the regression guard for exactly that.
 */
const CUSTOMER_NAV_SURFACES = [
  "src/components/Sidebar.tsx",
  "src/components/MobileNav.tsx",
  "src/components/BottomNav.tsx",
];

/**
 * Every customer-facing VTU route the router serves, and the nav lists all of
 * them: a section per product family, plus the catalogue and the history.
 */
const VTU_ROUTES = [
  "/vtu",
  "/vtu/airtime",
  "/vtu/data",
  "/vtu/electricity",
  "/vtu/exam-pins",
  "/vtu/history",
];

/**
 * The customer VTU route the nav deliberately does NOT list.
 *
 * `/vtu/bills` is the shared purchase screen for ONE product rather than a
 * section of its own — data, electricity and exam pins each got a section tab,
 * which is what replaced the old "Bills" catch-all. So the generic screen is
 * reached from the catalogue tiles and the dashboard shortcut instead, and it
 * is checked against those surfaces rather than disappearing from the guard.
 */
const DEEPLINKED_ROUTES = ["/vtu/bills"];

/** Surfaces a signed-in customer can tap through to the generic screen from. */
const DEEPLINK_SOURCES = [
  "src/pages/VtuCatalog.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/MyServices.tsx",
];

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

  test("a route the nav does not list is linked from a customer surface", () => {
    // Reachability, not nav membership: `/vtu/bills` is the one route the nav
    // leaves out, and leaving it out is only safe while something a customer
    // can tap points at it.
    const linked = DEEPLINK_SOURCES.map((surface) => readFileSync(surface, "utf8")).join("\n");
    for (const route of DEEPLINKED_ROUTES) {
      expect(linked).toContain("to: " + QUOTE + route + QUOTE);
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
   * The nav is the first thing inside the shared shell, so its vertical
   * position IS the shell's top padding.
   *
   * The container used to be a class string COPIED into all four pages, and
   * this block compared the copies. It is now one component — `VtuShell` — so
   * the assertion follows the property rather than the copy: every VTU page
   * renders inside the shell, and the shell is the single place the padding is
   * declared. Pages cannot drift apart any more, because there is nothing left
   * to drift.
   *
   * Still read off real elements rather than searched for as free text: a prose
   * comment mentioning the padding would otherwise satisfy the assertion on its
   * own. Stripping comments first keeps that honest.
   */
  const shellSource = readFileSync("src/components/vtu/shared.tsx", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  test("all four VTU pages render inside the shared shell", () => {
    for (const page of VTU_PAGES) {
      const source = readFileSync(page, "utf8");
      expect(source).toContain("<VtuShell>");
      // The usage alone is not enough: a missing import fails the build rather
      // than the page silently rendering outside the shell.
      expect(source).toContain("VtuShell,");
      // And the nav is INSIDE it, which is what makes its position the same on
      // every page rather than merely similar.
      expect(source.indexOf("<VtuNav")).toBeGreaterThan(
        source.indexOf("<VtuShell>"),
      );
    }
  });

  test("the shell declares the page padding once, for everyone", () => {
    const containers = shellSource.match(/className="[^"]*mx-auto w-full max-w-[^"]*"/g) ?? [];
    expect(containers).toHaveLength(1);

    // The vertical rhythm the four pages used to repeat, now in one place.
    expect(containers[0]).toContain("py-4");
    expect(containers[0]).toContain("sm:py-7");
    expect(containers[0]).toContain("lg:py-9");

    // Full-bleed: the shell cancels the app shell's gutter at every breakpoint
    // it sets, or the shop would be a cream rectangle floating in a blue page.
    for (const bleed of ["-mx-3", "sm:-mx-5", "lg:-mx-8", "-my-4", "sm:-my-6", "lg:-my-8"]) {
      expect(shellSource).toContain(bleed);
    }
  });
});

describe("the sidebar agrees with the nav", () => {
  test("the sidebar keeps a single VTU entry rather than duplicating the nav", () => {
    // Two entries for the same section ("Airtime & Data" and "VTU History")
    // disagreed with the in-page nav about where you are, which is why the
    // history entry was dropped: the nav is the source of truth.
    //
    // The SHAPE is pinned rather than the label: the display name of the
    // section is copy and has been reworded before, but "one entry, the Zap
    // icon, pointing at /vtu" is the structure that must not drift.
    expect(sidebar).toMatch(/\{ label: "[^"]+", icon: Zap, to: "\/vtu" \}/);
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

describe("every customer navigation surface offers VTU", () => {
  for (const surface of CUSTOMER_NAV_SURFACES) {
    test(surface + " links to the VTU catalogue", () => {
      const source = readFileSync(surface, "utf8");
      // Matches the nav-item shape, not a bare string, so a `/vtu` mention in
      // a comment or an unrelated route cannot satisfy this.
      expect(source).toMatch(/to: ['"]\/vtu['"]/);
    });
  }

  test("the desktop sidebar exposes exactly one VTU entry", () => {
    // Two entries for one section disagreed with the in-page nav about where
    // the customer is; the in-page nav is the source of truth.
    const matches = [...sidebar.matchAll(/to: ['"]\/vtu['"]/g)];
    expect(matches.length).toBe(1);
  });

  test("the mobile surfaces prefix-match so VTU sub-pages stay highlighted", () => {
    // Both must highlight `/vtu/airtime` and `/vtu/history`. The BottomNav
    // already prefix-matches everything but `/dashboard`; MobileNav does the
    // same. If either ever switched to exact matching, the entry would go dead
    // the moment the customer left the catalogue — the same class of bug the
    // sidebar had.
    for (const surface of ["src/components/MobileNav.tsx", "src/components/BottomNav.tsx"]) {
      const source = readFileSync(surface, "utf8");
      // Both prefix forms keep a sub-page highlighted — `startsWith(path)` and
      // `startsWith(path + "/")` differ only in whether `/vtux` would match
      // `/vtu`. What must not happen is EXACT matching, which the next line
      // refuses for the VTU entry.
      expect(source).toMatch(/location\.pathname\.startsWith\(path[)\s+]/);
      expect(source).not.toContain('path === ' + QUOTE + '/vtu' + QUOTE);
    }
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
