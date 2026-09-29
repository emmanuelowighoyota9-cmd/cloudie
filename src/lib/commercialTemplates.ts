/**
 * Crestline commercial paperwork templates (part two).
 *
 * Quotation, delivery note, statement of account and expense claim. Kept in
 * their own module so the base starter set stays readable; both are merged into
 * the platform set by ./platformTemplates.ts and seeded by the Convex seeder.
 *
 * As with every starter, the content is deliberately fictional — names,
 * references and amounts are illustrative, and none of these layouts carry bank
 * details, credentials or identity data.
 */

import {
  FAINT,
  INK,
  MUTED,
  PAPER,
  RULE,
  SURFACE,
  badge,
  barcode,
  box,
  cap,
  qr,
  rule,
  txt,
  val,
  type StarterTemplate,
} from "./starterTemplates";
import {
  VTU_AMENDED_RECEIPT_TEMPLATE_SLUG,
  VTU_RECEIPT_LIBRARY_TAG,
  VTU_RECEIPT_TEMPLATE_SLUG,
} from "./vtu";

// ─── Quotation ────────────────────────────────────────────────────────────────

export const quotation: StarterTemplate = {
  slug: "quotation",
  name: "Quotation",
  documentType: "corporate",
  description:
    "A priced proposal with validity window, client details, itemised lines and totals — for review before any order is raised.",
  sensitivity: "standard",
  requiredCredits: 30,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Issuing organisation", default: "Northfold Trading", required: true, maxLength: 40 },
      { id: "quoteNumber", type: "reference", label: "Quotation number", default: "QT-2026-1187", required: true },
      { id: "quoteStatus", type: "status", label: "Status", default: "pending", options: [
        { label: "Draft", value: "draft" },
        { label: "Sent to client", value: "pending" },
        { label: "Accepted", value: "completed" },
        { label: "Expired", value: "expired" },
        { label: "Declined", value: "cancelled" },
      ] },
      { id: "issueDate", type: "date", label: "Issued", default: "2026-09-24", required: true },
      { id: "validUntil", type: "date", label: "Valid until", default: "2026-10-24" },
      { id: "validityTerms", type: "text", label: "Validity terms", default: "Prices held for 30 days", maxLength: 40 },
      { id: "clientName", type: "text", label: "Prepared for", default: "Lakeview Interiors", required: true, maxLength: 36 },
      { id: "clientAddress", type: "textarea", label: "Client address", default: "18 Riverside Way\nNairobi, KE", maxLength: 120 },
      { id: "subject", type: "text", label: "Subject", default: "Fit-out supply package", maxLength: 60 },
      { id: "quoteItem1", type: "text", label: "Line 1", default: "Oak veneer panels (m²)", maxLength: 48 },
      { id: "quoteQty1", type: "number", label: "Qty 1", default: "24", min: 0 },
      { id: "quoteAmount1", type: "currency", label: "Amount 1", currency: "USD", default: "1920.00" },
      { id: "quoteItem2", type: "text", label: "Line 2", default: "Brushed brass handles (set)", maxLength: 48 },
      { id: "quoteQty2", type: "number", label: "Qty 2", default: "60", min: 0 },
      { id: "quoteAmount2", type: "currency", label: "Amount 2", currency: "USD", default: "1440.00" },
      { id: "quoteItem3", type: "text", label: "Line 3", default: "Installation supervision (hr)", maxLength: 48 },
      { id: "quoteQty3", type: "number", label: "Qty 3", default: "12", min: 0 },
      { id: "quoteAmount3", type: "currency", label: "Amount 3", currency: "USD", default: "960.00" },
      { id: "subtotal", type: "currency", label: "Subtotal", currency: "USD", default: "4320.00", required: true },
      { id: "taxRate", type: "number", label: "Tax rate (%)", default: "7.5", min: 0, max: 100 },
      { id: "taxAmount", type: "currency", label: "Tax", currency: "USD", default: "324.00" },
      { id: "total", type: "currency", label: "Quoted total", currency: "USD", default: "4644.00", required: true },
      { id: "notes", type: "textarea", label: "Notes", default: "Includes delivery to site. Excludes weekend access charges.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northfold.example/quotes/QT-2026-1187", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 794,
        height: 1123,
        background: PAPER,
        elements: [
          box(0, 0, 794, 124, "#28504a", 0),
          txt(56, 58, "QUOTATION", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 96, "organization", { size: 22, weight: 800, color: "#ffffff", maxChars: 30 }),
          cap(620, 58, "Quotation number", { color: "#a8eadc", align: "right", w: 118 }),
          val(620, 76, "quoteNumber", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          badge(470, 88, "quoteStatus", { size: 11 }),

          box(56, 164, 682, 86, SURFACE, 14, RULE),
          cap(84, 194, "Issued"),
          val(84, 222, "issueDate", { size: 13.5, weight: 600, color: INK }),
          cap(300, 194, "Valid until"),
          val(300, 222, "validUntil", { size: 13.5, weight: 600, color: INK }),
          cap(520, 194, "Validity"),
          val(520, 222, "validityTerms", { size: 12, color: MUTED, maxChars: 26 }),

          rule(56, 286, 738, 286),
          cap(56, 320, "Prepared for"),
          val(56, 352, "clientName", { size: 16, weight: 700, color: INK, maxChars: 32 }),
          val(56, 376, "clientAddress", { size: 11.5, color: MUTED, maxChars: 62, lineHeight: 15 }),
          cap(420, 320, "Subject"),
          val(420, 352, "subject", { size: 14, weight: 600, color: INK, maxChars: 32 }),

          box(56, 436, 682, 34, "#e5efeb", 6),
          cap(74, 456, "Description", { color: MUTED }),
          cap(520, 456, "Qty", { color: MUTED, align: "right", w: 60 }),
          cap(660, 456, "Amount", { color: MUTED, align: "right", w: 78 }),
          val(74, 498, "quoteItem1", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 498, "quoteQty1", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 498, "quoteAmount1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 516, 738, 516),
          val(74, 546, "quoteItem2", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 546, "quoteQty2", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 546, "quoteAmount2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 564, 738, 564),
          val(74, 594, "quoteItem3", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 594, "quoteQty3", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 594, "quoteAmount3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 612, 738, 612),

          cap(420, 654, "Subtotal"),
          val(660, 654, "subtotal", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(420, 686, "Tax", { size: 12.5, color: MUTED }),
          val(520, 686, "taxRate", { size: 12.5, color: MUTED, align: "right", w: 60 }),
          txt(590, 686, "%", { size: 12.5, color: MUTED }),
          val(660, 686, "taxAmount", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(420, 718, 738, 718, "#91b0a7", 1.5),
          txt(420, 750, "Quoted total", { size: 14, weight: 700, color: INK }),
          val(660, 750, "total", { size: 20, weight: 800, color: INK, align: "right", w: 78 }),

          cap(56, 812, "Notes"),
          box(56, 830, 682, 86, SURFACE, 14, RULE),
          val(80, 862, "notes", { size: 12, color: MUTED, maxChars: 130, lineHeight: 17 }),

          rule(56, 962, 738, 962),
          qr(56, 986, 92, "qrValue"),
          val(180, 1016, "validUntil", { size: 12.5, weight: 700, color: INK }),
          txt(180, 1038, "Prices held until this date", { size: 10.5, color: MUTED }),
          txt(56, 1096, "Illustrative quotation — not an offer to supply", { size: 9.5, color: FAINT }),
        ],
      },
    ],
  },
};

// ─── Delivery note ────────────────────────────────────────────────────────────

export const deliveryNote: StarterTemplate = {
  slug: "delivery-note",
  name: "Delivery Note",
  documentType: "tracking",
  description:
    "Proof-of-delivery paperwork for the receiving dock: what arrived, how many parcels, condition on arrival and who signed.",
  sensitivity: "standard",
  requiredCredits: 25,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Dispatch organisation", default: "Meridian Supply Co.", required: true, maxLength: 40 },
      { id: "noteNumber", type: "reference", label: "Delivery note number", default: "DN-2026-2291", required: true },
      { id: "orderRef", type: "reference", label: "Order reference", default: "PO-2026-4471" },
      { id: "deliveryDate", type: "date", label: "Delivered on", default: "2026-09-26", required: true },
      { id: "carrier", type: "text", label: "Carrier", default: "Coriolis Freight", maxLength: 32 },
      { id: "deliverTo", type: "text", label: "Deliver to", default: "Lakeview Interiors — Site office", maxLength: 36 },
      { id: "deliveryAddress", type: "textarea", label: "Delivery address", default: "18 Riverside Way\nNairobi, KE", maxLength: 120 },
      { id: "receivedBy", type: "text", label: "Received by", default: "Priya Ramanathan", maxLength: 32 },
      { id: "packageCount", type: "number", label: "Packages", default: "3", min: 1, max: 999 },
      { id: "condition", type: "select", label: "Condition on arrival", default: "Good condition", options: [
        { label: "Good condition", value: "Good condition" },
        { label: "Packaging damaged", value: "Packaging damaged" },
        { label: "Short delivery", value: "Short delivery" },
        { label: "Refused", value: "Refused" },
      ] },
      { id: "contents1", type: "text", label: "Item 1", default: "Oak veneer panels", maxLength: 42 },
      { id: "contentsQty1", type: "number", label: "Delivered qty 1", default: "24", min: 0 },
      { id: "contents2", type: "text", label: "Item 2", default: "Brushed brass handles", maxLength: 42 },
      { id: "contentsQty2", type: "number", label: "Delivered qty 2", default: "60", min: 0 },
      { id: "contents3", type: "text", label: "Item 3", default: "Fixings & sealant", maxLength: 42 },
      { id: "contentsQty3", type: "number", label: "Delivered qty 3", default: "12", min: 0 },
      { id: "notes", type: "textarea", label: "Delivery notes", default: "Delivered to the site office between 09:00 and 12:00.\nTwo pallets require a forklift to unload.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "crestline.example/delivery/DN-2026-2291", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 794,
        height: 1123,
        background: PAPER,
        elements: [
          box(0, 0, 794, 120, "#102a28", 0),
          txt(56, 58, "DELIVERY NOTE", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 96, "noteNumber", { size: 24, weight: 800, color: "#ffffff" }),
          cap(620, 58, "Order reference", { color: "#91b0a7", align: "right", w: 118 }),
          val(620, 76, "orderRef", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          val(620, 98, "deliveryDate", { size: 11, color: "#91b0a7", align: "right", w: 118 }),

          box(56, 160, 682, 116, SURFACE, 14, RULE),
          cap(84, 190, "Deliver to"),
          val(84, 220, "deliverTo", { size: 15, weight: 700, color: INK, maxChars: 30 }),
          val(84, 244, "deliveryAddress", { size: 11.5, color: MUTED, maxChars: 54, lineHeight: 16 }),
          cap(486, 190, "Carrier"),
          val(486, 220, "carrier", { size: 13.5, weight: 600, color: INK, maxChars: 22 }),
          cap(486, 250, "Packages"),
          val(486, 262, "packageCount", { size: 15, weight: 800, color: INK }),

          box(56, 296, 682, 74, "#f7faf7", 14, RULE),
          cap(84, 326, "Received by"),
          val(84, 356, "receivedBy", { size: 14, weight: 600, color: INK, maxChars: 24 }),
          cap(380, 326, "Condition on arrival"),
          val(380, 356, "condition", { size: 14, weight: 600, color: INK, maxChars: 20 }),
          cap(600, 326, "Delivered on"),
          val(600, 356, "deliveryDate", { size: 13, weight: 600, color: INK, align: "right", w: 138 }),

          cap(56, 420, "Contents"),
          box(56, 438, 682, 34, "#e5efeb", 6),
          cap(74, 458, "Item", { color: MUTED }),
          cap(660, 458, "Delivered qty", { color: MUTED, align: "right", w: 78 }),
          val(74, 500, "contents1", { size: 13.5, color: INK, maxChars: 44 }),
          val(660, 500, "contentsQty1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 518, 738, 518),
          val(74, 548, "contents2", { size: 13.5, color: INK, maxChars: 44 }),
          val(660, 548, "contentsQty2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 566, 738, 566),
          val(74, 596, "contents3", { size: 13.5, color: INK, maxChars: 44 }),
          val(660, 596, "contentsQty3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 614, 738, 614),

          cap(56, 664, "Delivery notes"),
          box(56, 682, 682, 96, SURFACE, 14, RULE),
          val(80, 714, "notes", { size: 12.5, color: INK, maxChars: 120, lineHeight: 19 }),

          cap(56, 830, "Received by"),
          val(56, 858, "receivedBy", { size: 13, weight: 600, color: INK, maxChars: 28 }),
          rule(56, 876, 320, 876, RULE),
          cap(420, 830, "Carrier signature"),
          rule(420, 876, 738, 876, RULE),

          rule(56, 962, 738, 962),
          barcode(56, 984, "noteNumber", { h: 56, w: 340, color: INK }),
          qr(660, 980, 88, "qrValue"),
          txt(56, 1082, "Quote this delivery note number with any delivery query", { size: 10, color: MUTED }),
        ],
      },
    ],
  },
};

// ─── Statement of account ─────────────────────────────────────────────────────

export const statementOfAccount: StarterTemplate = {
  slug: "statement-of-account",
  name: "Statement of Account",
  documentType: "corporate",
  description:
    "A period summary of documents raised on a trade account: opening balance, entries, amounts paid and the balance due.",
  sensitivity: "standard",
  requiredCredits: 30,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Issuing organisation", default: "Northfold Trading", required: true, maxLength: 40 },
      { id: "statementNumber", type: "reference", label: "Statement number", default: "SOA-2026-0091", required: true },
      { id: "accountName", type: "text", label: "Account", default: "Lakeview Interiors — trade", maxLength: 44 },
      { id: "statementDate", type: "date", label: "Statement date", default: "2026-09-30", required: true },
      { id: "periodStart", type: "date", label: "Period from", default: "2026-09-01" },
      { id: "periodEnd", type: "date", label: "Period to", default: "2026-09-30" },
      { id: "openingBalance", type: "currency", label: "Opening balance", currency: "USD", default: "1240.00" },
      { id: "entryRef1", type: "reference", label: "Entry 1", default: "INV-2026-0774" },
      { id: "entryAmount1", type: "currency", label: "Entry amount 1", currency: "USD", default: "4824.00" },
      { id: "entryRef2", type: "reference", label: "Entry 2", default: "INV-2026-0781" },
      { id: "entryAmount2", type: "currency", label: "Entry amount 2", currency: "USD", default: "1260.50" },
      { id: "entryRef3", type: "reference", label: "Entry 3 (credit note)", default: "CR-2026-0044" },
      { id: "entryAmount3", type: "currency", label: "Entry amount 3", currency: "USD", default: "-3944.00" },
      { id: "totalInvoiced", type: "currency", label: "Total invoiced", currency: "USD", default: "6084.50" },
      { id: "totalPaid", type: "currency", label: "Total paid", currency: "USD", default: "4824.00" },
      { id: "balanceDue", type: "currency", label: "Balance due", currency: "USD", default: "2500.50", required: true },
      { id: "terms", type: "text", label: "Terms", default: "Payment due on receipt of statement", maxLength: 44 },
      { id: "notes", type: "textarea", label: "Notes", default: "Quote the document reference with every payment. Remittance details are shared separately.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northfold.example/statements/SOA-2026-0091", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 794,
        height: 1123,
        background: PAPER,
        elements: [
          box(0, 0, 794, 128, "#102a28", 0),
          txt(56, 60, "STATEMENT OF ACCOUNT", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 98, "organization", { size: 24, weight: 800, color: "#ffffff", maxChars: 28 }),
          cap(620, 60, "Statement number", { color: "#91b0a7", align: "right", w: 118 }),
          val(620, 96, "statementNumber", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),

          box(56, 168, 682, 86, SURFACE, 14, RULE),
          cap(84, 198, "Account"),
          val(84, 226, "accountName", { size: 14, weight: 600, color: INK, maxChars: 32 }),
          cap(520, 198, "Statement date"),
          val(520, 226, "statementDate", { size: 13.5, weight: 600, color: INK, align: "right", w: 154 }),

          cap(56, 276, "Period"),
          val(56, 304, "periodStart", { size: 13, weight: 600, color: INK }),
          txt(176, 304, "to", { size: 12, color: MUTED }),
          val(196, 304, "periodEnd", { size: 13, weight: 600, color: INK }),

          box(56, 346, 682, 132, SURFACE, 16, RULE),
          cap(84, 378, "Balance due"),
          val(84, 424, "balanceDue", { size: 32, weight: 800, color: INK, family: "serif" }),
          cap(560, 378, "Invoiced"),
          val(660, 378, "totalInvoiced", { size: 14, weight: 600, color: INK, align: "right", w: 78 }),
          txt(560, 410, "Paid", { size: 12.5, color: MUTED }),
          val(660, 410, "totalPaid", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(560, 442, "Opening", { size: 12.5, color: MUTED }),
          val(660, 442, "openingBalance", { size: 13.5, color: INK, align: "right", w: 78 }),

          cap(56, 512, "Documents on this statement"),
          box(56, 530, 682, 34, "#e5efeb", 6),
          cap(74, 550, "Reference", { color: MUTED }),
          cap(660, 550, "Amount", { color: MUTED, align: "right", w: 78 }),
          val(74, 592, "entryRef1", { size: 13.5, color: INK }),
          val(660, 592, "entryAmount1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 610, 738, 610),
          val(74, 640, "entryRef2", { size: 13.5, color: INK }),
          val(660, 640, "entryAmount2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 658, 738, 658),
          val(74, 688, "entryRef3", { size: 13.5, color: INK }),
          val(660, 688, "entryAmount3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 706, 738, 706),

          cap(56, 756, "Terms"),
          val(56, 786, "terms", { size: 13, weight: 600, color: INK, maxChars: 42 }),
          cap(56, 822, "Notes"),
          box(56, 840, 682, 86, SURFACE, 14, RULE),
          val(80, 872, "notes", { size: 12, color: MUTED, maxChars: 120, lineHeight: 17 }),

          rule(56, 962, 738, 962),
          qr(56, 986, 92, "qrValue"),
          txt(180, 1016, "Statement of account", { size: 11.5, weight: 600, color: INK }),
          txt(180, 1038, "Amounts are illustrative — no funds move", { size: 10.5, color: MUTED }),
        ],
      },
    ],
  },
};

// ─── Expense claim ────────────────────────────────────────────────────────────

export const expenseClaim: StarterTemplate = {
  slug: "expense-claim",
  name: "Expense Claim",
  documentType: "corporate",
  description:
    "A claimant's reimbursement form: purpose, category, itemised costs, advance received and the reimbursable balance.",
  sensitivity: "standard",
  requiredCredits: 20,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Organisation", default: "Northstar Operations", required: true, maxLength: 40 },
      { id: "claimNumber", type: "reference", label: "Claim number", default: "EXP-2026-0512", required: true },
      { id: "claimStatus", type: "status", label: "Status", default: "pending", options: [
        { label: "Draft", value: "draft" },
        { label: "Submitted", value: "pending" },
        { label: "Approved", value: "completed" },
        { label: "Rejected", value: "failed" },
      ] },
      { id: "claimDate", type: "date", label: "Claim date", default: "2026-09-24", required: true },
      { id: "claimantName", type: "text", label: "Claimant", default: "Maya Thompson", required: true, maxLength: 32 },
      { id: "claimantRole", type: "text", label: "Role", default: "Operations lead", maxLength: 32 },
      { id: "purpose", type: "text", label: "Purpose", default: "Client site visit — Nairobi", maxLength: 60 },
      { id: "category", type: "select", label: "Category", default: "Travel", options: [
        { label: "Travel", value: "Travel" },
        { label: "Equipment", value: "Equipment" },
        { label: "Software", value: "Software" },
        { label: "Meals", value: "Meals" },
        { label: "Other", value: "Other" },
      ] },
      { id: "expense1", type: "text", label: "Expense 1", default: "Flights — return", maxLength: 44 },
      { id: "expenseAmount1", type: "currency", label: "Amount 1", currency: "USD", default: "612.40" },
      { id: "expense2", type: "text", label: "Expense 2", default: "Hotel — 2 nights", maxLength: 44 },
      { id: "expenseAmount2", type: "currency", label: "Amount 2", currency: "USD", default: "318.00" },
      { id: "expense3", type: "text", label: "Expense 3", default: "Ground transport", maxLength: 44 },
      { id: "expenseAmount3", type: "currency", label: "Amount 3", currency: "USD", default: "74.20" },
      { id: "subtotal", type: "currency", label: "Subtotal", currency: "USD", default: "1004.60", required: true },
      { id: "taxAmount", type: "currency", label: "Tax / VAT", currency: "USD", default: "66.50" },
      { id: "total", type: "currency", label: "Total claimed", currency: "USD", default: "1071.10", required: true },
      { id: "advance", type: "currency", label: "Advance received", currency: "USD", default: "300.00" },
      { id: "reimbursable", type: "currency", label: "Reimbursable", currency: "USD", default: "771.10", required: true },
      { id: "approverName", type: "text", label: "Approved by", default: "Amara Cole", maxLength: 32 },
      { id: "approverTitle", type: "text", label: "Approver role", default: "Head of Operations", maxLength: 36 },
      { id: "notes", type: "textarea", label: "Notes", default: "Receipts attached. Mileage claimed at the standard rate.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northstar.example/claims/EXP-2026-0512", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 794,
        height: 1123,
        background: PAPER,
        elements: [
          box(0, 0, 794, 120, "#102a28", 0),
          txt(56, 58, "EXPENSE CLAIM", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 96, "organization", { size: 22, weight: 800, color: "#ffffff", maxChars: 30 }),
          cap(620, 58, "Claim number", { color: "#91b0a7", align: "right", w: 118 }),
          val(620, 76, "claimNumber", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          badge(470, 88, "claimStatus", { size: 11 }),

          box(56, 160, 682, 96, SURFACE, 14, RULE),
          cap(84, 190, "Claimant"),
          val(84, 220, "claimantName", { size: 15, weight: 700, color: INK, maxChars: 24 }),
          val(84, 242, "claimantRole", { size: 11.5, color: MUTED, maxChars: 24 }),
          cap(300, 190, "Claim date"),
          val(300, 220, "claimDate", { size: 13.5, weight: 600, color: INK }),
          cap(484, 190, "Category"),
          val(484, 220, "category", { size: 13.5, weight: 600, color: INK, maxChars: 16 }),

          cap(56, 290, "Purpose"),
          val(56, 318, "purpose", { size: 15, weight: 600, color: INK, maxChars: 46 }),
          rule(56, 342, 738, 342),

          box(56, 366, 682, 34, "#e5efeb", 6),
          cap(74, 386, "Expense", { color: MUTED }),
          cap(660, 386, "Amount", { color: MUTED, align: "right", w: 78 }),
          val(74, 428, "expense1", { size: 13.5, color: INK, maxChars: 44 }),
          val(660, 428, "expenseAmount1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 446, 738, 446),
          val(74, 476, "expense2", { size: 13.5, color: INK, maxChars: 44 }),
          val(660, 476, "expenseAmount2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 494, 738, 494),
          val(74, 524, "expense3", { size: 13.5, color: INK, maxChars: 44 }),
          val(660, 524, "expenseAmount3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 542, 738, 542),

          cap(420, 584, "Subtotal"),
          val(660, 584, "subtotal", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(420, 616, "Tax / VAT", { size: 12.5, color: MUTED }),
          val(660, 616, "taxAmount", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(420, 644, 738, 644, RULE),
          txt(420, 674, "Total claimed", { size: 13.5, weight: 700, color: INK }),
          val(660, 674, "total", { size: 15, weight: 700, color: INK, align: "right", w: 78 }),
          txt(420, 706, "Advance received", { size: 12.5, color: MUTED }),
          val(660, 706, "advance", { size: 13.5, color: MUTED, align: "right", w: 78 }),
          rule(420, 730, 738, 730, "#91b0a7", 1.5),
          txt(420, 760, "Reimbursable", { size: 14, weight: 700, color: INK }),
          val(660, 760, "reimbursable", { size: 20, weight: 800, color: INK, align: "right", w: 78 }),

          cap(56, 812, "Notes"),
          box(56, 830, 420, 96, SURFACE, 14, RULE),
          val(80, 862, "notes", { size: 12, color: MUTED, maxChars: 62, lineHeight: 18 }),

          cap(56, 962, "Approved by"),
          rule(56, 1010, 320, 1010, RULE),
          val(56, 1038, "approverName", { size: 13.5, weight: 700, color: INK, maxChars: 26 }),
          val(56, 1060, "approverTitle", { size: 11.5, color: MUTED, maxChars: 32 }),

          cap(516, 962, "Verify"),
          qr(516, 986, 96, "qrValue"),
          txt(516, 1098, "Scan to check this claim", { size: 10, color: MUTED }),
        ],
      },
    ],
  },
};

// ─── Item schedule (long lists of rows) ───────────────────────────────────────

export const itemSchedule: StarterTemplate = {
  slug: "item-schedule",
  name: "Item Schedule",
  documentType: "corporate",
  description:
    "A ten-row schedule for longer lists: paste a CSV or bulleted list of items and every line lands in its own row, with totals.",
  sensitivity: "standard",
  requiredCredits: 25,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Organisation", default: "Northfold Trading", required: true, maxLength: 40 },
      { id: "scheduleNumber", type: "reference", label: "Schedule number", default: "SCH-2026-0310", required: true },
      { id: "preparedFor", type: "text", label: "Prepared for", default: "Lakeview Interiors", maxLength: 32 },
      { id: "scheduleDate", type: "date", label: "Date", default: "2026-09-24" },
      { id: "reference", type: "text", label: "Reference", default: "NF/2026/114", maxLength: 40 },
      { id: "currencyCode", type: "select", label: "Currency", default: "USD", options: [
        { label: "USD", value: "USD" },
        { label: "EUR", value: "EUR" },
        { label: "GBP", value: "GBP" },
        { label: "NGN", value: "NGN" },
      ] },
      { id: "schedule1", type: "text", label: "Row 1", default: "Oak veneer panels (m²)", maxLength: 64 },
      { id: "scheduleQty1", type: "number", label: "Row 1 qty", default: "24", min: 0 },
      { id: "scheduleAmount1", type: "currency", label: "Row 1 amount", currency: "USD", default: "1920.00" },
      { id: "schedule2", type: "text", label: "Row 2", default: "Brushed brass handles (set)", maxLength: 64 },
      { id: "scheduleQty2", type: "number", label: "Row 2 qty", default: "60", min: 0 },
      { id: "scheduleAmount2", type: "currency", label: "Row 2 amount", currency: "USD", default: "1440.00" },
      { id: "schedule3", type: "text", label: "Row 3", default: "Installation supervision (hr)", maxLength: 64 },
      { id: "scheduleQty3", type: "number", label: "Row 3 qty", default: "12", min: 0 },
      { id: "scheduleAmount3", type: "currency", label: "Row 3 amount", currency: "USD", default: "960.00" },
      { id: "schedule4", type: "text", label: "Row 4", default: "Edge trim profiles", maxLength: 64 },
      { id: "scheduleQty4", type: "number", label: "Row 4 qty", default: "18", min: 0 },
      { id: "scheduleAmount4", type: "currency", label: "Row 4 amount", currency: "USD", default: "360.00" },
      { id: "schedule5", type: "text", label: "Row 5", default: "Sealant cartridges", maxLength: 64 },
      { id: "scheduleQty5", type: "number", label: "Row 5 qty", default: "24", min: 0 },
      { id: "scheduleAmount5", type: "currency", label: "Row 5 amount", currency: "USD", default: "192.00" },
      { id: "schedule6", type: "text", label: "Row 6", default: "Protective film (roll)", maxLength: 64 },
      { id: "scheduleQty6", type: "number", label: "Row 6 qty", default: "6", min: 0 },
      { id: "scheduleAmount6", type: "currency", label: "Row 6 amount", currency: "USD", default: "148.00" },
      { id: "schedule7", type: "text", label: "Row 7", default: "Delivery crates", maxLength: 64 },
      { id: "scheduleQty7", type: "number", label: "Row 7 qty", default: "4", min: 0 },
      { id: "scheduleAmount7", type: "currency", label: "Row 7 amount", currency: "USD", default: "220.00" },
      { id: "schedule8", type: "text", label: "Row 8", default: "Installation fixings", maxLength: 64 },
      { id: "scheduleQty8", type: "number", label: "Row 8 qty", default: "40", min: 0 },
      { id: "scheduleAmount8", type: "currency", label: "Row 8 amount", currency: "USD", default: "320.00" },
      { id: "schedule9", type: "text", label: "Row 9", default: "Site signage", maxLength: 64 },
      { id: "scheduleQty9", type: "number", label: "Row 9 qty", default: "2", min: 0 },
      { id: "scheduleAmount9", type: "currency", label: "Row 9 amount", currency: "USD", default: "96.00" },
      { id: "schedule10", type: "text", label: "Row 10", default: "Waste removal", maxLength: 64 },
      { id: "scheduleQty10", type: "number", label: "Row 10 qty", default: "1", min: 0 },
      { id: "scheduleAmount10", type: "currency", label: "Row 10 amount", currency: "USD", default: "180.00" },
      { id: "subtotal", type: "currency", label: "Subtotal", currency: "USD", default: "5836.00" },
      { id: "taxRate", type: "number", label: "Tax rate (%)", default: "7.5", min: 0, max: 100 },
      { id: "taxAmount", type: "currency", label: "Tax", currency: "USD", default: "437.70" },
      { id: "total", type: "currency", label: "Total", currency: "USD", default: "6273.70", required: true },
      { id: "notes", type: "textarea", label: "Notes", default: "Rows past the tenth are listed on a continuation schedule.", maxLength: 200 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 1123,
        height: 794,
        background: PAPER,
        elements: [
          box(0, 0, 1123, 104, "#102a28", 0),
          txt(48, 52, "ITEM SCHEDULE", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(48, 84, "organization", { size: 20, weight: 800, color: "#ffffff", maxChars: 34 }),
          cap(885, 52, "Schedule number", { color: "#91b0a7", align: "right", w: 190 }),
          val(885, 80, "scheduleNumber", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 190 }),

          box(48, 136, 1027, 64, SURFACE, 12, RULE),
          cap(72, 162, "Prepared for"),
          val(72, 186, "preparedFor", { size: 13.5, weight: 600, color: INK, maxChars: 30 }),
          cap(420, 162, "Date"),
          val(420, 186, "scheduleDate", { size: 13.5, weight: 600, color: INK }),
          cap(640, 162, "Reference"),
          val(640, 186, "reference", { size: 13, weight: 600, color: INK, maxChars: 26 }),
          cap(940, 162, "Currency"),
          val(940, 186, "currencyCode", { size: 13.5, weight: 600, color: INK }),

          box(48, 220, 1027, 30, "#e5efeb", 6),
          cap(64, 238, "Description", { color: MUTED }),
          cap(820, 238, "Qty", { color: MUTED, align: "right", w: 60 }),
          cap(979, 238, "Amount", { color: MUTED, align: "right", w: 96 }),

          val(64, 268, "schedule1", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 268, "scheduleQty1", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 268, "scheduleAmount1", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 282, 1075, 282),
          val(64, 300, "schedule2", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 300, "scheduleQty2", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 300, "scheduleAmount2", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 314, 1075, 314),
          val(64, 332, "schedule3", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 332, "scheduleQty3", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 332, "scheduleAmount3", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 346, 1075, 346),
          val(64, 364, "schedule4", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 364, "scheduleQty4", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 364, "scheduleAmount4", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 378, 1075, 378),
          val(64, 396, "schedule5", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 396, "scheduleQty5", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 396, "scheduleAmount5", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 410, 1075, 410),
          val(64, 428, "schedule6", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 428, "scheduleQty6", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 428, "scheduleAmount6", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 442, 1075, 442),
          val(64, 460, "schedule7", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 460, "scheduleQty7", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 460, "scheduleAmount7", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 474, 1075, 474),
          val(64, 492, "schedule8", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 492, "scheduleQty8", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 492, "scheduleAmount8", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 506, 1075, 506),
          val(64, 524, "schedule9", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 524, "scheduleQty9", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 524, "scheduleAmount9", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 538, 1075, 538),
          val(64, 556, "schedule10", { size: 12.5, color: INK, maxChars: 64 }),
          val(820, 556, "scheduleQty10", { size: 12.5, color: INK, align: "right", w: 60 }),
          val(979, 556, "scheduleAmount10", { size: 12.5, color: INK, align: "right", w: 96 }),
          rule(48, 570, 1075, 570),

          cap(820, 604, "Subtotal"),
          val(979, 604, "subtotal", { size: 13.5, color: INK, align: "right", w: 96 }),
          txt(820, 632, "Tax", { size: 12.5, color: MUTED }),
          val(940, 632, "taxRate", { size: 12.5, color: MUTED, align: "right", w: 60 }),
          txt(1004, 632, "%", { size: 12.5, color: MUTED }),
          val(979, 632, "taxAmount", { size: 13.5, color: INK, align: "right", w: 96 }),
          rule(820, 650, 1075, 650, "#91b0a7", 1.5),
          txt(820, 676, "Total", { size: 13, weight: 700, color: INK }),
          val(979, 676, "total", { size: 17, weight: 800, color: INK, align: "right", w: 96 }),

          cap(48, 604, "Notes"),
          box(48, 622, 720, 82, SURFACE, 12, RULE),
          val(68, 652, "notes", { size: 12, color: MUTED, maxChars: 120, lineHeight: 17 }),

          rule(48, 724, 1075, 724),
          val(48, 750, "scheduleNumber", { size: 11, weight: 700, color: MUTED }),
          txt(48, 770, "Illustrative item schedule — amounts for review", { size: 9.5, color: FAINT }),
          txt(965, 770, "Page 1 of 1", { size: 9, color: FAINT, align: "right", w: 110 }),
        ],
      },
    ],
  },
};

// ─── Payment receipt (VTU purchases) ──────────────────────────────────────────
//
// One reasoning block for BOTH receipt templates below, because they differ in
// copy and in one notice strip and in nothing else:
//
// NOT BILLABLE. Every other template in this file SELLS a document. These two
// record money the customer has already spent, and charging for the paperwork
// that proves a charge is a loop with no good answer. `billable: false` is
// honoured at creation, at render and in the quote — see `resolveDocumentCost`.
//
// FILED UNDER `financial`, TAGGED `vtu_receipt`. The templates belong on the
// financial shelf with the rest of the payment paperwork. The DOCUMENTS they
// produce carry the tag instead, which is what keeps them out of the customer's
// document library: a receipt is something the platform issues, not something
// the customer made, and a library that fills up with receipts as you use the
// product stops being a library of your work.
//
// EVERY FIELD IS HIDDEN AND REQUIRED, WITH NO DEFAULT, and that pairing is
// load-bearing. A hidden field is absent from the rendered form, and an absent
// value fails `validateValues` — so a receipt can only be produced by the
// server-side generator that fills these from the transaction record. Nobody can
// hand-type a receipt, and a blank one cannot render, because "no value" is not
// a value these fields accept.
//
// NO EXTERNAL ASSETS, like every other template here: text, rules, panels and a
// QR module, and nothing else. Nothing fetches a font or an image at render
// time, so a receipt opened in five years, with the network unplugged, looks
// exactly like the one issued today.
//
// THE `status` FIELD CARRIES THE CUSTOMER-FACING WORDS, NOT THE INTERNAL ENUM.
// A receipt is a record of what the customer was TOLD at the time, pinned when
// the document is generated and never recomputed — the same doctrine the rate
// snapshot follows. That is also why a later reversal issues the amended
// sibling instead of editing this one: the first receipt is not wrong, it is
// superseded, and both remain true statements about when they were issued.

/**
 * The receipt a VTU purchase is owed.
 *
 * Layout is a 420×740 slip rather than a page: it is read on a phone, and a
 * receipt that has to be pinch-zoomed to find the amount has failed at the one
 * thing it is for.
 */
export const vtuReceipt: StarterTemplate = {
  slug: VTU_RECEIPT_TEMPLATE_SLUG,
  name: "Payment Receipt",
  documentType: "financial",
  description:
    "The record of a completed airtime or bill payment: what was bought, the number it went to, the rate frozen at purchase and the reference the provider issued.",
  sensitivity: "standard",
  requiredCredits: 0,
  billable: false,
  libraryTag: VTU_RECEIPT_LIBRARY_TAG,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "issuer", type: "text", label: "Issued by", required: true, hidden: true, maxLength: 30 },
      { id: "receiptNumber", type: "reference", label: "Receipt number", required: true, hidden: true },
      {
        id: "issuedOn",
        type: "datetime",
        label: "Receipt issued",
        required: true,
        hidden: true,
        // ISO-8601 WITH an offset. The renderer formats through `new Date`, so
        // an offsetless string would be read as the viewer's local time and the
        // same receipt would show a different clock depending on who opens it.
        help: "ISO-8601 instant, e.g. 2026-09-28T14:05:00+01:00",
      },
      { id: "serviceName", type: "text", label: "Service", required: true, hidden: true, maxLength: 40 },
      { id: "destination", type: "text", label: "Destination (masked)", required: true, hidden: true, maxLength: 24 },
      { id: "ngnPerPoint", type: "number", label: "Naira per point", required: true, hidden: true },
      { id: "status", type: "text", label: "Status as shown to the customer", required: true, hidden: true, maxLength: 32 },
      { id: "providerReference", type: "text", label: "Provider reference", required: false, hidden: true, maxLength: 40 },
      {
        id: "settledAt",
        type: "datetime",
        label: "Settled at",
        required: false,
        hidden: true,
        help: "Absent while the transaction is still awaiting a verdict from the provider.",
      },
      { id: "statusDetail", type: "text", label: "Status explanation", required: true, hidden: true, maxLength: 180 },
      { id: "amountPaid", type: "currency", currency: "NGN", label: "Amount paid", required: true, hidden: true },
      { id: "pointsDebited", type: "number", label: "Points debited", required: true, hidden: true },
      { id: "qrValue", type: "text", label: "QR payload", required: true, hidden: true, maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 420,
        height: 740,
        background: PAPER,
        elements: [
          box(0, 0, 420, 112, "#28504a", 0),
          txt(30, 52, "PAYMENT RECEIPT", { size: 10, weight: 700, color: "#a8eadc", letterSpacing: 2.8 }),
          val(30, 82, "issuer", { size: 18, weight: 800, color: "#ffffff", maxChars: 24 }),
          cap(240, 52, "Receipt no", { color: "#a8eadc", align: "right", w: 150 }),
          val(240, 72, "receiptNumber", { size: 12, weight: 700, color: "#ffffff", align: "right", w: 150, maxChars: 22 }),
          val(240, 92, "issuedOn", { size: 9.5, color: "#cfe9e1", align: "right", w: 150, maxChars: 30 }),

          box(30, 142, 360, 92, SURFACE, 14, RULE),
          cap(52, 168, "Amount paid"),
          val(52, 198, "amountPaid", { size: 26, weight: 800, color: INK }),
          cap(238, 168, "Points debited", { align: "right", w: 130 }),
          val(238, 192, "pointsDebited", { size: 17, weight: 700, color: INK, align: "right", w: 130, maxChars: 12 }),
          txt(238, 214, "from your points balance", { size: 9.5, color: MUTED, align: "right", w: 130 }),

          rule(30, 268, 390, 268),
          cap(30, 292, "Service"),
          val(30, 314, "serviceName", { size: 13.5, weight: 600, color: INK, maxChars: 24 }),
          cap(220, 292, "Rate at purchase"),
          val(220, 314, "ngnPerPoint", { size: 13.5, color: INK, maxChars: 10 }),
          txt(220, 332, "naira per point", { size: 9, color: MUTED }),

          cap(30, 360, "Destination"),
          val(30, 382, "destination", { size: 13.5, weight: 600, color: INK, maxChars: 24 }),
          cap(220, 360, "Status"),
          val(220, 382, "status", { size: 13.5, weight: 600, color: INK, maxChars: 26 }),

          cap(30, 428, "Provider reference"),
          val(30, 450, "providerReference", { size: 12, color: MUTED, maxChars: 30 }),
          cap(220, 428, "Settled"),
          val(220, 450, "settledAt", { size: 11, color: INK, maxChars: 30 }),

          box(30, 486, 360, 78, SURFACE, 12, RULE),
          // Pre-wrapped by the generator at roughly one line per 70 characters:
          // the renderer breaks on newlines and does not word-wrap, so an
          // unwrapped sentence would run off the panel rather than reflow.
          val(48, 512, "statusDetail", { size: 10.5, color: MUTED, maxChars: 150, lineHeight: 14 }),

          rule(30, 590, 390, 590),
          qr(30, 610, 86, "qrValue"),
          val(132, 640, "receiptNumber", { size: 11, weight: 700, color: INK, maxChars: 22 }),
          txt(132, 660, "Scan to verify this receipt", { size: 10, color: MUTED }),
          txt(30, 716, "Amounts and rates are frozen at purchase.", { size: 9, color: FAINT, maxChars: 80 }),
        ],
      },
    ],
  },
};

/**
 * The receipt issued after a reversal.
 *
 * A SIBLING, not a mutated original. The first receipt is immutable — it may
 * already have been downloaded, forwarded or filed — so a reversal issues a
 * second document that names the first as the one it supersedes. A template
 * variant keyed on `reversalReason` was the alternative and was rejected: it
 * would have to render for every reason, including ones it has no sensible copy
 * for, and "generate nothing" is not a receipt.
 */
export const vtuAmendedReceipt: StarterTemplate = {
  slug: VTU_AMENDED_RECEIPT_TEMPLATE_SLUG,
  name: "Payment Receipt (Amended)",
  documentType: "financial",
  description:
    "Issued when a purchase that already had a receipt was later refunded. Names the receipt it replaces and keeps the original untouched.",
  sensitivity: "standard",
  requiredCredits: 0,
  billable: false,
  libraryTag: VTU_RECEIPT_LIBRARY_TAG,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "issuer", type: "text", label: "Issued by", required: true, hidden: true, maxLength: 30 },
      { id: "receiptNumber", type: "reference", label: "Receipt number", required: true, hidden: true },
      { id: "amendsReceiptNumber", type: "reference", label: "Receipt this replaces", required: true, hidden: true },
      {
        id: "issuedOn",
        type: "datetime",
        label: "Receipt issued",
        required: true,
        hidden: true,
        help: "ISO-8601 instant, e.g. 2026-09-28T14:05:00+01:00",
      },
      { id: "serviceName", type: "text", label: "Service", required: true, hidden: true, maxLength: 40 },
      { id: "destination", type: "text", label: "Destination (masked)", required: true, hidden: true, maxLength: 24 },
      { id: "ngnPerPoint", type: "number", label: "Naira per point", required: true, hidden: true },
      { id: "status", type: "text", label: "Status as shown to the customer", required: true, hidden: true, maxLength: 32 },
      { id: "providerReference", type: "text", label: "Provider reference", required: false, hidden: true, maxLength: 40 },
      {
        id: "settledAt",
        type: "datetime",
        label: "Settled at",
        required: false,
        hidden: true,
        help: "Absent while the transaction is still awaiting a verdict from the provider.",
      },
      { id: "statusDetail", type: "text", label: "Status explanation", required: true, hidden: true, maxLength: 180 },
      { id: "amountPaid", type: "currency", currency: "NGN", label: "Amount paid", required: true, hidden: true },
      { id: "pointsDebited", type: "number", label: "Points debited", required: true, hidden: true },
      { id: "qrValue", type: "text", label: "QR payload", required: true, hidden: true, maxLength: 120 },
      { id: "amendmentNote", type: "text", label: "What changed", required: true, hidden: true, maxLength: 130 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 420,
        height: 800,
        background: PAPER,
        elements: [
          box(0, 0, 420, 112, "#28504a", 0),
          txt(30, 52, "AMENDED RECEIPT", { size: 10, weight: 700, color: "#a8eadc", letterSpacing: 2.8 }),
          val(30, 82, "issuer", { size: 18, weight: 800, color: "#ffffff", maxChars: 24 }),
          cap(240, 52, "Replaces", { color: "#a8eadc", align: "right", w: 150 }),
          val(240, 72, "amendsReceiptNumber", { size: 12, weight: 700, color: "#ffffff", align: "right", w: 150, maxChars: 22 }),
          val(240, 92, "issuedOn", { size: 9.5, color: "#cfe9e1", align: "right", w: 150, maxChars: 30 }),

          // The one strip the original does not have, and deliberately the most
          // contrast on the page: a customer who has both documents open needs
          // to see at a glance which one is current.
          box(30, 132, 360, 70, "#fdf3e3", 12, "#e7d3ae"),
          txt(48, 156, "This receipt replaces", { size: 9.5, weight: 700, color: "#8a5a12", uppercase: true, letterSpacing: 1.4 }),
          val(48, 180, "amendmentNote", { size: 10.5, color: "#7a4f10", maxChars: 130, lineHeight: 14 }),

          box(30, 218, 360, 92, SURFACE, 14, RULE),
          cap(52, 244, "Amount paid"),
          val(52, 274, "amountPaid", { size: 26, weight: 800, color: INK }),
          cap(238, 244, "Points refunded", { align: "right", w: 130 }),
          val(238, 268, "pointsDebited", { size: 17, weight: 700, color: INK, align: "right", w: 130, maxChars: 12 }),
          txt(238, 290, "back on your balance", { size: 9.5, color: MUTED, align: "right", w: 130 }),

          rule(30, 344, 390, 344),
          cap(30, 368, "Service"),
          val(30, 390, "serviceName", { size: 13.5, weight: 600, color: INK, maxChars: 24 }),
          cap(220, 368, "Rate at purchase"),
          val(220, 390, "ngnPerPoint", { size: 13.5, color: INK, maxChars: 10 }),
          txt(220, 408, "naira per point", { size: 9, color: MUTED }),

          cap(30, 436, "Destination"),
          val(30, 458, "destination", { size: 13.5, weight: 600, color: INK, maxChars: 24 }),
          cap(220, 436, "Status"),
          val(220, 458, "status", { size: 13.5, weight: 600, color: INK, maxChars: 26 }),

          cap(30, 504, "Provider reference"),
          val(30, 526, "providerReference", { size: 12, color: MUTED, maxChars: 30 }),
          cap(220, 504, "Settled"),
          val(220, 526, "settledAt", { size: 11, color: INK, maxChars: 30 }),

          box(30, 562, 360, 78, SURFACE, 12, RULE),
          val(48, 588, "statusDetail", { size: 10.5, color: MUTED, maxChars: 150, lineHeight: 14 }),

          rule(30, 666, 390, 666),
          qr(30, 686, 86, "qrValue"),
          val(132, 716, "receiptNumber", { size: 11, weight: 700, color: INK, maxChars: 22 }),
          txt(132, 736, "Scan to verify this receipt", { size: 10, color: MUTED }),
          txt(30, 780, "Amounts and rates are frozen at purchase.", { size: 9, color: FAINT, maxChars: 80 }),
        ],
      },
    ],
  },
};

export const COMMERCIAL_TEMPLATES: StarterTemplate[] = [
  quotation,
  deliveryNote,
  statementOfAccount,
  expenseClaim,
  itemSchedule,
  vtuReceipt,
  vtuAmendedReceipt,
];
