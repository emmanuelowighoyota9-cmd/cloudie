/**
 * Document totals reconciliation.
 *
 * The builder form lets people edit numbers by hand, so a document can end up
 * with a total that no longer matches its own lines. This module compares the
 * declared totals on a template against the numbers that can be derived from
 * the same form, and reports the fields that disagree.
 *
 * It is purely a function of the template schema and the live values, so it
 * works for platform templates, user templates and any fresh or half-filled
 * form. Checks that have nothing to compare against are simply skipped.
 */

import { formatCurrency, type DocumentValues, type FieldDef, type TemplateSchema } from "./docTemplateEngine";

/** One declared field compared against the numbers derived from the form. */
export interface TotalsCheck {
  /** Field id of the declared value, e.g. "total". */
  fieldId: string;
  /** That field's label, e.g. "Total due". */
  label: string;
  /** How the expectation was worked out, e.g. "line amounts + tax + delivery". */
  basis: string;
  /** The value the field currently holds. */
  declared: number;
  /** What the form adds up to. */
  expected: number;
  /** declared − expected. */
  difference: number;
  agrees: boolean;
}

export interface TotalsReport {
  /** Currency code used to render amounts, from the template's currency field. */
  currency: string;
  /** Row amount field ids that took part in the check. */
  rowIds: string[];
  rowLabel: string;
  /** Sum of the row amounts. */
  rowTotal: number;
  checks: TotalsCheck[];
  /** Only the checks that disagree. */
  mismatches: TotalsCheck[];
}

interface CheckSpec {
  /** The field being checked. */
  field: string;
  /** Include the line-item sum. */
  rows?: boolean;
  /** Field ids added to the expectation. */
  add?: string[];
  /** Field ids subtracted from the expectation. */
  subtract?: string[];
  /** Plain-language description of the expectation. */
  basis: string;
}

interface Plan {
  /** Field-id prefix of the repeatable amount column, e.g. "amt" → amt1, amt2… */
  rowPrefix?: string;
  rowLabel?: string;
  checks: CheckSpec[];
}

/** Declared totals per template, where the meaning of each figure is known. */
const PLANS: Record<string, Plan> = {
  "commercial-invoice": {
    rowPrefix: "amt",
    rowLabel: "Line items",
    checks: [
      { field: "subtotal", rows: true, basis: "sum of the line amounts" },
      { field: "total", rows: true, add: ["taxAmount", "shipping"], basis: "line amounts + tax + delivery" },
    ],
  },
  "purchase-order": {
    rowPrefix: "poAmount",
    rowLabel: "Order lines",
    checks: [
      { field: "subtotal", rows: true, basis: "sum of the order line amounts" },
      { field: "total", rows: true, add: ["taxAmount", "shipping"], basis: "line amounts + tax + delivery" },
    ],
  },
  quotation: {
    rowPrefix: "quoteAmount",
    rowLabel: "Quotation lines",
    checks: [
      { field: "subtotal", rows: true, basis: "sum of the quoted line amounts" },
      { field: "total", rows: true, add: ["taxAmount"], basis: "line amounts + tax" },
    ],
  },
  "item-schedule": {
    rowPrefix: "scheduleAmount",
    rowLabel: "Item rows",
    checks: [
      { field: "subtotal", rows: true, basis: "sum of the row amounts" },
      { field: "total", rows: true, add: ["taxAmount"], basis: "row amounts + tax" },
    ],
  },
  "expense-claim": {
    rowPrefix: "expenseAmount",
    rowLabel: "Claim lines",
    checks: [
      { field: "subtotal", rows: true, basis: "sum of the claimed amounts" },
      { field: "total", rows: true, add: ["taxAmount"], basis: "claimed amounts + tax" },
      { field: "reimbursable", add: ["total"], subtract: ["advance"], basis: "total claimed − advance received" },
    ],
  },
  "remittance-advice": {
    rowPrefix: "amount",
    rowLabel: "Invoices settled",
    checks: [{ field: "totalRemitted", rows: true, basis: "sum of the settled amounts" }],
  },
  "statement-of-account": {
    rowPrefix: "entryAmount",
    rowLabel: "Statement entries",
    checks: [
      {
        field: "balanceDue",
        add: ["openingBalance", "totalInvoiced"],
        subtract: ["totalPaid"],
        basis: "opening balance + invoiced − paid",
      },
    ],
  },
  "payment-verification-statement": {
    checks: [{ field: "total", add: ["amount"], subtract: ["fee"], basis: "amount less the processing fee" }],
  },
};

/** Currency fields that sit between the line sum and the total. */
const ADDITION_PATTERN = /^(?:tax|vat|shipping|delivery|freight|discount|duty|surcharge|handling|levy)/i;
/**
 * Field ids that read as the document's own total. Matched whole rather than by
 * substring: `balanceForward` and `overdue` are line figures, not totals, and
 * guessing wrong here invents a mismatch the user never created.
 */
const TOTAL_IDS = new Set([
  "total",
  "totalamount",
  "grandtotal",
  "ordertotal",
  "quotedtotal",
  "totalclaimed",
  "totalcost",
  "totaldue",
  "totalsettled",
  "totalpayable",
  "totalremitted",
  "amountdue",
  "amountpayable",
  "netpayable",
  "balancedue",
  "balancetotal",
]);

function numberOf(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isFilled(field: FieldDef, values: DocumentValues): boolean {
  const raw = values[field.id] ?? field.default;
  return raw !== undefined && raw !== null && String(raw).trim() !== "";
}

function valueOf(field: FieldDef, values: DocumentValues): number {
  return numberOf(values[field.id] ?? field.default);
}

/** Currency code for display: the template's own currency field when it has one. */
function currencyOf(fields: FieldDef[], values: DocumentValues): string {
  const field = fields.find((f) => f.id === "currencyCode");
  const code = field ? values[field.id] ?? field.default : undefined;
  const text = String(code ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : "USD";
}

/**
 * Fallback for templates with no declared plan: a repeatable amount column
 * (amt1, amt2…) plus a field that reads as the document's own total. Only
 * unambiguous shapes are checked, so nothing is flagged by guesswork.
 */
function inferPlan(fields: FieldDef[]): Plan | null {
  const currency = fields.filter((f) => f.type === "currency");
  const groups = new Map<string, FieldDef[]>();
  for (const field of currency) {
    const match = /^(.*?)(\d+)$/.exec(field.id);
    if (!match) continue;
    groups.set(match[1], [...(groups.get(match[1]) ?? []), field]);
  }
  const rowGroup = [...groups.entries()].find(([, members]) => members.length >= 2);
  if (!rowGroup) return null;
  const [rowPrefix] = rowGroup;
  const total = currency.find(
    (f) => !/(\d+)$/.test(f.id) && !/^subtotal$/i.test(f.id) && TOTAL_IDS.has(f.id.toLowerCase()),
  );
  if (!total) return null;
  const additions = currency.filter(
    (f) => f.id !== total.id && !/(\d+)$/.test(f.id) && ADDITION_PATTERN.test(f.id),
  );
  return {
    rowPrefix,
    rowLabel: "Line items",
    checks: [
      {
        field: total.id,
        rows: true,
        add: additions.map((f) => f.id),
        basis: additions.length
          ? `line amounts + ${additions.map((f) => f.label.toLowerCase()).join(" + ")}`
          : "sum of the line amounts",
      },
    ],
  };
}

/** Row amount fields of the plan's prefix that the form actually carries. */
function rowFields(fields: FieldDef[], plan: Plan, values: DocumentValues): FieldDef[] {
  if (!plan.rowPrefix) return [];
  return fields.filter(
    (field) =>
      field.type === "currency" &&
      new RegExp(`^${plan.rowPrefix}\\d+$`).test(field.id) &&
      isFilled(field, values),
  );
}

function expectationOf(
  spec: CheckSpec,
  rows: FieldDef[],
  fields: FieldDef[],
  values: DocumentValues,
): { expected: number; filledRows: number; filledContributors: number } {
  let expected = 0;
  let filledRows = 0;
  let filledContributors = 0;
  if (spec.rows) {
    for (const row of rows) {
      if (!isFilled(row, values)) continue;
      expected += valueOf(row, values);
      filledRows++;
    }
  }
  for (const id of spec.add ?? []) {
    const field = fields.find((f) => f.id === id);
    if (!field || !isFilled(field, values)) continue;
    expected += valueOf(field, values);
    filledContributors++;
  }
  for (const id of spec.subtract ?? []) {
    const field = fields.find((f) => f.id === id);
    if (!field || !isFilled(field, values)) continue;
    expected -= valueOf(field, values);
    filledContributors++;
  }
  return { expected, filledRows, filledContributors };
}

/**
 * Drop template defaults a brief never mentioned.
 *
 * A brief that quotes one line must not leave the other row slots holding the
 * template's sample amounts, and a brief that states its own total must not
 * leave the template's sample tax, delivery or subtotal behind: the document
 * would then carry figures nobody asked for, and the totals check would flag a
 * mismatch the user did not create. A brief that states no money at all is
 * left on the template's defaults.
 */
export function pruneBriefRowDefaults(
  schema: TemplateSchema,
  values: DocumentValues,
  briefValues: Record<string, string>,
): DocumentValues {
  const fields = schema?.fields ?? [];
  const stated = (id: string) => String(briefValues[id] ?? "").trim() !== "";

  // Row slots: amt1, amt2, amt3 … grouped by their shared prefix.
  const groups = new Map<string, string[]>();
  for (const field of fields) {
    const match = /^(.*?)(\d+)$/.exec(field.id);
    if (!match) continue;
    groups.set(match[1], [...(groups.get(match[1]) ?? []), field.id]);
  }
  const out: DocumentValues = { ...values };
  for (const [, ids] of groups) {
    // Only a row set the brief actually filled in gets its gaps cleared.
    if (!ids.some(stated)) continue;
    for (const id of ids) {
      // Blanked rather than deleted: the schema default is the fallback for a
      // missing key, so removing the key would leave the sample row in place.
      if (!stated(id)) out[id] = "";
    }
  }

  // Summary amounts — subtotal, tax, delivery — once the brief has spoken about
  // money at all. Row amounts are handled above; totals are blanked the same
  // way so a stated total is never measured against the template's sample tax.
  if (fields.some((field) => field.type === "currency" && stated(field.id))) {
    for (const field of fields) {
      if (field.type !== "currency" || /(\d+)$/.test(field.id)) continue;
      if (!stated(field.id)) out[field.id] = "";
    }
  }
  return out;
}

/**
 * Compare the totals a document declares against what its own form adds up to.
 * Returns `null` when the template has nothing worth checking.
 */
export function checkDocumentTotals(
  schema: TemplateSchema,
  values: DocumentValues,
  slug?: string,
): TotalsReport | null {
  const fields = schema?.fields ?? [];
  if (fields.length === 0) return null;
  const plan = (slug ? PLANS[slug] : undefined) ?? inferPlan(fields);
  if (!plan || plan.checks.length === 0) return null;

  const rows = rowFields(fields, plan, values);
  const rowTotal = rows.reduce((sum, row) => sum + valueOf(row, values), 0);
  const checks: TotalsCheck[] = [];

  for (const spec of plan.checks) {
    const field = fields.find((f) => f.id === spec.field);
    if (!field || !isFilled(field, values)) continue;
    // A deduction the form leaves blank makes the whole expectation unknowable:
    // "total less advance" cannot be checked while the advance is unknown.
    const unknownDeduction = (spec.subtract ?? []).some((id) => {
      const term = fields.find((f) => f.id === id);
      return !!term && !isFilled(term, values);
    });
    if (unknownDeduction) continue;
    const { expected, filledRows, filledContributors } = expectationOf(spec, rows, fields, values);
    // A total cannot be reconciled against lines that carry no amounts, and a
    // balance cannot be reconciled against contributors the form leaves blank.
    // Reporting those would be arithmetic theatre, not a caught mistake.
    if (spec.rows ? filledRows === 0 : filledContributors === 0) continue;
    const declared = valueOf(field, values);
    const expectedCents = Math.round(expected * 100) / 100;
    const difference = Math.round((declared - expectedCents) * 100) / 100;
    checks.push({
      fieldId: field.id,
      label: field.label,
      basis: spec.basis,
      declared,
      expected: expectedCents,
      difference,
      agrees: Math.abs(difference) < 0.01,
    });
  }

  if (checks.length === 0) return null;
  return {
    currency: currencyOf(fields, values),
    rowIds: rows.map((row) => row.id),
    rowLabel: plan.rowLabel ?? "Line items",
    rowTotal: Math.round(rowTotal * 100) / 100,
    checks,
    mismatches: checks.filter((check) => !check.agrees),
  };
}

/** "−$120.00" / "+$40.00" — how far a declared total is from the rows. */
export function formatDifference(difference: number, currency: string): string {
  if (Math.abs(difference) < 0.01) return formatAmount(0, currency);
  const sign = difference < 0 ? "−" : "+";
  return `${sign}${formatAmount(Math.abs(difference), currency)}`;
}

/** Currency string for a computed amount, e.g. 4824 → "$4,824.00". */
export function formatAmount(value: number, currency: string): string {
  return formatCurrency(value.toFixed(2), currency);
}
