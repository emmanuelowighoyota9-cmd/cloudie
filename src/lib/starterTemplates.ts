/**
 * SoftBaker starter templates.
 *
 * Plain data: each entry is a complete, validated template definition
 * (schema + layout configuration) that the platform seeds so the document
 * library is useful on day one. Imported by BOTH the Convex seeder and the
 * frontend preview, so nothing here may touch the DOM or the network.
 *
 * Every template is deliberately fictional: names, accounts, references and
 * amounts are samples. Sensitive categories additionally receive a forced
 * DEMO/SAMPLE watermark from the engine (see docTemplateEngine.renderWatermark).
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
  schema: TemplateSchema;
  configuration: TemplateConfiguration;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const RULE = "#e2e8f0";
const PAPER = "#ffffff";
const SURFACE = "#f8fafc";

// ─── Element builders (kept terse; all return LayoutElement) ──────────────────

type El = TemplateConfiguration["pages"][number]["elements"][number];

function txt(x: number, y: number, text: string, opts: Record<string, unknown> = {}): El {
  return { kind: "text", x, y, text, ...opts } as El;
}

function val(x: number, y: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "text", x, y, bind, ...opts } as El;
}

function cap(x: number, y: number, text: string, opts: Record<string, unknown> = {}): El {
  return {
    kind: "text", x, y, text, size: 9.5, weight: 700, color: FAINT,
    uppercase: true, letterSpacing: 1.4, ...opts,
  } as El;
}

function box(
  x: number, y: number, w: number, h: number,
  fill: string, rx = 14, stroke?: string,
): El {
  return { kind: "rect", x, y, w, h, fill, rx, ...(stroke ? { stroke, strokeWidth: 1 } : {}) } as El;
}

function rule(x1: number, y1: number, x2: number, y2: number, stroke = RULE, strokeWidth = 1): El {
  return { kind: "line", x1, y1, x2, y2, stroke, strokeWidth } as El;
}

function badge(x: number, y: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "badge", x, y, bind, ...opts } as El;
}

function qr(x: number, y: number, size: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "qr", x, y, size, bind, ...opts } as El;
}

function barcode(x: number, y: number, bind: string, opts: Record<string, unknown> = {}): El {
  return { kind: "barcode", x, y, bind, ...opts } as El;
}

// ─── 1. Banking interface mockup (sensitive) ──────────────────────────────────

const bankingDashboard: StarterTemplate = {
  slug: "banking-dashboard-mockup",
  name: "Banking Dashboard Mockup",
  documentType: "banking_ui",
  description:
    "A dark, realistic digital-banking dashboard screen for design reviews, QA fixtures and interface training. All data is fictional.",
  sensitivity: "sensitive",
  requiredCredits: 45,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "bankName", type: "text", label: "Institution name", default: "Northwind Trust", required: true, maxLength: 40 },
      { id: "accountHolder", type: "text", label: "Account holder", default: "ALEX MERCER", required: true, maxLength: 40 },
      { id: "accountNumber", type: "reference", label: "Account number", default: "DEMO-0000-0001", required: true },
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
      { id: "themeColor", type: "color", label: "Surface color", default: "#0b1120" },
      { id: "accentColor", type: "color", label: "Accent color", default: "#38bdf8" },
      { id: "qrValue", type: "text", label: "QR payload", default: "northwind.demo/dashboard/0001", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 1000,
        height: 620,
        background: "#070c17",
        elements: [
          box(0, 0, 1000, 620, "#070c17", 0),
          // Left navigation rail
          box(0, 0, 92, 620, "#0b1120", 0),
          box(26, 34, 40, 40, "#38bdf8", 12),
          txt(38, 60, "N", { size: 20, weight: 800, color: "#0b1120" }),
          box(30, 104, 32, 8, "#334155", 4),
          box(30, 136, 32, 8, "#38bdf8", 4),
          box(30, 168, 32, 8, "#334155", 4),
          box(30, 200, 32, 8, "#334155", 4),
          box(30, 232, 32, 8, "#334155", 4),
          // Header
          cap(130, 48, "Institution", { color: "#475569" }),
          val(130, 74, "bankName", { size: 22, weight: 700, color: "#e2e8f0" }),
          val(760, 74, "accountNumber", { size: 12, color: "#64748b", align: "right", w: 116 }),
          box(600, 92, 276, 1, "#1e293b", 0),
          // Balance panel
          box(130, 118, 452, 190, "#0f172a", 20, "#1e293b"),
          val(158, 160, "cardLabel", { size: 11, color: "#64748b" }),
          box(158, 190, 396, 1, "#1e293b", 0),
          val(158, 246, "balance", { size: 42, weight: 800, color: "#ffffff", family: "serif" }),
          val(158, 276, "cardBrand", { size: 12, color: "#94a3b8", letterSpacing: 2, uppercase: true }),
          badge(452, 130, "accountStatus", { size: 11 }),
          // Side stats
          box(604, 118, 272, 88, "#0f172a", 20, "#1e293b"),
          cap(628, 148, "Transaction 3", { color: "#475569" }),
          val(628, 176, "tx3Label", { size: 14, color: "#e2e8f0", weight: 600, maxChars: 30 }),
          val(628, 198, "tx3Amount", { size: 13, color: "#4ade80", weight: 700 }),
          box(604, 220, 272, 88, "#0f172a", 20, "#1e293b"),
          txt(628, 250, "Instant transfer", { size: 13, weight: 600, color: "#e2e8f0" }),
          txt(628, 272, "No fees until Friday", { size: 11, color: "#475569" }),
          box(628, 284, 96, 16, "#38bdf8", 8),
          txt(642, 296, "Send", { size: 10, weight: 700, color: "#0b1120" }),
          // Chart
          val(130, 344, "chartLabel", { size: 9.5, weight: 700, color: "#64748b", letterSpacing: 1.2, uppercase: true }),
          box(130, 366, 746, 1, "#1e293b", 0),
          box(146, 400, 46, 92, "#1e293b", 6),
          box(216, 372, 46, 120, "#1e293b", 6),
          box(286, 418, 46, 74, "#1e293b", 6),
          box(356, 392, 46, 100, "#38bdf8", 6),
          box(426, 358, 46, 134, "#1e293b", 6),
          box(496, 404, 46, 88, "#1e293b", 6),
          // Ledger rows
          box(604, 372, 272, 1, "#1e293b", 0),
          cap(604, 404, "Recent activity", { color: "#475569" }),
          val(604, 436, "tx1Label", { size: 12.5, color: "#cbd5e1", maxChars: 26 }),
          val(820, 436, "tx1Amount", { size: 12.5, color: "#f87171", align: "right", w: 56 }),
          rule(604, 452, 876, 452, "#1e293b"),
          val(604, 480, "tx2Label", { size: 12.5, color: "#cbd5e1", maxChars: 26 }),
          val(820, 480, "tx2Amount", { size: 12.5, color: "#f87171", align: "right", w: 56 }),
          rule(604, 496, 876, 496, "#1e293b"),
          val(604, 524, "tx3Label", { size: 12.5, color: "#cbd5e1", maxChars: 26 }),
          val(820, 524, "tx3Amount", { size: 12.5, color: "#4ade80", align: "right", w: 56 }),
          rule(604, 540, 876, 540, "#1e293b"),
          qr(146, 512, 78, "qrValue", { color: "#e2e8f0", bg: "#0b1120" }),
          txt(238, 536, "Scan to open the demo", { size: 10, color: "#475569" }),
          txt(238, 552, "mock in the mobile app", { size: 10, color: "#475569" }),
        ],
      },
    ],
  },
};

// ─── 2. Flight itinerary (sensitive) ──────────────────────────────────────────

const flightItinerary: StarterTemplate = {
  slug: "flight-itinerary",
  name: "Flight Itinerary",
  documentType: "flight_itinerary",
  description:
    "A complete return-trip itinerary with fictional airline, airports and booking reference — ideal for travel demos and layout testing.",
  sensitivity: "sensitive",
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
      { id: "qrValue", type: "text", label: "QR payload", default: "vantage.demo/itinerary/SBK4X9Q", maxLength: 120 },
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
          box(0, 0, 794, 150, "#0f172a", 0),
          txt(56, 68, "BOARDING ITINERARY", { size: 11, weight: 700, color: "#7dd3fc", letterSpacing: 3 }),
          val(56, 108, "airline", { size: 28, weight: 800, color: "#ffffff" }),
          val(620, 74, "bookingRef", { size: 15, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          cap(620, 96, "Booking reference", { color: "#64748b" }),
          badge(620, 108, "flightStatus", { size: 11 }),

          // Route block
          box(56, 194, 682, 210, SURFACE, 18, RULE),
          cap(84, 226, "Origin"),
          val(84, 268, "fromCode", { size: 52, weight: 800, color: INK }),
          val(84, 296, "fromCity", { size: 13, color: MUTED, maxChars: 24 }),
          rule(238, 250, 500, 250, "#cbd5e1", 1.5),
          txt(352, 244, "✈", { size: 20, color: "#0ea5e9" }),
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
          cap(84, 668, "Total fare (sample)"),
          val(84, 702, "fareAmount", { size: 26, weight: 800, color: INK }),
          val(500, 676, "flightNumber", { size: 12, color: MUTED, align: "right", w: 238 }),
          val(500, 698, "airline", { size: 12, color: MUTED, align: "right", w: 238, maxChars: 34 }),

          // Scan block
          cap(56, 786, "Check-in code"),
          qr(56, 806, 132, "qrValue"),
          barcode(228, 848, "bookingRef", { h: 56, w: 420, color: INK }),
          val(228, 826, "bookingRef", { size: 15, weight: 700, color: INK }),
          txt(56, 976, "Sample itinerary generated by Cloudie SoftBaker. Not a valid travel document.", {
            size: 9.5, color: FAINT,
          }),
          txt(56, 994, "Times are local to each airport. Baggage and gate information is illustrative.", {
            size: 9.5, color: FAINT,
          }),
          rule(56, 1030, 738, 1030),
          txt(56, 1056, "VANTAGE ATLANTIC · SALES DEMO", { size: 9.5, weight: 700, color: MUTED, letterSpacing: 2 }),
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
      { id: "carrier", type: "text", label: "Carrier", default: "Crestline Express", required: true, maxLength: 34 },
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
      { id: "qrValue", type: "text", label: "QR payload", default: "crestline.demo/track/CRL-88213-7Q", maxLength: 120 },
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
          box(0, 0, 960, 96, "#0f172a", 0),
          val(40, 46, "carrier", { size: 22, weight: 800, color: "#ffffff" }),
          cap(40, 66, "Shipment tracking", { color: "#64748b" }),
          val(720, 46, "trackingNumber", { size: 14, weight: 700, color: "#7dd3fc", align: "right", w: 200 }),
          cap(720, 66, "Tracking number", { color: "#64748b", align: "right", w: 200 }),

          box(40, 128, 560, 236, SURFACE, 18, RULE),
          cap(68, 162, "Current status"),
          badge(68, 176, "shipmentStatus", { size: 15 }),
          val(560, 168, "statusDate", { size: 12, color: MUTED, align: "right", w: 212 }),
          val(560, 186, "statusTime", { size: 12, color: MUTED, align: "right", w: 212 }),
          rule(68, 222, 572, 222),
          cap(68, 250, "Location"),
          val(68, 282, "currentLocation", { size: 17, weight: 700, color: INK, maxChars: 38 }),
          cap(68, 316, "Progress"),
          box(68, 322, 504, 12, "#e2e8f0", 6),
          box(68, 322, 343, 12, "#0ea5e9", 6),
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
          rule(168, 428, 792, 428, "#cbd5e1", 2),
          txt(452, 424, "✈", { size: 18, color: "#0ea5e9" }),
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
          txt(600, 556, "crestline.demo", { size: 9, color: FAINT }),
        ],
      },
    ],
  },
};

// ─── 4. Payment verification statement (sensitive) ────────────────────────────

const paymentVerification: StarterTemplate = {
  slug: "payment-verification-statement",
  name: "Payment Verification Statement",
  documentType: "financial",
  description:
    "A fictional settlement/verification statement with reference, payer, beneficiary and fee breakdown for finance QA fixtures.",
  sensitivity: "sensitive",
  requiredCredits: 40,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "providerName", type: "text", label: "Provider", default: "Ledgerline Payments", required: true, maxLength: 34 },
      { id: "reference", type: "reference", label: "Transaction reference", default: "LLP-2026-0091847", required: true },
      { id: "payerName", type: "text", label: "Payer", default: "Amara Diagnostics Ltd", required: true, maxLength: 40 },
      { id: "payerEmail", type: "text", label: "Payer email", default: "accounts@amara.example", maxLength: 48 },
      { id: "beneficiary", type: "text", label: "Beneficiary", default: "Stellar Components", required: true, maxLength: 40 },
      { id: "beneficiaryAccount", type: "reference", label: "Beneficiary account", default: "DEMO-4417-2001" },
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
      { id: "qrValue", type: "text", label: "QR payload", default: "ledgerline.demo/verify/LLP-2026-0091847", maxLength: 120 },
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
          box(0, 0, 794, 128, "#0f172a", 0),
          txt(56, 60, "PAYMENT VERIFICATION", { size: 11, weight: 700, color: "#7dd3fc", letterSpacing: 3 }),
          val(56, 96, "providerName", { size: 24, weight: 800, color: "#ffffff" }),
          badge(620, 62, "paymentStatus", { size: 12 }),
          val(620, 96, "reference", { size: 13, weight: 700, color: "#ffffff", align: "right", w: 118 }),
          cap(620, 112, "Reference", { color: "#64748b", align: "right", w: 118 }),

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
          val(644, 550, "fee", { size: 14, color: "#dc2626", weight: 600, align: "right", w: 94 }),
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
          rule(56, 1000, 738, 1000),
          txt(56, 1026, "SIMULATED FINANCIAL RECORD · NO FUNDS MOVED · FOR TESTING", {
            size: 9, weight: 600, color: MUTED, letterSpacing: 1,
          }),
        ],
      },
    ],
  },
};

// ─── 5. Certificate of completion (sensitive) ─────────────────────────────────

const certificate: StarterTemplate = {
  slug: "certificate-of-completion",
  name: "Certificate of Completion",
  documentType: "certificates",
  description:
    "A framed landscape award certificate with signatory block, credential ID and verification code for training and academy demos.",
  sensitivity: "sensitive",
  requiredCredits: 35,
  supportedFormats: ["png", "pdf"],
  schema: {
    fields: [
      { id: "awardTitle", type: "text", label: "Award title", default: "Certificate of Completion", required: true, maxLength: 40 },
      { id: "recipientName", type: "text", label: "Recipient", default: "Priya Ramanathan", required: true, maxLength: 46 },
      { id: "courseTitle", type: "text", label: "Programme", default: "Advanced Operations Analytics", required: true, maxLength: 60 },
      { id: "issuerName", type: "text", label: "Issuing organisation", default: "Cloudie Academy (Sample)", required: true, maxLength: 46 },
      { id: "issueDate", type: "date", label: "Issued on", default: "2026-09-12", required: true },
      { id: "credentialId", type: "reference", label: "Credential ID", default: "CA-2026-004812", required: true },
      { id: "grade", type: "select", label: "Result", default: "Distinction", options: [
        { label: "Pass", value: "Pass" },
        { label: "Merit", value: "Merit" },
        { label: "Distinction", value: "Distinction" },
      ] },
      { id: "signatoryName", type: "text", label: "Signatory", default: "Dr. Helena Voss", maxLength: 34 },
      { id: "signatoryTitle", type: "text", label: "Signatory title", default: "Director of Accreditation", maxLength: 40 },
      { id: "accentColor", type: "color", label: "Accent", default: "#0d9488" },
      { id: "qrValue", type: "text", label: "QR payload", default: "academy.demo/verify/CA-2026-004812", maxLength: 120 },
    ],
  },
  configuration: {
    renderScale: 2,
    pages: [
      {
        width: 1123,
        height: 794,
        background: "#fbfaf7",
        elements: [
          box(0, 0, 1123, 794, "#fbfaf7", 0),
          box(40, 40, 1043, 714, "#ffffff", 8, "#e7e3d9"),
          box(64, 64, 995, 666, "#fbfaf7", 6, "#0d9488"),
          txt(561, 150, "CLOUDIE ACADEMY", { size: 12, weight: 700, color: "#0d9488", letterSpacing: 6, align: "center", w: 0, x: 561 }),
          val(561, 208, "awardTitle", { size: 40, weight: 800, color: INK, align: "center", w: 0, family: "serif" }),
          rule(361, 240, 761, 240, "#0d9488", 2),
          txt(561, 288, "This certifies that", { size: 13, color: MUTED, align: "center" }),
          val(561, 356, "recipientName", { size: 46, weight: 800, color: "#0f172a", align: "center", family: "serif" }),
          txt(561, 410, "has successfully completed the programme", { size: 13, color: MUTED, align: "center" }),
          val(561, 462, "courseTitle", { size: 22, weight: 700, color: "#0d9488", align: "center", maxChars: 54 }),
          badge(497, 500, "grade", { size: 13, w: 128, h: 32 }),
          txt(561, 512, "Awarded", { size: 10, color: MUTED, align: "center" }),
          rule(160, 580, 420, 580, "#cbd5e1"),
          val(160, 610, "signatoryName", { size: 15, weight: 700, color: INK, align: "center", w: 260 }),
          val(160, 632, "signatoryTitle", { size: 11, color: MUTED, align: "center", w: 260, maxChars: 34 }),
          rule(703, 580, 963, 580, "#cbd5e1"),
          val(703, 610, "issueDate", { size: 15, weight: 700, color: INK, align: "center", w: 260 }),
          txt(833, 632, "Date of issue", { size: 11, color: MUTED, align: "center" }),
          val(561, 682, "credentialId", { size: 12, weight: 700, color: MUTED, align: "center", letterSpacing: 2 }),
          qr(909, 660, 62, "qrValue", { color: "#0d9488" }),
          val(561, 704, "issuerName", { size: 10, color: FAINT, align: "center", maxChars: 44 }),
        ],
      },
    ],
  },
};

// ─── 6. Commercial invoice (standard) ─────────────────────────────────────────

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
      { id: "notes", type: "textarea", label: "Notes", default: "Deliveries are scheduled on weekday mornings. Samples are illustrative.", maxLength: 200 },
      { id: "qrValue", type: "text", label: "QR payload", default: "northfold.demo/invoice/INV-2026-0774", maxLength: 120 },
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
          box(0, 0, 794, 118, "#1e293b", 0),
          txt(56, 56, "INVOICE", { size: 12, weight: 700, color: "#94a3b8", letterSpacing: 4 }),
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
          box(56, 372, 682, 34, "#f1f5f9", 6),
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
          rule(420, 684, 738, 684, "#94a3b8", 1.5),
          txt(420, 716, "Total due", { size: 14, weight: 700, color: INK }),
          val(660, 716, "total", { size: 20, weight: 800, color: INK, align: "right", w: 78 }),

          cap(56, 776, "Notes"),
          box(56, 792, 682, 88, SURFACE, 14, RULE),
          val(80, 824, "notes", { size: 12, color: MUTED, maxChars: 130, lineHeight: 18 }),

          qr(56, 918, 108, "qrValue"),
          txt(188, 954, "Scan to view this invoice online", { size: 11.5, weight: 600, color: INK }),
          val(188, 976, "invoiceNumber", { size: 11, color: MUTED }),
          rule(56, 1054, 738, 1054),
          txt(56, 1080, "Generated by Cloudie SoftBaker · Sample document", { size: 9.5, color: FAINT }),
        ],
      },
    ],
  },
};

/**
 * Bump this whenever a starter layout changes. The seeder republishes every
 * starter template as a new version when the stored version differs, so layout
 * fixes reach deployments that already installed an earlier set. Already
 * generated documents keep their frozen version snapshot and never change.
 */
export const STARTER_SET_VERSION = 2;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  bankingDashboard,
  flightItinerary,
  trackingCard,
  paymentVerification,
  certificate,
  commercialInvoice,
];
