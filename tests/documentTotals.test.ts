import { describe, expect, test } from "bun:test";
import {
  checkDocumentTotals,
  formatAmount,
  formatDifference,
  pruneBriefRowDefaults,
} from "../src/lib/documentTotals.ts";
import { defaultValues, type DocumentValues, type TemplateSchema } from "../src/lib/docTemplateEngine.ts";
import { PLATFORM_TEMPLATES } from "../src/lib/platformTemplates.ts";
import { buildStructuredOutput, parseDocumentBrief } from "../src/lib/documentBrief.ts";

const template = (slug: string) => {
  const found = PLATFORM_TEMPLATES.find((t) => t.slug === slug);
  if (!found) throw new Error(`no platform template ${slug}`);
  return found;
};

/** The check for one field, or undefined when it is not being made. */
const checkFor = (slug: string, values: DocumentValues, fieldId: string) =>
  checkDocumentTotals(template(slug).schema, values, slug)?.checks.find((c) => c.fieldId === fieldId);

// ─── The shipped template data must reconcile with itself ────────────────────
// This is the guard on the seeded defaults: if a template's own rows and totals
// disagree, every user sees a red banner before touching anything.

describe("platform template defaults", () => {
  for (const tpl of PLATFORM_TEMPLATES) {
    test(`${tpl.slug} reconciles at its shipped defaults`, () => {
      const report = checkDocumentTotals(tpl.schema, defaultValues(tpl.schema), tpl.slug);
      const flagged = report?.mismatches ?? [];
      expect(flagged.map((c) => `${c.fieldId} declared ${c.declared} expected ${c.expected}`)).toEqual([]);
    });
  }
});

describe("templates with nothing to reconcile", () => {
  const unchecked = [
    "shipment-tracking-card",
    "packing-list",
    "delivery-note",
    "operations-brief",
    "business-letter",
    "certificate-of-completion",
    "flight-itinerary",
    "banking-dashboard-mockup",
  ];
  for (const slug of unchecked) {
    test(`${slug} produces no check`, () => {
      expect(checkDocumentTotals(template(slug).schema, defaultValues(template(slug).schema), slug)).toBeNull();
    });
  }
});

// ─── A manual edit that breaks the arithmetic must be caught ────────────────

describe("catching a manual edit", () => {
  test("editing one line amount flags the subtotal and the total with the right delta", () => {
    const tpl = template("commercial-invoice");
    const values = { ...defaultValues(tpl.schema), amt2: "1500.00" };
    const report = checkDocumentTotals(tpl.schema, values, tpl.slug)!;

    expect(report.rowIds).toEqual(["amt1", "amt2", "amt3"]);
    expect(report.rowTotal).toBe(4380);

    for (const fieldId of ["subtotal", "total"]) {
      const check = report.checks.find((c) => c.fieldId === fieldId)!;
      expect(check.agrees).toBe(false);
      expect(check.declared).toBe(fieldId === "subtotal" ? 4320 : 4824);
      // 60 short on both: the row fell by 60, tax and delivery are unchanged.
      expect(check.expected).toBe(fieldId === "subtotal" ? 4380 : 4884);
      expect(check.difference).toBe(-60);
    }
    expect(report.mismatches.map((c) => c.fieldId)).toEqual(["subtotal", "total"]);
  });

  test("applying every suggested figure clears the mismatch", () => {
    const tpl = template("commercial-invoice");
    const broken = { ...defaultValues(tpl.schema), amt2: "1500.00" };
    const flagged = checkDocumentTotals(tpl.schema, broken, tpl.slug)!;
    expect(flagged.mismatches.length).toBeGreaterThan(0);

    // What the "Use $X" button does, once per flagged field.
    const fixed = { ...broken };
    for (const check of flagged.mismatches) fixed[check.fieldId] = check.expected.toFixed(2);
    expect(checkDocumentTotals(tpl.schema, fixed, tpl.slug)!.mismatches).toEqual([]);
  });

  test("fixing only the total still leaves the subtotal flagged", () => {
    const tpl = template("commercial-invoice");
    const broken = { ...defaultValues(tpl.schema), amt2: "1500.00" };
    const flagged = checkDocumentTotals(tpl.schema, broken, tpl.slug)!;
    const total = flagged.checks.find((c) => c.fieldId === "total")!;
    const only = { ...broken, [total.fieldId]: total.expected.toFixed(2) };
    expect(checkDocumentTotals(tpl.schema, only, tpl.slug)!.mismatches.map((c) => c.fieldId)).toEqual(["subtotal"]);
  });

  test("a sub-cent drift is not a mismatch", () => {
    const tpl = template("commercial-invoice");
    const values = { ...defaultValues(tpl.schema), total: "4824.004" };
    const check = checkFor("commercial-invoice", values, "total")!;
    expect(check.difference).toBe(0);
    expect(check.agrees).toBe(true);
  });

  test("a credit note reduces the expected total", () => {
    const tpl = template("statement-of-account");
    const values = { ...defaultValues(tpl.schema), totalPaid: "4000.00" };
    const check = checkFor("statement-of-account", values, "balanceDue")!;
    // opening 1240 + invoiced 6084.50 − paid 4000
    expect(check.expected).toBe(3324.5);
    expect(check.difference).toBe(-824);
    expect(check.agrees).toBe(false);
  });

  test("reimbursable is the claimed total less the advance", () => {
    const tpl = template("expense-claim");
    const report = checkFor("expense-claim", defaultValues(tpl.schema), "reimbursable")!;
    // Exact to the cent: 1071.10 − 300.00 must not drift to 771.0999999999999.
    expect(report.expected).toBe(771.1);
    expect(report.difference).toBe(0);
    const values = { ...defaultValues(tpl.schema), advance: "500.00" };
    expect(checkFor("expense-claim", values, "reimbursable")!.expected).toBe(571.1);
  });

  test("the remitted total is the sum of the settled invoices", () => {
    const tpl = template("remittance-advice");
    const values = { ...defaultValues(tpl.schema), amount2: "1000.00" };
    const check = checkFor("remittance-advice", values, "totalRemitted")!;
    // 4824 + 1000 + 880
    expect(check.expected).toBe(6704);
    expect(check.agrees).toBe(false);
  });

  test("a payment statement reconciles amount less the processing fee", () => {
    const tpl = template("payment-verification-statement");
    const report = checkDocumentTotals(tpl.schema, defaultValues(tpl.schema), tpl.slug)!;
    expect(report.rowIds).toEqual([]);
    expect(report.checks.map((c) => c.fieldId)).toEqual(["total"]);
    expect(report.mismatches).toEqual([]);
  });
});

// ─── Blanking a field must not manufacture a mismatch ───────────────────────

describe("empty and partial forms", () => {
  test("clearing every line amount stops the check rather than reporting a bogus figure", () => {
    const tpl = template("commercial-invoice");
    const values = { ...defaultValues(tpl.schema), amt1: "", amt2: "", amt3: "" };
    expect(checkDocumentTotals(tpl.schema, values, tpl.slug)).toBeNull();
  });

  test("clearing the total removes that check but keeps the rest", () => {
    const tpl = template("commercial-invoice");
    const values = { ...defaultValues(tpl.schema), total: "" };
    const report = checkDocumentTotals(tpl.schema, values, tpl.slug)!;
    expect(report.checks.map((c) => c.fieldId)).toEqual(["subtotal"]);
    expect(report.mismatches).toEqual([]);
  });

  test("a balance with no opening, invoiced or paid figure is not reconciled", () => {
    const tpl = template("statement-of-account");
    const values = { ...defaultValues(tpl.schema), openingBalance: "", totalInvoiced: "", totalPaid: "" };
    expect(checkDocumentTotals(tpl.schema, values, tpl.slug)).toBeNull();
  });

  test("a balance missing only its opening figure is still checked", () => {
    const tpl = template("statement-of-account");
    const values = { ...defaultValues(tpl.schema), openingBalance: "" };
    const check = checkFor("statement-of-account", values, "balanceDue")!;
    expect(check.expected).toBe(1260.5);
    expect(check.agrees).toBe(false);
  });

  test("a blank deduction invalidates the check instead of counting as zero", () => {
    const tpl = template("expense-claim");
    const values = { ...defaultValues(tpl.schema), advance: "" };
    // "total less advance" is unknowable while the advance is blank, so the
    // reimbursable figure is not judged — the other checks still are.
    const report = checkDocumentTotals(tpl.schema, values, tpl.slug)!;
    expect(report.checks.map((c) => c.fieldId)).toEqual(["subtotal", "total"]);
    expect(report.mismatches).toEqual([]);
  });
});

// ─── Owner-authored templates: infer only what is unambiguous ──────────────

describe("inferring a plan for an undeclared template", () => {
  const rowsAnd = (extra: { id: string; type: "currency" | "text"; label: string; default: string }[]) => ({
    fields: [
      { id: "desc1", type: "text" as const, label: "Description 1", default: "Panel" },
      { id: "cost1", type: "currency" as const, label: "Cost 1", default: "100.00" },
      { id: "desc2", type: "text" as const, label: "Description 2", default: "Handle" },
      { id: "cost2", type: "currency" as const, label: "Cost 2", default: "200.00" },
      ...extra,
    ],
  });

  test("rows plus a total field plus tax are checked", () => {
    const schema: TemplateSchema = rowsAnd([
      { id: "tax", type: "currency", label: "Tax", default: "30.00" },
      { id: "total", type: "currency", label: "Total", default: "330.00" },
    ]);
    const report = checkDocumentTotals(schema, defaultValues(schema), "owner-template")!;
    expect(report.rowTotal).toBe(300);
    expect(report.checks).toHaveLength(1);
    expect(report.mismatches).toEqual([]);
  });

  test("a field merely containing 'balance' is not treated as the total", () => {
    const schema: TemplateSchema = rowsAnd([
      { id: "balanceForward", type: "currency", label: "Balance b/f", default: "50.00" },
    ]);
    expect(checkDocumentTotals(schema, defaultValues(schema), "owner-template")).toBeNull();
  });

  test("a field merely containing 'due' is not treated as the total", () => {
    const schema: TemplateSchema = rowsAnd([
      { id: "overdue", type: "currency", label: "Overdue interest", default: "15.00" },
    ]);
    expect(checkDocumentTotals(schema, defaultValues(schema), "owner-template")).toBeNull();
  });

  test("a bare field sharing the row prefix is not treated as the total", () => {
    const schema: TemplateSchema = {
      fields: [
        { id: "amount", type: "currency", label: "Amount", default: "3000.00" },
        { id: "line1", type: "text", label: "Line 1", default: "A" },
        { id: "amount1", type: "currency", label: "Amount 1", default: "1000.00" },
        { id: "line2", type: "text", label: "Line 2", default: "B" },
        { id: "amount2", type: "currency", label: "Amount 2", default: "4000.00" },
      ],
    };
    expect(checkDocumentTotals(schema, defaultValues(schema), "owner-template")).toBeNull();
  });

  test("a lone currency column with no repeated rows is not guessed at", () => {
    const schema: TemplateSchema = {
      fields: [
        { id: "amount1", type: "currency", label: "Amount 1", default: "100.00" },
        { id: "total", type: "currency", label: "Total", default: "100.00" },
      ],
    };
    expect(checkDocumentTotals(schema, defaultValues(schema), "owner-template")).toBeNull();
  });
});

// ─── Brief handoff: the builder must not inherit rows nobody asked for ──────

describe("brief handoff into the builder", () => {
  const handoff = (brief: string, slug: string) => {
    const result = parseDocumentBrief(brief);
    if (result.status !== "matched") throw new Error(`brief did not match: ${result.status}`);
    const tpl = template(slug);
    const built = buildStructuredOutput(result, tpl.schema);
    // Exactly what DocumentBuilder seeds: the server's `defaults` (derived from
    // the schema) with the brief's values layered on top.
    const seeded = pruneBriefRowDefaults(tpl.schema, { ...defaultValues(tpl.schema), ...built.values }, built.values);
    return { tpl, values: seeded, report: checkDocumentTotals(tpl.schema, seeded, slug) };
  };

  test("a one-line quotation brief does not inherit the sample rows", () => {
    const { values, report } = handoff(
      "Quotation QT-2026-1187 issued by Northfold Trading for Lakeview Interiors dated 2026-09-24, " +
        "valid until 2026-10-24, 24 x Oak veneer panels 1920.00, quoted total 1920.00 USD.",
      "quotation",
    );
    expect(values.quoteAmount1).toBe("1920.00");
    expect(values.quoteAmount2).toBe("");
    expect(values.quoteAmount3).toBe("");
    // The brief stated no tax, so none is assumed and the quoted total stands.
    expect(report?.mismatches ?? []).toEqual([]);
  });

  test("a one-line invoice brief does not flag a mismatch the user never made", () => {
    const { values, report } = handoff(
      "Invoice INV-2026-0900 for Lakeview Interiors dated 2026-09-15, seller Northfold Trading Ltd, " +
        "2 x Oak veneer panels 1920.00, total due 1920.00 USD.",
      "commercial-invoice",
    );
    expect(values.amt1).toBe("1920.00");
    expect(values.amt2).toBe("");
    expect(report?.mismatches ?? []).toEqual([]);
  });

  test("a brief that fills every row it names keeps them all", () => {
    const { values, report } = handoff(
      "Purchase order PO-2026-4471 from Northfold Trading to supplier Meridian Supply Co., required by " +
        "2026-10-06, Net 30, 2 x Oak veneer panels 1920.00, 3 x Brushed brass handles 1440.00, tax 252.00, " +
        "delivery 180.00, order total 3792.00 USD.",
      "purchase-order",
    );
    expect(values.poAmount1).toBe("1920.00");
    expect(values.poAmount2).toBe("1440.00");
    // The brief named two lines, so the template's third sample line is dropped.
    expect(values.poAmount3).toBe("");
    expect(report?.mismatches ?? []).toEqual([]);
  });

  test("a brief that fills no rows leaves the template defaults alone", () => {
    const tpl = template("commercial-invoice");
    const values = pruneBriefRowDefaults(tpl.schema, defaultValues(tpl.schema), { invoiceNumber: "INV-1" });
    expect(values.amt1).toBe("1920.00");
    expect(values.amt3).toBe("960.00");
  });

  test("a brief with no money at all leaves every row intact", () => {
    const tpl = template("commercial-invoice");
    const values = pruneBriefRowDefaults(tpl.schema, defaultValues(tpl.schema), { invoiceNumber: "INV-1", buyerName: "Acme" });
    expect(values.amt2).toBe("1440.00");
  });

  // The generator's own worked examples. Whatever that page certifies as
  // reconciled must not arrive in the builder wearing a red banner.
  const EXAMPLES: [string, string][] = [
    [
      "Purchase order PO-2026-4471 from Northfold Trading to supplier Meridian Supply Co., required by 2026-10-06, Net 30, 2 x Oak veneer panels 1920.00, 3 x Brushed brass handles 1440.00, tax 252.00, delivery 180.00, order total 3792.00 USD.",
      "purchase-order",
    ],
    [
      "Quotation QT-2026-1187 issued by Northfold Trading for Lakeview Interiors dated 2026-09-24, valid until 2026-10-24, 24 x Oak veneer panels 1920.00, 60 x Brushed brass handles 1440.00, tax 252.00, quoted total 3612.00 USD.",
      "quotation",
    ],
    [
      [
        "Remittance advice REM-2026-0338 issued 2026-09-24 by Lakeview Interiors settling beneficiary Northfold Trading, bank transfer, total remitted 6964.50 USD.",
        "Invoice,Amount",
        "INV-2026-0774,4824.00",
        "INV-2026-0781,1260.50",
        "INV-2026-0790,880.00",
      ].join("\n"),
      "remittance-advice",
    ],
    [
      "Expense claim EXP-2026-0512 submitted by Maya Thompson dated 2026-09-24, purpose: Client site visit — Nairobi, category Travel, 1 x Flights — return 612.40, 1 x Hotel — 2 nights 392.20, tax 66.50, total 1071.10 USD, reimburse 771.10 USD.",
      "expense-claim",
    ],
    [
      [
        "Item schedule SCH-2026-0714 issued by Northfold Trading for Lakeview Interiors dated 2026-09-25, currency USD, total 3766.00.",
        "Item,Qty,Amount",
        "Oak veneer panels,24,1920.00",
        '"Brackets, galvanised",18,214.00',
        "Brushed brass handles,60,1440.00",
        "Sealant cartridges,12,192.00",
      ].join("\n"),
      "item-schedule",
    ],
  ];

  for (const [brief, slug] of EXAMPLES) {
    test(`the shipped ${slug} example hands off without a mismatch`, () => {
      const { report } = handoff(brief, slug);
      expect(
        (report?.mismatches ?? []).map((c) => `${c.fieldId} declared ${c.declared} expected ${c.expected}`),
      ).toEqual([]);
    });
  }

  test("a balance the brief cannot be checked against is left alone", () => {
    const { values, report } = handoff(
      "Statement of account SOA-2026-0091 from Northfold Trading for Lakeview Interiors dated 2026-09-30, period from 2026-09-01 to 2026-09-30, balance due 2500.50 USD.",
      "statement-of-account",
    );
    expect(values.balanceDue).toBe("2500.50");
    expect(values.openingBalance).toBe("");
    // Nothing to reconcile against, so the builder says nothing.
    expect(report?.mismatches ?? []).toEqual([]);
  });
});

// ─── Formatting ─────────────────────────────────────────────────────────────

describe("amount formatting", () => {
  test("formats a computed amount in the template's own currency", () => {
    const tpl = template("item-schedule");
    const values = { ...defaultValues(tpl.schema), currencyCode: "EUR" };
    const report = checkDocumentTotals(tpl.schema, values, tpl.slug)!;
    expect(report.currency).toBe("EUR");
    expect(formatAmount(report.rowTotal, report.currency)).toBe("€5,836.00");
  });

  test("falls back to USD when the currency field is not a code", () => {
    const tpl = template("item-schedule");
    const values = { ...defaultValues(tpl.schema), currencyCode: "" };
    expect(checkDocumentTotals(tpl.schema, values, tpl.slug)!.currency).toBe("USD");
  });

  test("difference carries a sign and reads as a shortfall", () => {
    expect(formatDifference(-60, "USD")).toBe("−$60.00");
    expect(formatDifference(60, "USD")).toBe("+$60.00");
    expect(formatDifference(0, "USD")).toBe("$0.00");
    expect(formatDifference(0.004, "USD")).toBe("$0.00");
  });

  test("difference uses the document currency", () => {
    expect(formatDifference(-1234.5, "GBP")).toBe("−£1,234.50");
  });
});
