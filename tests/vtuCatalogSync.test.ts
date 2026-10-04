import { describe, expect, test } from "bun:test";
import {
  SYNCABLE_SERVICES,
  buildDrafts,
  parsePackageResponse,
  parseServiceResponse,
  slugify,
  type SyncProvider,
} from "../src/lib/vtuCatalogSync";
// The REAL grammar, not a copy. Importing it is the whole point: if a
// generated product code cannot be round-tripped by the live parser, the
// product is unsellable and the customer sees a product that fails closed.
import { canonicalProductCode } from "../src/convex/vtuServiceRouting";
import { parseServiceCode, serviceCodeForProduct } from "../src/lib/vtu";

/**
 * The AidaPay catalog sync, tested as PURE functions.
 *
 * The load-bearing test is "every draft round-trips". A product code that does
 * not survive `serviceCodeForProduct` → `parseServiceCode` →
 * `canonicalProductCode` is a product the router cannot resolve, which is
 * exactly the silent failure this sync exists to avoid — the customer sees a
 * catalog card that refuses at purchase time with no visible cause.
 *
 * The rest cover the defensive parsing (this has never run against a live
 * token, so the envelope is unknown) and the stability of the slug, which is
 * what stops a second sync duplicating the whole catalog.
 */

const SAMPLE_SERVICES = {
  data: { data: [{ provider_code: "mtn-data", name: "MTN Data" }, { provider_code: "glo-data" }] },
};

const SAMPLE_PACKAGES = {
  data: {
    data: [
      {
        package_api_code: "DATA-01",
        package_description: "1GB - 30 Days",
        package_amount: 300,
        package_original_amount: 350,
      },
      { package_api_code: "DATA-02", package_description: "3.5GB - 1 Day - AWUF Data", package_amount: 985 },
    ],
  },
};

// ─── Slug generation ────────────────────────────────────────────────

describe("slugify", () => {
  test("it lowercases and hyphenates free text into one legal segment", () => {
    expect(slugify("1GB - 30 Days", "seed")).toBe("1gb-30-days");
    expect(slugify("3.5GB - 1 Day - AWUF Data", "seed")).toBe("3-5gb-1-day-awuf-data");
  });

  test("an over-long name is truncated with a hash, never silently cut", () => {
    const long = "A Really Very Extremely Long Data Plan Name That Goes On And On";
    const slug = slugify(long, "seed")!;
    expect(slug.length).toBeLessThanOrEqual(32);
    // Two names sharing a long prefix must not collapse to the same segment.
    expect(slugify(long + " A", "seed:a")).not.toBe(slug);
  });

  test("the result always satisfies the service-code grammar", () => {
    for (const name of [
      "1GB - 30 Days",
      "!!!",
      "",
      "A Really Very Extremely Long Data Plan Name That Goes On And On And On",
      "9mobile Special",
    ]) {
      const slug = slugify(name, `s:${name}`);
      if (slug === null) continue;
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{0,31}$/);
    }
  });
});

// ─── Defensive parsing ──────────────────────────────────────────────

describe("parsing AidaPay's envelopes", () => {
  test("a service list is read from whichever envelope it arrives in", () => {
    const expected = [
      { providerCode: "mtn-data", name: "MTN Data", packages: [] },
      // No `name` on the wire — the id stands in, rather than dropping the biller.
      { providerCode: "glo-data", name: "glo-data", packages: [] },
    ];
    expect(parseServiceResponse(SAMPLE_SERVICES.data)).toEqual(expected);
    expect(parseServiceResponse({ data: SAMPLE_SERVICES.data })).toEqual(expected);
    expect(parseServiceResponse({ providers: SAMPLE_SERVICES.data })).toEqual(expected);
    // A bare array, and a doubly-nested envelope, too.
    expect(parseServiceResponse([{ provider_code: "mtn-data", name: "MTN Data" }])).toEqual([
      { providerCode: "mtn-data", name: "MTN Data", packages: [] },
    ]);
    expect(parseServiceResponse({ data: { data: SAMPLE_SERVICES.data.data } })).toEqual(expected);
  });

  test("a provider with no id is dropped — a route cannot be written without one", () => {
    expect(parseServiceResponse({ data: [{ name: "Nameless" }] })).toEqual([]);
  });

  test("duplicate provider codes collapse", () => {
    const parsed = parseServiceResponse({
      data: [{ provider_code: "mtn-data" }, { provider_code: "mtn-data", name: "dupe" }],
    });
    expect(parsed).toHaveLength(1);
  });

  test("packages keep the wire id, the naira price, and the plan name", () => {
    expect(parsePackageResponse(SAMPLE_PACKAGES.data)).toEqual([
      { packageApiCode: "DATA-01", amountNgn: 300, name: "1GB - 30 Days" },
      { packageApiCode: "DATA-02", amountNgn: 985, name: "3.5GB - 1 Day - AWUF Data" },
    ]);
  });

  test("a plan with no usable price is dropped, not written unsellable", () => {
    const parsed = parsePackageResponse({
      data: [
        { package_api_code: "A", package_amount: 0 },
        { package_api_code: "B" },
        { package_api_code: "C", package_amount: "free" },
        { package_api_code: "D", package_amount: 500 },
      ],
    });
    expect(parsed).toEqual([{ packageApiCode: "D", amountNgn: 500, name: "D" }]);
  });

  test("a string price is coerced, because the wire is not always typed", () => {
    expect(parsePackageResponse({ data: [{ package_api_code: "A", package_amount: "500" }] })).toEqual([
      { packageApiCode: "A", amountNgn: 500, name: "A" },
    ]);
  });

  test("garbage in gives no drafts, not a crash", () => {
    for (const junk of [null, undefined, 42, "nope", {}]) {
      expect(parseServiceResponse(junk)).toEqual([]);
      expect(parsePackageResponse(junk)).toEqual([]);
    }
  });
});

// ─── The load-bearing test ──────────────────────────────────────────

describe("every generated product is actually addressable", () => {
  function allDrafts() {
    const providers = parseServiceResponse(SAMPLE_SERVICES.data).map((p) => ({
      ...p,
      packages: parsePackageResponse(SAMPLE_PACKAGES.data),
    })) as SyncProvider[];
    return buildDrafts("data", "Phone number", providers, "aidapay").drafts;
  }

  test("a draft's product code survives the real service-code round trip", () => {
    const drafts = allDrafts();
    expect(drafts.length).toBeGreaterThan(0);

    for (const draft of drafts) {
      // What the purchase page would be handed…
      const serviceCode = serviceCodeForProduct(draft);
      expect(serviceCode).not.toBeNull();

      // …must parse…
      const parsed = parseServiceCode(serviceCode!);
      expect(parsed).not.toBeNull();
      expect(parsed!.serviceType).toBe("data");
      expect(parsed!.packageSlug).not.toBeNull();

      // …and resolve back to the very product it came from.
      expect(canonicalProductCode(serviceCode!)).toBe(draft.productCode);
    }
  });

  test("the provider's own id stays on the route, never in the product code", () => {
    for (const draft of allDrafts()) {
      // The wire ids are the provider's namespace and may change; leaking
      // them into the product code would make a re-sync create duplicates.
      expect(draft.productCode).not.toContain(draft.providerPackageCode.toLowerCase());
      // Every route goes to AidaPay, but each BILLER is its own product, so the
      // route carries the biller's id rather than the registry name.
      expect(draft.provider).toBe("aidapay");
      expect(["mtn-data", "glo-data"]).toContain(draft.providerProductCode);
      expect(["DATA-01", "DATA-02"]).toContain(draft.providerPackageCode);
    }
  });

  test("two billers offering the SAME plan name stay distinct products", () => {
    // The regression this pins: a collision check keyed on the bare slug would
    // hash Glo's plan even though `data-mtn-…` and `data-glo-…` were already
    // distinct — and the unwanted suffix is what overflows the 32-char limit.
    const providers: SyncProvider[] = [
      { providerCode: "mtn-data", name: "MTN", packages: [{ packageApiCode: "A", amountNgn: 100, name: "1GB - 30 Days" }] },
      { providerCode: "glo-data", name: "Glo", packages: [{ packageApiCode: "B", amountNgn: 200, name: "1GB - 30 Days" }] },
    ];
    const codes = buildDrafts("data", "Phone number", providers, "aidapay").drafts.map(
      (d) => d.productCode,
    );
    expect(codes).toEqual(["data-mtn-data-1gb-30-days", "data-glo-data-1gb-30-days"]);
  });

  test("a very long biller id and plan name still yield an addressable product", () => {
    // The 32-char limit applies to the product code's whole remainder, not to
    // each segment separately — so the slug's budget depends on the host.
    const providers: SyncProvider[] = [
      {
        providerCode: "an-extremely-long-biller-code",
        name: "Biller",
        packages: [
          { packageApiCode: "P", amountNgn: 500, name: "A Really Very Extremely Long Plan Name Here" },
        ],
      },
    ];
    const [draft] = buildDrafts("data", "Phone number", providers, "aidapay").drafts;
    const rest = draft.productCode.slice("data-".length);
    expect(rest.length).toBeLessThanOrEqual(32);
    const serviceCode = serviceCodeForProduct(draft);
    expect(serviceCode).not.toBeNull();
    expect(canonicalProductCode(serviceCode!)).toBe(draft.productCode);
  });

  test("re-syncing produces byte-identical codes, so nothing duplicates", () => {
    const first = allDrafts().map((d) => d.productCode);
    const second = allDrafts().map((d) => d.productCode);
    expect(second).toEqual(first);
  });

  test("two plans that slug alike stay distinct, deterministically", () => {
    const providers: SyncProvider[] = [
      {
        providerCode: "mtn-data",
        name: "MTN",
        packages: [
          { packageApiCode: "P1", amountNgn: 100, name: "Same Plan Name" },
          { packageApiCode: "P2", amountNgn: 200, name: "Same Plan Name" },
        ],
      },
    ];
    const a = buildDrafts("data", "Phone number", providers, "aidapay").drafts;
    const b = buildDrafts("data", "Phone number", providers, "aidapay").drafts;
    expect(new Set(a.map((d) => d.productCode)).size).toBe(2);
    // Stability is the property that stops a second sync duplicating a catalog.
    expect(b.map((d) => d.productCode)).toEqual(a.map((d) => d.productCode));
  });

  test("every synced service type produces addressable codes", () => {
    for (const service of SYNCABLE_SERVICES) {
      const providers: SyncProvider[] = [
        {
          providerCode: `${service.serviceType}-biller`,
          name: "Biller",
          packages: [{ packageApiCode: "PKG-1", amountNgn: 500, name: "Standard Plan" }],
        },
      ];
      const [draft] = buildDrafts(service.serviceType, service.label, providers, "aidapay").drafts;
      expect(draft).toBeDefined();
      const serviceCode = serviceCodeForProduct(draft)!;
      expect(canonicalProductCode(serviceCode)).toBe(draft.productCode);
      expect(draft.requiresPackageCode).toBe(true);
      expect(draft.requiresAmount).toBe(false);
    }
  });
});
