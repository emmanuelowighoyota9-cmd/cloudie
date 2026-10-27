/**
 * Cloudie starter templates.
 *
 * Plain data: each entry is a complete, validated template definition
 * (schema + layout configuration) that the platform seeds so the document
 * library is useful on day one. Imported by BOTH the Convex seeder and the
 * frontend preview, so nothing here may touch the DOM or the network.
 *
 * Every template is deliberately fictional: names, accounts, references and
 * amounts are illustrative.
 */

import type {
  CategoryKey,
  TemplateConfiguration,
  TemplateSchema,
} from "./docTemplateEngine";

export interface StarterTemplate {
  slug: string;
  name: string;
  documentType: CategoryKey;
  description: string;
  sensitivity: "standard" | "sensitive";
  requiredCredits: number;
  supportedFormats: string[];
  /**
   * Whether documents made from this template cost the customer anything.
   *
   * ABSENT MEANS BILLABLE, so every template written before this flag existed
   * keeps its behaviour exactly. `false` zeroes creation, re-render and the
   * render quote alike — see `resolveDocumentCost`, which is the only place the
   * flag is read.
   *
   * It exists for documents the platform OWES the customer rather than sells
   * them. The VTU receipt is the first: charging a customer for the record of a
   * charge they have already paid is a loop nobody should have to reason about.
   */
  billable?: boolean;
  /**
   * Value written to a generated document's `metadata.category`, when it has to
   * differ from the template's own `documentType`.
   *
   * Two different questions, deliberately answered separately: `documentType`
   * says which SHELF the template sits on in the library, while this says which
   * tag its DOCUMENTS carry. A receipt is a financial document and belongs on
   * the financial shelf, but it is not something the customer made, so it is
   * tagged out of the document library instead of hiding the whole shelf.
   *
   * This is why the flag exists rather than a new `CategoryKey`: `CategoryKey`
   * is a public vocabulary that the category list, the template editor and every
   * iterator over categories move together with, and widening it to keep one
   * document out of one list would be cosmetic churn with real reach.
   */
  libraryTag?: string;
  schema: TemplateSchema;
  configuration: TemplateConfiguration;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

export const INK = "#102b28";
export const MUTED = "#5c7771";
export const FAINT = "#739a91";
export const RULE = "#cbded8";
export const PAPER = "#ffffff";
export const SURFACE = "#f2f7f4";

// ─── Element builders (kept terse; all return LayoutElement) ──────────────────

export type El = TemplateConfiguration["pages"][number]["elements"][number];

export function txt(x: number, y: number, text: string, opts: Record<string, unknown> = {}): El {
  return { kind: "text", x, y, text, ...opts } as El;
}

export function val(x: number, y: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "text", x, y, bind, ...opts } as El;
}

export function cap(x: number, y: number, text: string, opts: Record<string, unknown> = {}): El {
  return {
    kind: "text", x, y, text, size: 9.5, weight: 700, color: FAINT,
    uppercase: true, letterSpacing: 1.4, ...opts,
  } as El;
}

export function box(
  x: number, y: number, w: number, h: number,
  fill: string, rx = 14, stroke?: string,
): El {
  return { kind: "rect", x, y, w, h, fill, rx, ...(stroke ? { stroke, strokeWidth: 1 } : {}) } as El;
}

export function rule(x1: number, y1: number, x2: number, y2: number, stroke = RULE, strokeWidth = 1): El {
  return { kind: "line", x1, y1, x2, y2, stroke, strokeWidth } as El;
}

export function badge(x: number, y: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "badge", x, y, bind, ...opts } as El;
}

export function qr(x: number, y: number, size: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "qr", x, y, size, bind, ...opts } as El;
}

export function barcode(x: number, y: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "barcode", x, y, bind, ...opts } as El;
}

// ─── 1. Banking interface mockup ──────────────────────────────────
// (Templates 8-11 live in ./commercialTemplates.ts; the set below is the base.)

const bankingDashboard: StarterTemplate = {
  slug: "banking-dashboard-mockup",
  name: "Banking Dashboard Mockup",
  documentType: "banking_ui",
  description:
    "A dark, realistic digital-banking dashboard screen for design reviews, QA fixtures and interface training. All data is fictional.",
  sensitivity: "standard",
  requiredCredits: 45,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "bankName", type: "text", label: "Institution name", default: "Northwind Trust", required: true, maxLength: 40 },
      { id: "accountHolder", type: "text", label: "Account holder", default: "ALEX MERCER", required: true, maxLength: 40 },
      { id: "accountNumber", type: "reference", label: "Account number", default: "ACCT-0000-0001", required: true },
      { id: "balance", type: "currency", label: "Available balance", currency: "USD", default: "24850.75", required: true },
      { id: "cardLabel", type: "text", label: "Balance caption", default: "Total available", maxLength: 32 },
      { id: "cardBrand", type: "select", label: "Card network", default: "Debit", options: [
        { label: "Debit", value: "Debit" },
        { label: "Credit", value: "Credit" },
        { label: "Prepaid", value: "Prepaid" },
      ] },
      { id: "accountStatus", type: "status", label: "Account status", default: "active", options: [
        { label: "Active", value: "active" },
        { label: "Pending", value: "pending" },
        { label: "Frozen", value: "failed" },
      ] },
      { id: "tx1Label", type: "text", label: "Transaction 1", default: "Aurora Grocers", maxLength: 34 },
      { id: "tx1Amount", type: "currency", label: "Amount 1", currency: "USD", default: "-84.20" },
      { id: "tx2Label", type: "text", label: "Transaction 2", default: "Halcyon Energy", maxLength: 34 },
      { id: "tx2Amount", type: "currency", label: "Amount 2", currency: "USD", default: "-212.06" },
      { id: "tx3Label", type: "text", label: "Transaction 3", default: "Salary — Lumen Ltd", maxLength: 34 },
      { id: "tx3Amount", type: "currency", label: "Amount 3", currency: "USD", default: "4200.00" },
      { id: "chartLabel", type: "text", label: "Chart caption", default: "Spending · last 6 months", maxLength: 40 },
      { id: "themeColor", type: "color", label: "Surface color", default: "#0b211e" },
      { id: "accentColor", type: "color", label: "Accent color", default: "#64d6c3" },
      { id: "qrValue", type: "text", label: "QR payload", default: "northwind.example/dashboard/0001", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 1000,
        height: 620,
        background: "#071513",
        elements: [
          box(0, 0, 1000, 620, "#071513", 0),
          // Left navigation rail
          box(0, 0, 92, 620, "#0b211e", 0),
          box(26, 34, 40, 40, "#64d6c3", 12),
          txt(38, 60, "N", { size: 20, weight: 800, color: "#0b211e" }),
          box(30, 104, 32, 8, "#31524e", 4),
          box(30, 136, 32, 8, "#64d6c3", 4),
          box(30, 168, 32, 8, "#31524e", 4),
          box(30, 200, 32, 8, "#31524e", 4),
          box(30, 232, 32, 8, "#31524e", 4),
          // Header
          cap(130, 48, "Institution", { color: "#52756d" }),
          val(130, 74, "bankName", { size: 22, weight: 700, color: "#eaf7f1" }),
          val(760, 74, "accountNumber", { size: 12, color: "#5c7771", align: "right", w: 116 }),
          box(600, 92, 276, 1, "#28504a", 0),
          // Balance panel
          box(130, 118, 452, 190, "#102a28", 20, "#28504a"),
          val(158, 160, "cardLabel", { size: 11, color: "#5c7771" }),
          box(158, 190, 396, 1, "#28504a", 0),
          val(158, 246, "balance", { size: 42, weight: 800, color: "#ffffff", family: "serif" }),
          val(158, 276, "cardBrand", { size: 12, color: "#91b0a7", letterSpacing: 2, uppercase: true }),
          badge(452, 130, "accountStatus", { size: 11 }),
          // Side stats
          box(604, 118, 272, 88, "#102a28", 20, "#28504a"),
          cap(628, 148, "Transaction 3", { color: "#52756d" }),
          val(628, 176, "tx3Label", { size: 14, color: "#eaf7f1", weight: 600, maxChars: 30 }),
          val(628, 198, "tx3Amount", { size: 13, color: "#9fce8a", weight: 700 }),
          box(604, 220, 272, 88, "#102a28", 20, "#28504a"),
          txt(628, 250, "Instant transfer", { size: 13, weight: 600, color: "#eaf7f1" }),
          txt(628, 272, "No fees until Friday", { size: 11, color: "#52756d" }),
          box(628, 284, 96, 16, "#64d6c3", 8),
          txt(642, 296, "Send", { size: 10, weight: 700, color: "#0b211e" }),
          // Chart
          val(130, 344, "chartLabel", { size: 9.5, weight: 700, color: "#5c7771", letterSpacing: 1.2, uppercase: true }),
          box(130, 366, 746, 1, "#28504a", 0),
          box(146, 400, 46, 92, "#28504a", 6),
          box(216, 372, 46, 120, "#28504a", 6),
          box(286, 418, 46, 74, "#28504a", 6),
          box(356, 392, 46, 100, "#64d6c3", 6),
          box(426, 358, 46, 134, "#28504a", 6),
          box(496, 404, 46, 88, "#28504a", 6),
          // Ledger rows
          box(604, 372, 272, 1, "#28504a", 0),
          cap(604, 404, "Recent activity", { color: "#52756d" }),
          val(604, 436, "tx1Label", { size: 12.5, color: "#cbded8", maxChars: 26 }),
          val(820, 436, "tx1Amount", { size: 12.5, color: "#ee8478", align: "right", w: 56 }),
          rule(604, 452, 876, 452, "#28504a"),
          val(604, 480, "tx2Label", { size: 12.5, color: "#cbded8", maxChars: 26 }),
          val(820, 480, "tx2Amount", { size: 12.5, color: "#ee8478", align: "right", w: 56 }),
          rule(604, 496, 876, 496, "#28504a"),
          val(604, 524, "tx3Label", { size: 12.5, color: "#cbded8", maxChars: 26 }),
          val(820, 524, "tx3Amount", { size: 12.5, color: "#9fce8a", align: "right", w: 56 }),
          rule(604, 540, 876, 540, "#28504a"),
          qr(146, 512, 78, "qrValue", { color: "#eaf7f1", bg: "#0b211e" }),
          txt(238, 536, "Scan to open the", { size: 10, color: "#52756d" }),
          txt(238, 552, "dashboard in the app", { size: 10, color: "#52756d" }),
        ],
      },
    ],
  },
};

// ─── 2. Flight itinerary ──────────────────────────────────────────

const flightItinerary: StarterTemplate = {
  slug: "flight-itinerary",
  name: "Flight Itinerary",
  documentType: "flight_itinerary",
  description:
    "A complete return-trip itinerary with fictional airline, airports and booking reference — ideal for travel design work and layout testing.",
  sensitivity: "standard",
  requiredCredits: 40,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "airline", type: "text", label: "Airline", default: "Vantage Atlantic", required: true, maxLength: 40 },
      { id: "flightNumber", type: "reference", label: "Flight number", default: "VA-2047", required: true },
      { id: "bookingRef", type: "reference", label: "Booking reference", default: "SBK4X9Q", required: true },
      { id: "passengerName", type: "text", label: "Passenger", default: "JORDAN M. OKAFOR", required: true, maxLength: 46 },
      { id: "fromCode", type: "reference", label: "Origin airport code", default: "LOS", required: true },
      { id: "fromCity", type: "text", label: "Origin city", default: "Lagos", required: true, maxLength: 30 },
      { id: "toCode", type: "reference", label: "Destination code", default: "LHR", required: true },
      { id: "toCity", type: "text", label: "Destination city", default: "London", required: true, maxLength: 30 },
      { id: "departDate", type: "date", label: "Departure date", default: "2026-10-14", required: true },
      { id: "departTime", type: "time", label: "Departure time", default: "09:35", required: true },
      { id: "arriveDate", type: "date", label: "Arrival date", default: "2026-10-14", required: true },
      { id: "arriveTime", type: "time", label: "Arrival time", default: "15:50", required: true },
      { id: "cabinClass", type: "select", label: "Cabin", default: "Economy", options: [
        { label: "Economy", value: "Economy" },
        { label: "Premium Economy", value: "Premium Economy" },
        { label: "Business", value: "Business" },
        { label: "First", value: "First" },
      ] },
      { id: "seat", type: "text", label: "Seat", default: "22A", maxLength: 8 },
      { id: "terminal", type: "text", label: "Terminal", default: "T2", maxLength: 8 },
      { id: "gate", type: "text", label: "Gate", default: "B14", maxLength: 8 },
      { id: "baggage", type: "text", label: "Baggage allowance", default: "2 × 23 kg", maxLength: 24 },
      { id: "fareAmount", type: "currency", label: "Fare", currency: "USD", default: "1180.00" },
      { id: "flightStatus", type: "status", label: "Status", default: "booked", options: [
        { label: "Booked", value: "booked" },
        { label: "In transit", value: "in_transit" },
        { label: "Delivered", value: "delivered" },
        { label: "Cancelled", value: "cancelled" },
      ] },
      { id: "qrValue", type: "text", label: "QR payload", default: "vantage.example/itinerary/SBK4X9Q", maxLength: 120 },
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
          box(0, 0, 794, 150, "#102a28", 0),
          txt(56, 68, "BOARDING ITINERARY", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3 }),
          val(56, 108, "airline", { size: 28, weight: 800, color: "#ffffff" }),
          val(620, 74, "bookingRef", { size: 15, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          cap(620, 96, "Booking reference", { color: "#5c7771" }),
          badge(620, 108, "flightStatus", { size: 11 }),

          // Route block
          box(56, 194, 682, 210, SURFACE, 18, RULE),
          cap(84, 226, "Origin"),
          val(84, 268, "fromCode", { size: 52, weight: 800, color: INK }),
          val(84, 296, "fromCity", { size: 13, color: MUTED, maxChars: 24 }),
          rule(238, 250, 500, 250, "#cbded8", 1.5),
          txt(352, 244, "✈", { size: 20, color: "#3d9286" }),
          cap(506, 226, "Destination", { align: "right", w: 158 }),
          val(506, 268, "toCode", { size: 52, weight: 800, color: INK, align: "right", w: 158 }),
          val(506, 296, "toCity", { size: 13, color: MUTED, align: "right", w: 158, maxChars: 24 }),
          rule(84, 322, 664, 322, RULE),
          val(84, 352, "departDate", { size: 14, weight: 600, color: INK }),
          val(84, 376, "departTime", { size: 12, color: MUTED }),
          cap(84, 338, "Departure"),
          val(338, 352, "arriveDate", { size: 14, weight: 600, color: INK }),
          val(338, 376, "arriveTime", { size: 12, color: MUTED }),
          cap(338, 338, "Arrival"),
          val(560, 352, "cabinClass", { size: 14, weight: 600, color: INK }),
          val(560, 376, "seat", { size: 12, color: MUTED }),
          cap(560, 338, "Cabin · Seat"),

          // Passenger + flight details
          cap(56, 448, "Passenger"),
          val(56, 480, "passengerName", { size: 20, weight: 700, color: INK, maxChars: 40 }),
          rule(56, 506, 738, 506),
          cap(56, 540, "Flight"),
          val(56, 572, "flightNumber", { size: 16, weight: 600, color: INK }),
          cap(230, 540, "Terminal"),
          val(230, 572, "terminal", { size: 16, weight: 600, color: INK }),
          cap(380, 540, "Gate"),
          val(380, 572, "gate", { size: 16, weight: 600, color: INK }),
          cap(520, 540, "Baggage"),
          val(520, 572, "baggage", { size: 16, weight: 600, color: INK, maxChars: 18 }),
          rule(56, 606, 738, 606),

          // Fare panel
          box(56, 636, 682, 96, SURFACE, 16, RULE),
          cap(84, 668, "Total fare"),
          val(84, 702, "fareAmount", { size: 26, weight: 800, color: INK }),
          val(500, 676, "flightNumber", { size: 12, color: MUTED, align: "right", w: 238 }),
          val(500, 698, "airline", { size: 12, color: MUTED, align: "right", w: 238, maxChars: 34 }),

          // Scan block
          cap(56, 786, "Check-in code"),
          qr(56, 806, 132, "qrValue"),
          barcode(228, 848, "bookingRef", { h: 56, w: 420, color: INK }),
          val(228, 826, "bookingRef", { size: 15, weight: 700, color: INK }),
          txt(56, 976, "Generated by Cloudie. Not a valid travel document.", {
            size: 9.5, color: FAINT,
          }),
          txt(56, 994, "Times are local to each airport. Baggage and gate information is illustrative.", {
            size: 9.5, color: FAINT,
          }),
          rule(56, 1030, 738, 1030),
          txt(56, 1056, "VANTAGE ATLANTIC · BOOKING OFFICE", { size: 9.5, weight: 700, color: MUTED, letterSpacing: 2 }),
        ],
      },
    ],
  },
};

// ─── 3. Shipment tracking card (standard) ─────────────────────────────────────

const trackingCard: StarterTemplate = {
  slug: "shipment-tracking-card",
  name: "Shipment Tracking Card",
  documentType: "tracking",
  description:
    "A courier-style status card with milestone timeline, progress bar and scannable codes. Fully fictional shipment data.",
  sensitivity: "standard",
  requiredCredits: 20,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "carrier", type: "text", label: "Carrier", default: "Cloudie", required: true, maxLength: 34 },
      { id: "trackingNumber", type: "reference", label: "Tracking number", default: "CRL-88213-7Q", required: true },
      { id: "shipmentStatus", type: "status", label: "Status", default: "in_transit", options: [
        { label: "Created", value: "draft" },
        { label: "Processing", value: "processing" },
        { label: "In transit", value: "in_transit" },
        { label: "Out for delivery", value: "pending" },
        { label: "Delivered", value: "delivered" },
        { label: "Exception", value: "failed" },
      ] },
      { id: "statusDate", type: "date", label: "Status date", default: "2026-09-22" },
      { id: "statusTime", type: "time", label: "Status time", default: "14:05" },
      { id: "originCity", type: "text", label: "Origin city", default: "Rotterdam", maxLength: 24 },
      { id: "destinationCity", type: "text", label: "Destination city", default: "Nairobi", maxLength: 24 },
      { id: "currentLocation", type: "text", label: "Current location", default: "Cairo Hub Facility", maxLength: 40 },
      { id: "serviceLevel", type: "text", label: "Service level", default: "Priority Express", maxLength: 26 },
      { id: "weight", type: "number", label: "Weight (kg)", default: "12.4", min: 0, max: 5000 },
      { id: "packageCount", type: "number", label: "Packages", default: "3", min: 1, max: 999 },
      { id: "etaDate", type: "date", label: "Estimated delivery", default: "2026-09-25" },
      { id: "senderName", type: "text", label: "Sender", default: "Meridian Supply Co.", maxLength: 34 },
      { id: "recipientName", type: "text", label: "Recipient", default: "Riverside Hardware", maxLength: 34 },
      { id: "progress", type: "number", label: "Progress (%)", default: "68", min: 0, max: 100 },
      { id: "barcodeValue", type: "reference", label: "Barcode value", default: "CRL-88213-7Q", required: true },
      { id: "qrValue", type: "text", label: "QR payload", default: "cloudie.example/track/CRL-88213-7Q", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 960,
        height: 560,
        background: PAPER,
        elements: [
          box(0, 0, 960, 96, "#102a28", 0),
          val(40, 46, "carrier", { size: 22, weight: 800, color: "#ffffff" }),
          cap(40, 66, "Shipment tracking", { color: "#5c7771" }),
          val(720, 46, "trackingNumber", { size: 14, weight: 700, color: "#a8eadc", align: "right", w: 200 }),
          cap(720, 66, "Tracking number", { color: "#5c7771", align: "right", w: 200 }),

          box(40, 128, 560, 236, SURFACE, 18, RULE),
          cap(68, 162, "Current status"),
          badge(68, 176, "shipmentStatus", { size: 15 }),
          val(560, 168, "statusDate", { size: 12, color: MUTED, align: "right", w: 212 }),
          val(560, 186, "statusTime", { size: 12, color: MUTED, align: "right", w: 212 }),
          rule(68, 222, 572, 222),
          cap(68, 250, "Location"),
          val(68, 282, "currentLocation", { size: 17, weight: 700, color: INK, maxChars: 38 }),
          cap(68, 316, "Progress"),
          box(68, 322, 504, 12, "#eaf7f1", 6),
          box(68, 322, 343, 12, "#3d9286", 6),
          val(68, 352, "progress", { size: 10, color: MUTED }),
          txt(96, 354, "% complete", { size: 10, color: MUTED }),

          box(624, 128, 296, 110, SURFACE, 18, RULE),
          cap(652, 160, "Estimated delivery"),
          val(652, 194, "etaDate", { size: 20, weight: 800, color: INK }),
          box(624, 254, 296, 110, SURFACE, 18, RULE),
          cap(652, 286, "Service level"),
          val(652, 320, "serviceLevel", { size: 17, weight: 700, color: INK, maxChars: 22 }),
          qr(838, 378, 72, "qrValue"),
          txt(838, 468, "scan to track", { size: 8.5, color: FAINT, align: "center", w: 72 }),

          // Timeline
          cap(40, 404, "Route"),
          val(40, 434, "originCity", { size: 15, weight: 700, color: INK, maxChars: 20 }),
          rule(168, 428, 792, 428, "#cbded8", 2),
          txt(452, 424, "✈", { size: 18, color: "#3d9286" }),
          val(792, 434, "destinationCity", { size: 15, weight: 700, color: INK, align: "right", w: 128, maxChars: 20 }),
          cap(40, 452, "Origin", { color: MUTED }),
          cap(792, 452, "Destination", { color: MUTED, align: "right", w: 128 }),
          rule(40, 486, 920, 486),

          cap(40, 512, "Sender"),
          val(40, 534, "senderName", { size: 12.5, color: INK, maxChars: 30 }),
          cap(228, 512, "Recipient"),
          val(228, 534, "recipientName", { size: 12.5, color: INK, maxChars: 26 }),
          cap(416, 512, "Weight"),
          val(416, 534, "weight", { size: 12.5, color: INK }),
          txt(452, 534, "kg", { size: 12.5, color: MUTED }),
          cap(500, 512, "Parcels"),
          val(500, 534, "packageCount", { size: 12.5, color: INK }),
          barcode(600, 498, "barcodeValue", { h: 46, w: 300, color: INK }),
          txt(600, 556, "crestline.example", { size: 9, color: FAINT }),
        ],
      },
    ],
  },
};

// ─── 4. Payment verification statement ────────────────────────────

const paymentVerification: StarterTemplate = {
  slug: "payment-verification-statement",
  name: "Payment Verification Statement",
  documentType: "financial",
  description:
    "A fictional settlement/verification statement with reference, payer, beneficiary and fee breakdown for finance QA fixtures.",
  sensitivity: "standard",
  requiredCredits: 40,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "providerName", type: "text", label: "Provider", default: "Ledgerline Payments", required: true, maxLength: 34 },
      { id: "reference", type: "reference", label: "Transaction reference", default: "LLP-2026-0091847", required: true },
      { id: "payerName", type: "text", label: "Payer", default: "Amara Diagnostics Ltd", required: true, maxLength: 40 },
      { id: "payerEmail", type: "text", label: "Payer email", default: "accounts@amara.example", maxLength: 48 },
      { id: "beneficiary", type: "text", label: "Beneficiary", default: "Stellar Components", required: true, maxLength: 40 },
      { id: "beneficiaryAccount", type: "reference", label: "Beneficiary account", default: "ACCT-4417-2001" },
      { id: "paymentMethod", type: "select", label: "Method", default: "Bank transfer", options: [
        { label: "Bank transfer", value: "Bank transfer" },
        { label: "Card", value: "Card" },
        { label: "Wallet", value: "Wallet" },
      ] },
      { id: "paymentDate", type: "datetime", label: "Settled at", default: "2026-09-18T10:24", required: true },
      { id: "amount", type: "currency", label: "Amount", currency: "USD", default: "12400.00", required: true },
      { id: "fee", type: "currency", label: "Processing fee", currency: "USD", default: "124.00" },
      { id: "total", type: "currency", label: "Total settled", currency: "USD", default: "12276.00", required: true },
      { id: "paymentStatus", type: "status", label: "Status", default: "completed", options: [
        { label: "Completed", value: "completed" },
        { label: "Pending", value: "pending" },
        { label: "Failed", value: "failed" },
      ] },
      { id: "narration", type: "textarea", label: "Narration", default: "Settlement for invoice INV-7741 — diagnostic equipment.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "ledgerline.example/verify/LLP-2026-0091847", maxLength: 120 },
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
          txt(56, 60, "PAYMENT VERIFICATION", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3 }),
          val(56, 96, "providerName", { size: 24, weight: 800, color: "#ffffff" }),
          badge(620, 62, "paymentStatus", { size: 12 }),
          val(620, 96, "reference", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          cap(620, 112, "Reference", { color: "#5c7771", align: "right", w: 118 }),

          box(56, 168, 682, 132, SURFACE, 16, RULE),
          cap(84, 200, "Total settled"),
          val(84, 244, "total", { size: 34, weight: 800, color: INK, family: "serif" }),
          val(500, 196, "paymentMethod", { size: 13, color: MUTED, align: "right", w: 238 }),
          val(500, 222, "paymentDate", { size: 13, color: MUTED, align: "right", w: 238 }),

          cap(56, 344, "Payer"),
          val(56, 378, "payerName", { size: 17, weight: 700, color: INK, maxChars: 36 }),
          val(56, 400, "payerEmail", { size: 12, color: MUTED, maxChars: 42 }),
          cap(420, 344, "Beneficiary"),
          val(420, 378, "beneficiary", { size: 17, weight: 700, color: INK, maxChars: 34 }),
          val(420, 400, "beneficiaryAccount", { size: 12, color: MUTED }),
          rule(56, 430, 738, 430),

          cap(56, 464, "Breakdown"),
          val(644, 502, "amount", { size: 14, color: INK, weight: 600, align: "right", w: 94 }),
          txt(56, 500, "Gross amount", { size: 13, color: MUTED }),
          rule(56, 520, 738, 520),
          txt(56, 548, "Processing fee", { size: 13, color: MUTED }),
          val(644, 550, "fee", { size: 14, color: "#bd554e", weight: 600, align: "right", w: 94 }),
          rule(56, 568, 738, 568),
          txt(56, 598, "Net settled", { size: 13, weight: 700, color: INK }),
          val(644, 600, "total", { size: 16, weight: 800, color: INK, align: "right", w: 94 }),

          cap(56, 662, "Narration"),
          box(56, 678, 682, 96, SURFACE, 14, RULE),
          val(80, 712, "narration", { size: 12.5, color: INK, maxChars: 120, lineHeight: 20 }),

          cap(56, 820, "Verification"),
          qr(56, 840, 120, "qrValue"),
          txt(200, 872, "Scan to verify this statement", { size: 11.5, weight: 600, color: INK }),
          txt(200, 894, "Reference must match your ledger", { size: 11, color: MUTED }),
          txt(200, 916, "Records are illustrative only", { size: 11, color: MUTED }),
          val(644, 872, "reference", { size: 11, weight: 700, color: INK, align: "right", w: 94 }),
          rule(56, 1000, 738, 1000),            txt(56, 1026, "Illustrative data only — no funds moved", {
            size: 9, weight: 600, color: MUTED, letterSpacing: 1,
          }),
        ],
      },
    ],
  },
};

// ─── 5. Certificate of completion ─────────────────────────────────

const certificate: StarterTemplate = {
  slug: "certificate-of-completion",
  name: "Certificate of Completion",
  documentType: "certificates",
  description:
    "A framed landscape award certificate with signatory block, credential ID and verification code for training and academy records.",
  sensitivity: "standard",
  requiredCredits: 35,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "awardTitle", type: "text", label: "Award title", default: "Certificate of Completion", required: true, maxLength: 40 },
      { id: "recipientName", type: "text", label: "Recipient", default: "Priya Ramanathan", required: true, maxLength: 46 },
      { id: "courseTitle", type: "text", label: "Programme", default: "Advanced Operations Analytics", required: true, maxLength: 60 },
      { id: "issuerName", type: "text", label: "Issuing organisation", default: "Cloudie Academy", required: true, maxLength: 46 },
      { id: "issueDate", type: "date", label: "Issued on", default: "2026-09-12", required: true },
      { id: "credentialId", type: "reference", label: "Credential ID", default: "CA-2026-004812", required: true },
      { id: "grade", type: "select", label: "Result", default: "Distinction", options: [
        { label: "Pass", value: "Pass" },
        { label: "Merit", value: "Merit" },
        { label: "Distinction", value: "Distinction" },
      ] },
      { id: "signatoryName", type: "text", label: "Signatory", default: "Dr. Helena Voss", maxLength: 34 },
      { id: "signatoryTitle", type: "text", label: "Signatory title", default: "Director of Accreditation", maxLength: 40 },
      { id: "accentColor", type: "color", label: "Accent", default: "#0b766d" },
      { id: "qrValue", type: "text", label: "QR payload", default: "academy.example/verify/CA-2026-004812", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 1123,
        height: 794,
        background: "#f7faf7",
        elements: [
          box(0, 0, 1123, 794, "#f7faf7", 0),
          box(40, 40, 1043, 714, "#ffffff", 8, "#dceee8"),
          box(64, 64, 995, 666, "#f7faf7", 6, "#0b766d"),
          txt(561, 150, "CLOUDIE ACADEMY", { size: 12, weight: 700, color: "#0b766d", letterSpacing: 6, align: "center", w: 0, x: 561 }),
          val(561, 208, "awardTitle", { size: 40, weight: 800, color: INK, align: "center", w: 0, family: "serif" }),
          rule(361, 240, 761, 240, "#0b766d", 2),
          txt(561, 288, "This certifies that", { size: 13, color: MUTED, align: "center" }),
          val(561, 356, "recipientName", { size: 46, weight: 800, color: "#102a28", align: "center", family: "serif" }),
          txt(561, 410, "has successfully completed the programme", { size: 13, color: MUTED, align: "center" }),
          val(561, 462, "courseTitle", { size: 22, weight: 700, color: "#0b766d", align: "center", maxChars: 54 }),
          badge(497, 500, "grade", { size: 13, w: 128, h: 32 }),
          txt(561, 512, "Awarded", { size: 10, color: MUTED, align: "center" }),
          rule(160, 580, 420, 580, "#cbded8"),
          val(160, 610, "signatoryName", { size: 15, weight: 700, color: INK, align: "center", w: 260 }),
          val(160, 632, "signatoryTitle", { size: 11, color: MUTED, align: "center", w: 260, maxChars: 34 }),
          rule(703, 580, 963, 580, "#cbded8"),
          val(703, 610, "issueDate", { size: 15, weight: 700, color: INK, align: "center", w: 260 }),
          txt(833, 632, "Date of issue", { size: 11, color: MUTED, align: "center" }),
          val(561, 682, "credentialId", { size: 12, weight: 700, color: MUTED, align: "center", letterSpacing: 2 }),
          qr(909, 660, 62, "qrValue", { color: "#0b766d" }),
          val(561, 704, "issuerName", { size: 10, color: FAINT, align: "center", maxChars: 44 }),
        ],
      },
    ],
  },
};

// ─── 6. General operations brief ─────────────────────────────────────────────

const operationsBrief: StarterTemplate = {
  slug: "operations-brief",
  name: "Operations Brief",
  documentType: "general",
  description:
    "A clear one-page brief for decisions, owners and next steps — useful for internal operations, client updates and team handoffs.",
  sensitivity: "standard",
  requiredCredits: 20,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Organization", default: "Northstar Operations", required: true, maxLength: 48 },
      { id: "briefTitle", type: "text", label: "Brief title", default: "Weekly operations brief", required: true, maxLength: 64 },
      { id: "reference", type: "reference", label: "Reference", default: "OPS-2026-014", required: true },
      { id: "owner", type: "text", label: "Brief owner", default: "Maya Thompson", required: true, maxLength: 48 },
      { id: "audience", type: "text", label: "Audience", default: "Operations & leadership", maxLength: 64 },
      { id: "status", type: "status", label: "Status", default: "in_review", options: [
        { label: "In review", value: "in_review" },
        { label: "Approved", value: "approved" },
        { label: "Archived", value: "archived" },
      ] },
      { id: "summary", type: "textarea", label: "Summary", default: "Keep every moving part visible. This brief captures the decisions, risks and next actions that need a clear owner this week.", maxLength: 260 },
      { id: "focus", type: "textarea", label: "Primary focus", default: "Close the highest-priority requests, confirm delivery milestones and keep the customer-facing queue clear.", maxLength: 220 },
      { id: "nextStep", type: "text", label: "Next step", default: "Review the open decisions and confirm owners before Friday.", maxLength: 90 },
      { id: "dueDate", type: "date", label: "Review date", default: "2026-10-16", required: true },
      { id: "shareUrl", type: "text", label: "Share URL", default: "cloudie.example/brief/OPS-2026-014", maxLength: 120 },
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
          box(0, 0, 794, 174, "#102a28", 0),
          box(56, 44, 48, 48, "#64d6c3", 14),
          txt(80, 76, "C", { size: 22, weight: 800, color: "#09201d" }),
          val(126, 68, "organization", { size: 16, weight: 700, color: "#eaf7f1" }),
          cap(126, 92, "Operations studio", { color: "#91b0a7" }),
          val(620, 68, "reference", { size: 13, weight: 700, color: "#eaf7f1", align: "right", w: 118 }),
          cap(620, 92, "Reference", { color: "#91b0a7", align: "right", w: 118 }),
          val(56, 138, "briefTitle", { size: 30, weight: 800, color: "#ffffff", maxChars: 48 }),

          box(56, 218, 682, 96, SURFACE, 16, RULE),
          cap(84, 248, "Owner"),
          val(84, 278, "owner", { size: 15, weight: 700, color: INK, maxChars: 32 }),
          cap(300, 248, "Audience"),
          val(300, 278, "audience", { size: 15, weight: 600, color: INK, maxChars: 32 }),
          cap(544, 248, "Review date"),
          val(544, 278, "dueDate", { size: 15, weight: 600, color: INK, align: "right", w: 118 }),
          badge(612, 228, "status", { size: 11 }),

          cap(56, 372, "Executive summary"),
          box(56, 392, 682, 142, "#e5efeb", 16),
          val(84, 430, "summary", { size: 15, color: INK, maxChars: 220, lineHeight: 23 }),

          cap(56, 590, "Primary focus"),
          box(56, 610, 682, 142, "#f7faf7", 16, RULE),
          val(84, 648, "focus", { size: 15, color: INK, maxChars: 220, lineHeight: 23 }),

          box(56, 802, 682, 92, "#102a28", 16),
          cap(84, 834, "Next step", { color: "#a8eadc" }),
          val(84, 868, "nextStep", { size: 16, weight: 700, color: "#ffffff", maxChars: 62 }),

          rule(56, 946, 738, 946),
          qr(56, 974, 82, "shareUrl", { color: INK, bg: PAPER }),
          val(164, 1002, "shareUrl", { size: 12, weight: 700, color: INK, maxChars: 48 }),
          txt(164, 1024, "Open the live brief in Cloudie", { size: 10.5, color: MUTED }),
          txt(620, 1024, "Cloudie document studio", { size: 9.5, color: FAINT, align: "right", w: 118 }),
        ],
      },
    ],
  },
};

// ─── 7. Commercial invoice (standard) ─────────────────────────────────────────

const commercialInvoice: StarterTemplate = {
  slug: "commercial-invoice",
  name: "Commercial Invoice",
  documentType: "corporate",
  description:
    "A clean three-line commercial invoice with tax and shipping, seller/buyer blocks and payment terms for order documentation.",
  sensitivity: "standard",
  requiredCredits: 25,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "invoiceNumber", type: "reference", label: "Invoice number", default: "INV-2026-0774", required: true },
      { id: "invoiceDate", type: "date", label: "Invoice date", default: "2026-09-15", required: true },
      { id: "dueDate", type: "date", label: "Due date", default: "2026-10-15", required: true },
      { id: "sellerName", type: "text", label: "Seller", default: "Northfold Trading Ltd", required: true, maxLength: 40 },
      { id: "sellerAddress", type: "address", label: "Seller address", default: "18 Harbour Way, Rotterdam, Netherlands", maxLength: 90 },
      { id: "buyerName", type: "text", label: "Buyer", default: "Lakeview Interiors", required: true, maxLength: 40 },
      { id: "buyerAddress", type: "address", label: "Buyer address", default: "442 Ridgeline Ave, Austin, TX 78701", maxLength: 90 },
      { id: "currencyCode", type: "select", label: "Currency", default: "USD", options: [
        { label: "USD", value: "USD" },
        { label: "EUR", value: "EUR" },
        { label: "GBP", value: "GBP" },
        { label: "NGN", value: "NGN" },
      ] },
      { id: "paymentStatus", type: "status", label: "Payment status", default: "pending", options: [
        { label: "Pending", value: "pending" },
        { label: "Paid", value: "paid" },
        { label: "Failed", value: "failed" },
      ] },
      { id: "item1", type: "text", label: "Item 1", default: "Oak veneer panels (m²)", maxLength: 48 },
      { id: "qty1", type: "number", label: "Qty 1", default: "24", min: 0 },
      { id: "amt1", type: "currency", label: "Amount 1", currency: "USD", default: "1920.00" },
      { id: "item2", type: "text", label: "Item 2", default: "Brushed brass handles (set)", maxLength: 48 },
      { id: "qty2", type: "number", label: "Qty 2", default: "60", min: 0 },
      { id: "amt2", type: "currency", label: "Amount 2", currency: "USD", default: "1440.00" },
      { id: "item3", type: "text", label: "Item 3", default: "Installation supervision (hr)", maxLength: 48 },
      { id: "qty3", type: "number", label: "Qty 3", default: "12", min: 0 },
      { id: "amt3", type: "currency", label: "Amount 3", currency: "USD", default: "960.00" },
      { id: "subtotal", type: "currency", label: "Subtotal", currency: "USD", default: "4320.00", required: true },
      { id: "taxRate", type: "number", label: "Tax rate (%)", default: "7.5", min: 0, max: 100 },
      { id: "taxAmount", type: "currency", label: "Tax", currency: "USD", default: "324.00" },
      { id: "shipping", type: "currency", label: "Shipping", currency: "USD", default: "180.00" },
      { id: "total", type: "currency", label: "Total due", currency: "USD", default: "4824.00", required: true },
      { id: "paymentTerms", type: "text", label: "Payment terms", default: "Net 30 — bank transfer", maxLength: 60 },
      { id: "notes", type: "textarea", label: "Notes", default: "Deliveries are scheduled on weekday mornings. Prices are illustrative.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northfold.example/invoice/INV-2026-0774", maxLength: 120 },
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
          box(0, 0, 794, 118, "#28504a", 0),
          txt(56, 56, "INVOICE", { size: 12, weight: 700, color: "#91b0a7", letterSpacing: 4 }),
          val(56, 92, "invoiceNumber", { size: 24, weight: 800, color: "#ffffff" }),
          badge(620, 56, "paymentStatus", { size: 11 }),
          val(620, 92, "total", { size: 18, weight: 700, color: "#ffffff", align: "right", w: 118 }),

          cap(56, 164, "From"),
          val(56, 194, "sellerName", { size: 16, weight: 700, color: INK, maxChars: 36 }),
          val(56, 216, "sellerAddress", { size: 11.5, color: MUTED, maxChars: 76, lineHeight: 16 }),
          cap(420, 164, "Bill to"),
          val(420, 194, "buyerName", { size: 16, weight: 700, color: INK, maxChars: 36 }),
          val(420, 216, "buyerAddress", { size: 11.5, color: MUTED, maxChars: 76, lineHeight: 16 }),
          rule(56, 262, 738, 262),

          cap(56, 296, "Invoice date"),
          val(56, 322, "invoiceDate", { size: 13.5, weight: 600, color: INK }),
          cap(240, 296, "Due date"),
          val(240, 322, "dueDate", { size: 13.5, weight: 600, color: INK }),
          cap(420, 296, "Currency"),
          val(420, 322, "currencyCode", { size: 13.5, weight: 600, color: INK }),
          cap(586, 296, "Payment terms"),
          val(586, 322, "paymentTerms", { size: 12, color: MUTED, maxChars: 28 }),

          // Line items
          box(56, 372, 682, 34, "#e5efeb", 6),
          cap(74, 392, "Description", { color: MUTED }),
          cap(520, 392, "Qty", { color: MUTED, align: "right", w: 60 }),
          cap(660, 392, "Amount", { color: MUTED, align: "right", w: 78 }),
          val(74, 436, "item1", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 436, "qty1", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 436, "amt1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 454, 738, 454),
          val(74, 484, "item2", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 484, "qty2", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 484, "amt2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 502, 738, 502),
          val(74, 532, "item3", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 532, "qty3", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 532, "amt3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 550, 738, 550),

          // Totals
          cap(420, 592, "Subtotal"),
          val(660, 592, "subtotal", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(420, 626, "Tax", { size: 12.5, color: MUTED }),
          val(520, 626, "taxRate", { size: 12.5, color: MUTED, align: "right", w: 60 }),
          txt(590, 626, "%", { size: 12.5, color: MUTED }),
          val(660, 626, "taxAmount", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(420, 660, "Shipping", { size: 12.5, color: MUTED }),
          val(660, 660, "shipping", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(420, 684, 738, 684, "#91b0a7", 1.5),
          txt(420, 716, "Total due", { size: 14, weight: 700, color: INK }),
          val(660, 716, "total", { size: 20, weight: 800, color: INK, align: "right", w: 78 }),

          cap(56, 776, "Notes"),
          box(56, 792, 682, 88, SURFACE, 14, RULE),
          val(80, 824, "notes", { size: 12, color: MUTED, maxChars: 130, lineHeight: 18 }),

          qr(56, 918, 108, "qrValue"),
          txt(188, 954, "Scan to view this invoice online", { size: 11.5, weight: 600, color: INK }),
          val(188, 976, "invoiceNumber", { size: 11, color: MUTED }),
          rule(56, 1054, 738, 1054),
          txt(56, 1080, "Generated by Cloudie", { size: 9.5, color: FAINT }),
        ],
      },
    ],
  },
};

// ─── 8. Purchase order ────────────────────────────────────────────

const purchaseOrder: StarterTemplate = {
  slug: "purchase-order",
  name: "Purchase Order",
  documentType: "corporate",
  description:
    "A buyer-issued purchase order with supplier, delivery details, itemised lines, totals and agreed terms.",
  sensitivity: "standard",
  requiredCredits: 40,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Buying organisation", default: "Northfold Trading", required: true, maxLength: 40 },
      { id: "poNumber", type: "reference", label: "Order number", default: "PO-2026-4471", required: true },
      { id: "poStatus", type: "status", label: "Status", default: "pending", options: [
        { label: "Draft", value: "draft" },
        { label: "Awaiting approval", value: "pending" },
        { label: "Approved", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
      ] },
      { id: "issueDate", type: "date", label: "Issue date", default: "2026-09-21", required: true },
      { id: "deliveryDate", type: "date", label: "Required by", default: "2026-10-06" },
      { id: "terms", type: "text", label: "Terms", default: "Net 30", maxLength: 32 },
      { id: "supplierName", type: "text", label: "Supplier", default: "Meridian Supply Co.", required: true, maxLength: 36 },
      { id: "supplierAddress", type: "textarea", label: "Supplier address", default: "Unit 12, Harbour Works\nRotterdam, NL", maxLength: 120 },
      { id: "deliverTo", type: "text", label: "Deliver to", default: "Lakeview Interiors — Site office", maxLength: 36 },
      { id: "deliverToAddress", type: "textarea", label: "Delivery address", default: "18 Riverside Way\nNairobi, KE", maxLength: 120 },
      { id: "poItem1", type: "text", label: "Item 1", default: "Oak veneer panels (m²)", maxLength: 48 },
      { id: "poQty1", type: "number", label: "Qty 1", default: "24", min: 0 },
      { id: "poAmount1", type: "currency", label: "Amount 1", currency: "USD", default: "1920.00" },
      { id: "poItem2", type: "text", label: "Item 2", default: "Brushed brass handles (set)", maxLength: 48 },
      { id: "poQty2", type: "number", label: "Qty 2", default: "60", min: 0 },
      { id: "poAmount2", type: "currency", label: "Amount 2", currency: "USD", default: "1440.00" },
      { id: "poItem3", type: "text", label: "Item 3", default: "Installation supervision (hr)", maxLength: 48 },
      { id: "poQty3", type: "number", label: "Qty 3", default: "12", min: 0 },
      { id: "poAmount3", type: "currency", label: "Amount 3", currency: "USD", default: "960.00" },
      { id: "subtotal", type: "currency", label: "Subtotal", currency: "USD", default: "4320.00", required: true },
      { id: "taxRate", type: "number", label: "Tax rate (%)", default: "7.5", min: 0, max: 100 },
      { id: "taxAmount", type: "currency", label: "Tax", currency: "USD", default: "324.00" },
      { id: "shipping", type: "currency", label: "Delivery", currency: "USD", default: "180.00" },
      { id: "total", type: "currency", label: "Order total", currency: "USD", default: "4824.00", required: true },
      { id: "notes", type: "textarea", label: "Notes", default: "Deliveries accepted on weekday mornings. Quote the order number on every packing list.", maxLength: 200 },
      { id: "referenceUrl", type: "text", label: "Order portal", default: "northfold.example/orders/PO-2026-4471", maxLength: 120 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northfold.example/po/PO-2026-4471", maxLength: 120 },
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
          txt(56, 58, "PURCHASE ORDER", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 96, "organization", { size: 22, weight: 800, color: "#ffffff", maxChars: 30 }),
          cap(620, 58, "Order number", { color: "#91b0a7", align: "right", w: 118 }),
          val(620, 76, "poNumber", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          badge(470, 84, "poStatus", { size: 11 }),

          box(56, 160, 682, 86, SURFACE, 14, RULE),
          cap(84, 190, "Issue date"),
          val(84, 218, "issueDate", { size: 13.5, weight: 600, color: INK }),
          cap(300, 190, "Required by"),
          val(300, 218, "deliveryDate", { size: 13.5, weight: 600, color: INK }),
          cap(504, 190, "Terms"),
          val(504, 218, "terms", { size: 12.5, color: MUTED, maxChars: 24 }),

          rule(56, 282, 738, 282),
          cap(56, 316, "Supplier"),
          val(56, 348, "supplierName", { size: 16, weight: 700, color: INK, maxChars: 32 }),
          val(56, 372, "supplierAddress", { size: 11.5, color: MUTED, maxChars: 62, lineHeight: 15 }),
          cap(420, 316, "Deliver to"),
          val(420, 348, "deliverTo", { size: 16, weight: 700, color: INK, maxChars: 34 }),
          val(420, 372, "deliverToAddress", { size: 11.5, color: MUTED, maxChars: 62, lineHeight: 15 }),

          rule(56, 432, 738, 432),
          box(56, 458, 682, 34, "#e5efeb", 6),
          cap(74, 478, "Description", { color: MUTED }),
          cap(520, 478, "Qty", { color: MUTED, align: "right", w: 60 }),
          cap(660, 478, "Amount", { color: MUTED, align: "right", w: 78 }),
          val(74, 520, "poItem1", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 520, "poQty1", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 520, "poAmount1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 538, 738, 538),
          val(74, 568, "poItem2", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 568, "poQty2", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 568, "poAmount2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 586, 738, 586),
          val(74, 616, "poItem3", { size: 13.5, color: INK, maxChars: 44 }),
          val(520, 616, "poQty3", { size: 13.5, color: INK, align: "right", w: 60 }),
          val(660, 616, "poAmount3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 634, 738, 634),

          cap(420, 676, "Subtotal"),
          val(660, 676, "subtotal", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(420, 708, "Tax", { size: 12.5, color: MUTED }),
          val(520, 708, "taxRate", { size: 12.5, color: MUTED, align: "right", w: 60 }),
          txt(590, 708, "%", { size: 12.5, color: MUTED }),
          val(660, 708, "taxAmount", { size: 13.5, color: INK, align: "right", w: 78 }),
          txt(420, 742, "Delivery", { size: 12.5, color: MUTED }),
          val(660, 742, "shipping", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(420, 766, 738, 766, "#91b0a7", 1.5),
          txt(420, 798, "Order total", { size: 14, weight: 700, color: INK }),
          val(660, 798, "total", { size: 20, weight: 800, color: INK, align: "right", w: 78 }),

          cap(56, 858, "Notes"),
          box(56, 874, 682, 86, SURFACE, 14, RULE),
          val(80, 906, "notes", { size: 12, color: MUTED, maxChars: 130, lineHeight: 17 }),

          rule(56, 1006, 738, 1006),
          qr(56, 1030, 86, "qrValue"),
          val(164, 1058, "referenceUrl", { size: 11.5, weight: 600, color: INK, maxChars: 46 }),
          txt(164, 1080, "Follow this order online", { size: 10.5, color: MUTED }),
          txt(620, 1080, "Illustrative order only", { size: 9.5, color: FAINT, align: "right", w: 118 }),
        ],
      },
    ],
  },
};

// ─── 9. Packing list ─────────────────────────────────────────────

const packingList: StarterTemplate = {
  slug: "packing-list",
  name: "Packing List",
  documentType: "tracking",
  description:
    "Consignment contents, package counts and weights for the sender, carrier and receiving dock.",
  sensitivity: "standard",
  requiredCredits: 25,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "consignmentRef", type: "reference", label: "Consignment reference", default: "CRL-88213-7Q", required: true },
      { id: "carrier", type: "text", label: "Carrier", default: "Coriolis Freight", maxLength: 32 },
      { id: "shipmentDate", type: "date", label: "Dispatch date", default: "2026-09-22" },
      { id: "originCity", type: "text", label: "From", default: "Rotterdam", required: true, maxLength: 24 },
      { id: "destinationCity", type: "text", label: "To", default: "Nairobi", required: true, maxLength: 24 },
      { id: "senderName", type: "text", label: "Sender", default: "Meridian Supply Co.", maxLength: 34 },
      { id: "recipientName", type: "text", label: "Recipient", default: "Riverside Hardware", maxLength: 34 },
      { id: "packageCount", type: "number", label: "Packages", default: "3", min: 1, max: 999 },
      { id: "totalWeight", type: "number", label: "Gross weight (kg)", default: "12.4", min: 0 },
      { id: "shippingMethod", type: "text", label: "Method", default: "Priority Express", maxLength: 26 },
      { id: "contents1", type: "text", label: "Contents 1", default: "Oak veneer panels", maxLength: 42 },
      { id: "contentsQty1", type: "number", label: "Qty 1", default: "24", min: 0 },
      { id: "contentsWeight1", type: "number", label: "Weight 1 (kg)", default: "6.2", min: 0 },
      { id: "contents2", type: "text", label: "Contents 2", default: "Brushed brass handles", maxLength: 42 },
      { id: "contentsQty2", type: "number", label: "Qty 2", default: "60", min: 0 },
      { id: "contentsWeight2", type: "number", label: "Weight 2 (kg)", default: "4.1", min: 0 },
      { id: "contents3", type: "text", label: "Contents 3", default: "Fixings & sealant", maxLength: 42 },
      { id: "contentsQty3", type: "number", label: "Qty 3", default: "12", min: 0 },
      { id: "contentsWeight3", type: "number", label: "Weight 3 (kg)", default: "2.1", min: 0 },
      { id: "handling", type: "textarea", label: "Handling instructions", default: "Keep flat. Do not stack more than two high.\nProtect from moisture in transit.", maxLength: 220 },
      { id: "notes", type: "textarea", label: "Notes", default: "Dock access is booked for the morning slot. Quote the consignment reference at the gate.", maxLength: 180 },
      { id: "barcodeValue", type: "reference", label: "Barcode value", default: "CRL-88213-7Q", required: true },
      { id: "qrValue", type: "text", label: "QR payload", default: "cloudie.example/packing/CRL-88213-7Q", maxLength: 120 },
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
          txt(56, 58, "PACKING LIST", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 96, "consignmentRef", { size: 24, weight: 800, color: "#ffffff" }),
          cap(620, 58, "Carrier", { color: "#91b0a7", align: "right", w: 118 }),
          val(620, 76, "carrier", { size: 13.5, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          val(620, 98, "shipmentDate", { size: 11, color: "#91b0a7", align: "right", w: 118 }),

          box(56, 160, 682, 92, SURFACE, 14, RULE),
          cap(84, 192, "From"),
          val(84, 224, "originCity", { size: 16, weight: 700, color: INK, maxChars: 18 }),
          txt(392, 216, "→", { size: 18, color: "#3d9286" }),
          rule(320, 220, 466, 220, RULE, 2),
          cap(596, 192, "To", { align: "right", w: 114 }),
          val(596, 224, "destinationCity", { size: 16, weight: 700, color: INK, align: "right", w: 114, maxChars: 18 }),

          cap(56, 294, "Sender"),
          val(56, 324, "senderName", { size: 15, weight: 700, color: INK, maxChars: 30 }),
          cap(420, 294, "Recipient"),
          val(420, 324, "recipientName", { size: 15, weight: 700, color: INK, maxChars: 32 }),

          box(56, 362, 682, 74, "#f7faf7", 14, RULE),
          cap(84, 392, "Packages"),
          val(84, 420, "packageCount", { size: 18, weight: 800, color: INK }),
          cap(280, 392, "Gross weight"),
          val(280, 420, "totalWeight", { size: 18, weight: 800, color: INK }),
          txt(340, 420, "kg", { size: 12, color: MUTED }),
          cap(520, 392, "Method"),
          val(520, 420, "shippingMethod", { size: 14, weight: 600, color: INK, maxChars: 22 }),

          cap(56, 486, "Contents"),
          box(56, 504, 682, 34, "#e5efeb", 6),
          cap(74, 524, "Description", { color: MUTED }),
          cap(470, 524, "Qty", { color: MUTED, align: "right", w: 56 }),
          cap(660, 524, "Weight", { color: MUTED, align: "right", w: 78 }),
          val(74, 566, "contents1", { size: 13.5, color: INK, maxChars: 40 }),
          val(470, 566, "contentsQty1", { size: 13.5, color: INK, align: "right", w: 56 }),
          val(660, 566, "contentsWeight1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 584, 738, 584),
          val(74, 614, "contents2", { size: 13.5, color: INK, maxChars: 40 }),
          val(470, 614, "contentsQty2", { size: 13.5, color: INK, align: "right", w: 56 }),
          val(660, 614, "contentsWeight2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 632, 738, 632),
          val(74, 662, "contents3", { size: 13.5, color: INK, maxChars: 40 }),
          val(470, 662, "contentsQty3", { size: 13.5, color: INK, align: "right", w: 56 }),
          val(660, 662, "contentsWeight3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 680, 738, 680),

          cap(56, 726, "Handling instructions"),
          box(56, 744, 682, 96, SURFACE, 14, RULE),
          val(80, 776, "handling", { size: 12.5, color: INK, maxChars: 130, lineHeight: 19 }),

          cap(56, 880, "Notes"),
          box(56, 898, 682, 74, "#f7faf7", 14, RULE),
          val(80, 928, "notes", { size: 12, color: MUTED, maxChars: 120, lineHeight: 17 }),

          rule(56, 1006, 738, 1006),
          barcode(56, 1026, "barcodeValue", { h: 56, w: 360, color: INK }),
          qr(660, 1022, 88, "qrValue"),
          txt(56, 1104, "Scan or key the consignment reference to trace this shipment", { size: 10, color: MUTED }),
        ],
      },
    ],
  },
};

// ─── 10. Remittance advice ────────────────────────────────────────

const remittanceAdvice: StarterTemplate = {
  slug: "remittance-advice",
  name: "Remittance Advice",
  documentType: "corporate",
  description:
    "A remitter's advice listing the invoices being settled and the amounts applied — references and totals only.",
  sensitivity: "standard",
  requiredCredits: 30,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "issuer", type: "text", label: "Issuing organisation", default: "Lakeview Interiors", required: true, maxLength: 40 },
      { id: "remittanceNumber", type: "reference", label: "Advice number", default: "REM-2026-0338", required: true },
      { id: "issueDate", type: "date", label: "Issue date", default: "2026-09-24", required: true },
      { id: "method", type: "select", label: "Settlement method", default: "Bank transfer", options: [
        { label: "Bank transfer", value: "Bank transfer" },
        { label: "Card", value: "Card" },
        { label: "Wallet", value: "Wallet" },
        { label: "Offset against credit note", value: "Credit offset" },
      ] },
      { id: "payerName", type: "text", label: "Remitter", default: "Lakeview Interiors", maxLength: 36 },
      { id: "reference", type: "text", label: "Our reference", default: "AP/LK/2026/338", maxLength: 40 },
      { id: "beneficiaryName", type: "text", label: "Beneficiary", default: "Northfold Trading", maxLength: 36 },
      { id: "invoiceRef1", type: "reference", label: "Invoice 1", default: "INV-2026-0774" },
      { id: "amount1", type: "currency", label: "Amount 1", currency: "USD", default: "4824.00" },
      { id: "invoiceRef2", type: "reference", label: "Invoice 2", default: "INV-2026-0781" },
      { id: "amount2", type: "currency", label: "Amount 2", currency: "USD", default: "1260.50" },
      { id: "invoiceRef3", type: "reference", label: "Invoice 3", default: "INV-2026-0790" },
      { id: "amount3", type: "currency", label: "Amount 3", currency: "USD", default: "880.00" },
      { id: "totalRemitted", type: "currency", label: "Total remitted", currency: "USD", default: "6964.50", required: true },
      { id: "notes", type: "textarea", label: "Notes", default: "Amounts are applied in invoice order. Please quote the advice number on any query.", maxLength: 180 },
      { id: "qrValue", type: "text", label: "QR payload", default: "lakeview.example/remittance/REM-2026-0338", maxLength: 120 },
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
          txt(56, 60, "REMITTANCE ADVICE", { size: 11, weight: 700, color: "#a8eadc", letterSpacing: 3.4 }),
          val(56, 98, "issuer", { size: 24, weight: 800, color: "#ffffff", maxChars: 28 }),
          cap(620, 60, "Advice number", { color: "#91b0a7", align: "right", w: 118 }),
          val(620, 96, "remittanceNumber", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),

          box(56, 168, 682, 132, SURFACE, 16, RULE),
          cap(84, 200, "Total remitted"),
          val(84, 246, "totalRemitted", { size: 34, weight: 800, color: INK, family: "serif" }),
          val(500, 198, "method", { size: 13, color: MUTED, align: "right", w: 238 }),
          val(500, 224, "issueDate", { size: 13, color: MUTED, align: "right", w: 238 }),

          cap(56, 344, "Remitter"),
          val(56, 378, "payerName", { size: 17, weight: 700, color: INK, maxChars: 34 }),
          cap(56, 410, "Our reference"),
          val(56, 438, "reference", { size: 12.5, weight: 600, color: MUTED, maxChars: 30 }),
          cap(420, 344, "Beneficiary"),
          val(420, 378, "beneficiaryName", { size: 17, weight: 700, color: INK, maxChars: 34 }),
          rule(56, 470, 738, 470),

          cap(56, 504, "Invoices settled"),
          box(56, 522, 682, 34, "#e5efeb", 6),
          cap(74, 542, "Invoice", { color: MUTED }),
          cap(660, 542, "Amount applied", { color: MUTED, align: "right", w: 78 }),
          val(74, 584, "invoiceRef1", { size: 13.5, color: INK }),
          val(660, 584, "amount1", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 602, 738, 602),
          val(74, 632, "invoiceRef2", { size: 13.5, color: INK }),
          val(660, 632, "amount2", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 650, 738, 650),
          val(74, 680, "invoiceRef3", { size: 13.5, color: INK }),
          val(660, 680, "amount3", { size: 13.5, color: INK, align: "right", w: 78 }),
          rule(56, 698, 738, 698),
          txt(480, 736, "Total applied", { size: 13.5, weight: 700, color: INK }),
          val(660, 736, "totalRemitted", { size: 16, weight: 800, color: INK, align: "right", w: 78 }),

          cap(56, 800, "Notes"),
          box(56, 818, 682, 96, SURFACE, 14, RULE),
          val(80, 850, "notes", { size: 12.5, color: INK, maxChars: 130, lineHeight: 19 }),

          rule(56, 950, 738, 950),
          qr(56, 974, 100, "qrValue"),
          txt(190, 1004, "Scan to reconcile this advice", { size: 11.5, weight: 600, color: INK }),
          txt(190, 1026, "Amounts are illustrative — no funds move", { size: 11, color: MUTED }),
          val(644, 1004, "remittanceNumber", { size: 11, weight: 700, color: INK, align: "right", w: 94 }),
          rule(56, 1060, 738, 1060),
          txt(56, 1086, "Illustrative business document", { size: 9.5, color: FAINT }),
        ],
      },
    ],
  },
};

// ─── 11. Business letter ──────────────────────────────────────────

const businessLetter: StarterTemplate = {
  slug: "business-letter",
  name: "Business Letter",
  documentType: "corporate",
  description:
    "A formatted letter on your own letterhead with date, recipient block, subject line and signature area.",
  sensitivity: "standard",
  requiredCredits: 20,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "organization", type: "text", label: "Organisation", default: "Northfold Trading", required: true, maxLength: 40 },
      { id: "organizationAddress", type: "textarea", label: "Letterhead address", default: "12 Harbour Works, Rotterdam, NL\naccounts@northfold.example", maxLength: 140 },
      { id: "letterDate", type: "date", label: "Date", default: "2026-09-24", required: true },
      { id: "reference", type: "reference", label: "Our reference", default: "NF/2026/114" },
      { id: "recipientName", type: "text", label: "Recipient", default: "Priya Ramanathan", required: true, maxLength: 34 },
      { id: "recipientOrganization", type: "text", label: "Recipient organisation", default: "Lakeview Interiors", maxLength: 36 },
      { id: "recipientAddress", type: "textarea", label: "Recipient address", default: "18 Riverside Way\nNairobi, KE", maxLength: 140 },
      { id: "subjectLine", type: "text", label: "Subject", default: "Delivery schedule for the remaining hardware", required: true, maxLength: 70 },
      { id: "salutation", type: "text", label: "Salutation", default: "Dear Priya,", maxLength: 40 },
      { id: "letterBody", type: "textarea", label: "Letter body", default: "Thank you for confirming the revised site programme.\n\nDelivery of the remaining brass hardware is confirmed for the first week of October, and our installation supervisor will be on site from the 6th.\n\nWe will send a completion pack once the final walkthrough is signed off.", required: true, maxLength: 900 },
      { id: "closing", type: "text", label: "Sign-off", default: "Kind regards,", maxLength: 30 },
      { id: "signatoryName", type: "text", label: "Signed by", default: "Amara Cole", required: true, maxLength: 32 },
      { id: "signatoryTitle", type: "text", label: "Signatory role", default: "Account Director", maxLength: 40 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northfold.example/letters/NF-2026-114", maxLength: 120 },
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
          box(0, 0, 794, 8, "#0b766d", 0),
          val(56, 76, "organization", { size: 24, weight: 800, color: INK, maxChars: 30 }),
          val(56, 102, "organizationAddress", { size: 11.5, color: MUTED, maxChars: 70, lineHeight: 16 }),
          rule(56, 156, 738, 156, RULE),

          val(56, 194, "letterDate", { size: 12.5, weight: 600, color: INK }),
          cap(620, 176, "Our reference", { align: "right", w: 118 }),
          val(620, 194, "reference", { size: 12, weight: 700, color: MUTED, align: "right", w: 118 }),

          val(56, 248, "recipientName", { size: 14, weight: 700, color: INK, maxChars: 32 }),
          val(56, 270, "recipientOrganization", { size: 12.5, color: MUTED, maxChars: 36 }),
          val(56, 292, "recipientAddress", { size: 12, color: MUTED, maxChars: 64, lineHeight: 16 }),

          rule(56, 356, 738, 356, RULE),
          cap(56, 386, "Subject"),
          val(56, 416, "subjectLine", { size: 16, weight: 700, color: INK, maxChars: 62 }),
          rule(56, 434, 738, 434, RULE),

          val(56, 470, "salutation", { size: 13, color: INK }),
          val(56, 508, "letterBody", { size: 13, color: INK, maxChars: 700, lineHeight: 23 }),

          val(56, 802, "closing", { size: 13, color: INK }),
          rule(56, 862, 320, 862, "#cbded8"),
          val(56, 892, "signatoryName", { size: 15, weight: 700, color: INK, maxChars: 30 }),
          val(56, 914, "signatoryTitle", { size: 11.5, color: MUTED, maxChars: 38 }),

          rule(56, 1006, 738, 1006),
          qr(56, 1028, 86, "qrValue"),
          txt(164, 1056, "Scan to verify this letter", { size: 11, weight: 600, color: INK }),
          txt(164, 1078, "Issued from the document studio", { size: 10.5, color: MUTED }),
          txt(620, 1078, "Page 1 of 1", { size: 9.5, color: FAINT, align: "right", w: 118 }),
        ],
      },
    ],
  },
};

export const STARTER_SET_VERSION = 7;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  bankingDashboard,
  flightItinerary,
  trackingCard,
  paymentVerification,
  certificate,
  operationsBrief,
  commercialInvoice,
  purchaseOrder,
  packingList,
  remittanceAdvice,
  businessLetter,
];
