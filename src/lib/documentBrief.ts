/**
 * Crestline document brief parser.
 *
 * Turns a plain-language brief into a validated field set for one of the
 * platform's legitimate business document templates. It is intentionally
 * deterministic: no model call, no network, no hidden state — so it runs
 * identically in the browser and in tests.
 *
 * Policy: this parser only maps onto business paperwork issued by an
 * organisation. Requests for identity documents, government credentials,
 * payment confirmations, bank instruments, or other artifacts that could be
 * mistaken for authentic are rejected rather than generated.
 */

import {
  sanitizeText,
  type FieldDef,
  type FieldType,
  type TemplateSchema,
} from "./docTemplateEngine";
import { parseItemList } from "./itemList";

export { parseItemList } from "./itemList";
export type { ParsedItemRow } from "./itemList";

export type BriefTransform = "text" | "reference" | "date" | "amount" | "number";

/** How sure the parser is about an extracted value. */
export type BriefConfidence = "high" | "medium" | "low";

export interface BriefFieldRule {
  id: string;
  label: string;
  /** Only required fields are reported as missing when absent. */
  required?: boolean;
  /** First capture group wins; the whole match is used when there is none. */
  patterns: RegExp[];
  transform?: BriefTransform;
  /** Skip the punctuation trim — used by free text and postal addresses. */
  keepRaw?: boolean;
  hint?: string;
}

/** Repeatable table rows, e.g. "2 x Oak veneer panels 1920.00". */
export interface BriefLineItems {
  /** Field-id prefix for the description column: "item" → item1, item2… */
  itemPrefix: string;
  qtyPrefix?: string;
  amountPrefix?: string;
  /** Copy used in the "recognized fields" list. */
  label: string;
  /** How many rows the target template can hold. */
  max: number;
}

export interface BriefIntent {
  key: string;
  label: string;
  templateSlug: string;
  description: string;
  /** Lower-cased terms that indicate this document type. */
  keywords: string[];
  fields: BriefFieldRule[];
  lineItems?: BriefLineItems;
}

// ─── Supported intents ────────────────────────────────────────────────────────

export const BRIEF_INTENTS: BriefIntent[] = [
  {
    key: "shipment_tracking",
    label: "Shipment tracking card",
    templateSlug: "shipment-tracking-card",
    description: "Courier status card with milestones, tracking number and scannable codes.",
    keywords: ["shipment", "shipping", "consignment note", "tracking", "track", "parcel", "package", "courier", "freight", "delivery status"],
    fields: [
      {
        id: "trackingNumber",
        label: "Tracking number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:tracking|tracking\s*(?:no|number|id)|awb|consignment)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,24})\b/i, /\b([A-Z]{2,4}-\d{4,10}(?:-[A-Z0-9]{1,6})?)\b/],
      },
      { id: "carrier", label: "Carrier", patterns: [/\b(?:carrier|courier|via|with)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9&.' -]{2,32})/i] },
      { id: "originCity", label: "Origin city", patterns: [/\bfrom\s+([A-Za-z][A-Za-z .'-]{2,22}?)(?=\s+(?:to|via|on|at|for)\b|[,;.]|$)/i, /\borigin\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,22}?)(?=\s+(?:to|via)\b|[,;.]|$)/i] },
      { id: "destinationCity", label: "Destination city", patterns: [/\bto\s+([A-Za-z][A-Za-z .'-]{2,22}?)(?=\s+(?:via|on|at|from)\b|[,;.]|$)/i, /\bdestination\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,22}?)(?=\s+(?:via|on)\b|[,;.]|$)/i] },
      { id: "senderName", label: "Sender", patterns: [/\bsender\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i, /\bshipper\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i] },
      { id: "recipientName", label: "Recipient", patterns: [/\brecipient\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i, /\bconsignee\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i] },
      { id: "weight", label: "Weight (kg)", transform: "number", patterns: [/\b([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kgs|kilograms)\b/i] },
      { id: "etaDate", label: "Estimated delivery", transform: "date", patterns: [/\b(?:eta|estimated delivery|delivery date|arrives?)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
    ],
  },
  {
    key: "commercial_invoice",
    label: "Commercial invoice",
    templateSlug: "commercial-invoice",
    description: "Line-item invoice with seller, buyer, tax, shipping and payment terms.",
    keywords: ["invoice", "billing", "commercial invoice", "receivable", "amount due"],
    fields: [
      {
        id: "invoiceNumber",
        label: "Invoice number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:invoice|inv)\s*(?:no|number|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(INV-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "sellerName", label: "Seller", patterns: [/\b(?:seller|vendor|issued by|supplier)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "sellerAddress", label: "Seller address", keepRaw: true, patterns: [/\bseller\s+address\s*[:#-]\s*([^\n;]{4,90})/i, /\bfrom\s*[:#-]\s*([^\n;]{6,90})/i] },
      { id: "buyerName", label: "Buyer", patterns: [/\b(?:buyer|client|customer|bill to|billed to|purchaser)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "buyerAddress", label: "Buyer address", keepRaw: true, patterns: [/\bbuyer\s+address\s*[:#-]\s*([^\n;]{4,90})/i, /\b(?:bill to|billed to)\s+(?:address\s*[:#-]\s*)?([^\n;]{8,90})/i] },
      { id: "invoiceDate", label: "Invoice date", transform: "date", patterns: [/\b(?:invoice date|issued|date)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "dueDate", label: "Due date", transform: "date", patterns: [/\b(?:due|payment due|due date|net)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "total", label: "Total due", transform: "amount", patterns: [/\b(?:total|amount due|grand total|balance)\s*(?:due|:)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i, /([0-9][0-9,]*\.[0-9]{2})\s*(?:total|due)/i] },
      { id: "currencyCode", label: "Currency", patterns: [/\b(USD|EUR|GBP|NGN|CAD|AUD|KES|GHS|ZAR|INR)\b/] },
      { id: "paymentTerms", label: "Payment terms", patterns: [/\b(net\s*[0-9]{1,3}(?:\s*days)?)\b/i, /\bpayment terms\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
    ],
    lineItems: { itemPrefix: "item", qtyPrefix: "qty", amountPrefix: "amt", label: "Line items", max: 3 },
  },
  {
    key: "purchase_order",
    label: "Purchase order",
    templateSlug: "purchase-order",
    description: "Buyer-issued order with supplier, delivery details, itemised lines and terms.",
    keywords: ["purchase order", "po number", "procurement", "supplier order", "supply order", "order", "deliver to", "required by"],
    fields: [
      {
        id: "poNumber",
        label: "Order number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:purchase order|po|order)\s*(?:no|number|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(PO-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "organization", label: "Buying organisation", patterns: [/\b(?:buyer|buying organisation|buying organization|issued by|purchaser)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "supplierName", label: "Supplier", patterns: [/\bsupplier\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i, /\bvendor\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "supplierAddress", label: "Supplier address", keepRaw: true, patterns: [/\bsupplier\s+address\s*[:#-]\s*([^\n;]{4,90})/i] },
      { id: "deliverTo", label: "Deliver to", patterns: [/\bdeliver(?:y)? to\s*[:#-]?\s*([A-Za-z0-9&.' -]{2,40})/i] },
      { id: "deliverToAddress", label: "Delivery address", keepRaw: true, patterns: [/\bdelivery address\s*[:#-]\s*([^\n;]{4,90})/i] },
      { id: "issueDate", label: "Issue date", transform: "date", patterns: [/\b(?:issue date|issued|ordered on|order date)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "deliveryDate", label: "Required by", transform: "date", patterns: [/\b(?:required by|deliver(?:y)? by|needed by)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "terms", label: "Terms", patterns: [/\bterms\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,32})/i, /\b(net\s*[0-9]{1,3}(?:\s*days)?)\b/i] },
      { id: "total", label: "Order total", transform: "amount", patterns: [/\b(?:order total|total)\s*(?:value|:)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
    ],
    lineItems: { itemPrefix: "poItem", qtyPrefix: "poQty", amountPrefix: "poAmount", label: "Order lines", max: 3 },
  },
  {
    key: "packing_list",
    label: "Packing list",
    templateSlug: "packing-list",
    description: "Consignment contents, package counts and weights for the dock and carrier.",
    keywords: ["packing list", "packing slip", "packing", "contents list", "parcels", "loading list", "dispatch note"],
    fields: [
      {
        id: "consignmentRef",
        label: "Consignment reference",
        required: true,
        transform: "reference",
        patterns: [/\b(?:consignment|packing list|shipment|parcel)\s*(?:ref(?:erence)?|no|number|#|:)\s*([A-Z0-9][A-Z0-9-]{4,24})\b/i, /\b([A-Z]{2,4}-\d{4,10}(?:-[A-Z0-9]{1,6})?)\b/],
      },
      { id: "carrier", label: "Carrier", patterns: [/\b(?:carrier|courier|freight|via)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9&.' -]{2,32})/i] },
      { id: "shipmentDate", label: "Dispatch date", transform: "date", patterns: [/\b(?:dispatch(?:ed)?(?: on)?|ship(?:ped)? on|collection date)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "originCity", label: "From", patterns: [/\bfrom\s+([A-Za-z][A-Za-z .'-]{2,22}?)(?=\s+(?:to|via|on|at|for)\b|[,;.]|$)/i] },
      { id: "destinationCity", label: "To", patterns: [/\bto\s+([A-Za-z][A-Za-z .'-]{2,22}?)(?=\s+(?:via|on|at|from)\b|[,;.]|$)/i] },
      { id: "senderName", label: "Sender", patterns: [/\bsender\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i] },
      { id: "recipientName", label: "Recipient", patterns: [/\brecipient\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i] },
      { id: "packageCount", label: "Packages", transform: "number", patterns: [/\b([0-9]{1,4})\s*(?:packages?|parcels?|cartons?|pallets?|boxes)\b/i] },
      { id: "totalWeight", label: "Gross weight (kg)", transform: "number", patterns: [/\b(?:gross|total)\s+weight\s*[:#-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kgs)?/i, /\b([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kgs|kilograms)\b/i] },
      { id: "shippingMethod", label: "Method", patterns: [/\bmethod\s*[:#-]?\s*([A-Za-z0-9&.' -]{3,26})/i, /\b(express|priority|economy|sea freight|air freight|road)\b/i] },
    ],
    lineItems: { itemPrefix: "contents", qtyPrefix: "contentsQty", amountPrefix: "contentsWeight", label: "Contents rows", max: 3 },
  },
  {
    key: "remittance_advice",
    label: "Remittance advice",
    templateSlug: "remittance-advice",
    description: "Advice listing the invoice references being settled and the amounts applied.",
    keywords: ["remittance", "remittance advice", "amounts applied", "invoices settled", "payment advice", "settlement advice"],
    fields: [
      {
        id: "remittanceNumber",
        label: "Advice number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:remittance|advice|rem)\s*(?:no|number|ref(?:erence)?|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(REM-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "issuer", label: "Issuing organisation", patterns: [/\b(?:remitter|from|issued by|on behalf of)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "payerName", label: "Remitter", patterns: [/\bremitter\s*[:#-]?\s*([A-Za-z0-9&.' -]{2,36})/i, /\bpayer\s*[:#-]?\s*([A-Za-z0-9&.' -]{2,36})/i, /\bby\s+([A-Za-z][A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:settling|for|at|on)\b|[,;.]|$)/i] },
      { id: "beneficiaryName", label: "Beneficiary", patterns: [/\bbeneficiary\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,36})/i, /\bpayee\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,36})/i] },
      { id: "issueDate", label: "Issue date", transform: "date", patterns: [/\b(?:issue date|issued|advice date|dated)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "method", label: "Settlement method", patterns: [/\b(?:method|settled by|paid by)\s*[:#-]?\s*([A-Za-z][A-Za-z .-]{2,30})/i, /\b(bank transfer|card|wallet|credit offset)\b/i] },
      { id: "totalRemitted", label: "Total remitted", transform: "amount", patterns: [/\b(?:total remitted|total applied|amount applied|amount|total)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "reference", label: "Our reference", patterns: [/\b(?:our reference|reference|ref)\s*[:#-]?\s*([A-Za-z0-9/][A-Za-z0-9/.-]{3,30})/i] },
    ],
    lineItems: { itemPrefix: "invoiceRef", qtyPrefix: "amount", label: "Invoices settled", max: 3 },
  },
  {
    key: "operations_brief",
    label: "Operations brief",
    templateSlug: "operations-brief",
    description: "Internal one-page brief with owner, audience, summary and next step.",
    keywords: ["brief", "summary", "status update", "operations", "internal note", "one-pager", "weekly review", "review", "owner", "audience", "weekly", "memo", "report"],
    fields: [
      { id: "briefTitle", label: "Brief title", required: true, patterns: [/\b(?:title|subject|re)\s*[:#-]\s*([A-Za-z0-9&.,'()/ -]{3,48})/i, /^([A-Za-z0-9&.,'()/ -]{4,48})$/m] },
      { id: "organization", label: "Organization", patterns: [/\b(?:organization|organisation|company|team)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "reference", label: "Reference", transform: "reference", patterns: [/\b(?:reference|ref|ops)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{3,24})\b/i] },
      { id: "owner", label: "Owner", patterns: [/\b(?:owner|author|prepared by)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "audience", label: "Audience", patterns: [/\baudience\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i, /\bfor\s+([A-Za-z][A-Za-z &.,'/-]{3,36})/i] },
      { id: "dueDate", label: "Review date", transform: "date", patterns: [/\b(?:review|due|deadline)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "summary", label: "Summary", keepRaw: true, patterns: [/\b(?:summary|overview|context)\s*[:#-]\s*([\s\S]{20,220})/i] },
      { id: "nextStep", label: "Next step", patterns: [/\b(?:next step|action|next action)\s*[:#-]\s*([A-Za-z0-9&.,' -]{4,80})/i] },
    ],
  },
  {
    key: "business_letter",
    label: "Business letter",
    templateSlug: "business-letter",
    description: "Formal letter on a letterhead with recipient block, subject line and signature.",
    keywords: ["letter", "letterhead", "formal letter", "cover letter", "correspondence", "write to"],
    fields: [
      { id: "organization", label: "Organisation", patterns: [/\b(?:organisation|organization|on behalf of|from)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "letterDate", label: "Date", transform: "date", patterns: [/\b(?:date|dated)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "reference", label: "Our reference", transform: "reference", patterns: [/\b(?:our reference|reference|ref)\s*[:#-]?\s*([A-Za-z0-9/][A-Za-z0-9/.-]{3,30})/i] },
      { id: "recipientName", label: "Recipient", required: true, patterns: [/\b(?:recipient|addressed to|to)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "recipientOrganization", label: "Recipient organisation", patterns: [/\brecipient\s+(?:organisation|organization|company)\s*[:#-]\s*([A-Za-z0-9&.,' -]{2,36})/i] },
      { id: "recipientAddress", label: "Recipient address", keepRaw: true, patterns: [/\b(?:recipient\s+)?address\s*[:#-]\s*([^\n;]{4,90})/i] },
      { id: "subjectLine", label: "Subject", required: true, patterns: [/\b(?:subject|re)\s*[:#-]\s*([A-Za-z0-9&.,'()/ -]{4,64})/i] },
      { id: "salutation", label: "Salutation", patterns: [/\b(dear\s+[A-Za-z][A-Za-z .'-]{1,30}),?/i] },
      { id: "signatoryName", label: "Signed by", patterns: [/\b(?:signed by|yours(?: faithfully| sincerely)?,?\s*|signatory)\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "signatoryTitle", label: "Signatory role", patterns: [/\b(?:role|title|position)\s*[:#-]\s*([A-Za-z0-9&.,' -]{2,40})/i] },
    ],
  },
  {
    key: "quotation",
    label: "Quotation",
    templateSlug: "quotation",
    description: "Priced proposal with a validity window, client details, itemised lines and totals.",
    keywords: ["quotation", "quote", "estimate", "priced proposal", "tender price"],
    fields: [
      {
        id: "quoteNumber",
        label: "Quotation number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:quotation|quote|qt)\s*(?:no|number|ref(?:erence)?|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(QT-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "organization", label: "Issuing organisation", patterns: [/\b(?:issued by|issuing organisation|issuing organization)\s*[:#-]?\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:to|for|dated|valid)\b|[,;.]|$)/i, /\bfrom\s+([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:to|for|dated|valid)\b|[,;.]|$)/i] },
      { id: "clientName", label: "Prepared for", required: true, patterns: [/\b(?:prepared for|for client|client)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:dated|valid|subject|total)\b|[,;.]|$)/i] },
      { id: "clientAddress", label: "Client address", keepRaw: true, patterns: [/\b(?:client|prepared for)\s+address\s*[:#-]\s*([^\n;]{4,90})/i] },
      { id: "subject", label: "Subject", patterns: [/\bsubject\s*[:#-]\s*([A-Za-z0-9&.,'()/ -]{4,60})/i] },
      { id: "issueDate", label: "Issued", transform: "date", patterns: [/\b(?:dated|issue date|issued)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "validUntil", label: "Valid until", transform: "date", patterns: [/\b(?:valid until|valid to|expires?|offer valid)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "validityTerms", label: "Validity terms", patterns: [/\b(?:prices? held|validity)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "total", label: "Quoted total", transform: "amount", patterns: [/\b(?:quoted total|grand total|total|quoted at)\s*(?:value|:)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
    ],
    lineItems: { itemPrefix: "quoteItem", qtyPrefix: "quoteQty", amountPrefix: "quoteAmount", label: "Quotation lines", max: 3 },
  },
  {
    key: "delivery_note",
    label: "Delivery note",
    templateSlug: "delivery-note",
    description: "Proof-of-delivery paperwork: parcels, quantities, condition on arrival and signatures.",
    keywords: ["delivery note", "delivery docket", "proof of delivery", "goods received", "received by", "delivery confirmation"],
    fields: [
      {
        id: "noteNumber",
        label: "Delivery note number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:delivery note|delivery docket|dn)\s*(?:no|number|ref(?:erence)?|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(DN-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "orderRef", label: "Order reference", transform: "reference", patterns: [/\b(?:order|po)\s*(?:ref(?:erence)?|no|number|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i] },
      { id: "organization", label: "Dispatch organisation", patterns: [/\b(?:dispatch(?:ed)? by|from|issued by)\s*[:#-]?\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:to|for|on)\b|[,;.]|$)/i] },
      { id: "carrier", label: "Carrier", patterns: [/\b(?:carrier|courier|freight|via)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9&.' -]{2,32})/i] },
      { id: "deliveryDate", label: "Delivered on", transform: "date", patterns: [/\b(?:delivered(?: on)?|delivery date|delivered by|arrived)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "deliverTo", label: "Deliver to", required: true, patterns: [/\bdeliver(?:y)? to\s*[:#-]?\s*([A-Za-z0-9&.' -]{2,40})/i] },
      { id: "deliveryAddress", label: "Delivery address", keepRaw: true, patterns: [/\bdelivery address\s*[:#-]\s*([^\n;]{4,90})/i] },
      { id: "receivedBy", label: "Received by", patterns: [/\breceived by\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i, /\bsigned (?:for|by)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "packageCount", label: "Packages", transform: "number", patterns: [/\b([0-9]{1,4})\s*(?:packages?|parcels?|cartons?|pallets?|boxes)\b/i] },
      { id: "condition", label: "Condition on arrival", patterns: [/\bcondition\s*(?:on arrival)?\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,26})/i, /\b(good condition|packaging damaged|short delivery|refused)\b/i] },
    ],
    lineItems: { itemPrefix: "contents", qtyPrefix: "contentsQty", label: "Delivered items", max: 3 },
  },
  {
    key: "statement_of_account",
    label: "Statement of account",
    templateSlug: "statement-of-account",
    description: "Period summary of documents raised on an account: entries, amounts paid and the balance due.",
    keywords: ["statement of account", "account statement", "statement", "outstanding balance", "balance due", "account summary"],
    fields: [
      {
        id: "statementNumber",
        label: "Statement number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:statement|soa)\s*(?:no|number|ref(?:erence)?|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(SOA-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "organization", label: "Issuing organisation", patterns: [/\b(?:from|issued by|issuing organisation|issuing organization)\s*[:#-]?\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:for|to|dated)\b|[,;.]|$)/i] },
      { id: "accountName", label: "Account", patterns: [/\b(?:account name|account)\s*[:#-]\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:dated|for)\b|[,;.]|\s+[—–]|$)/i] },
      { id: "statementDate", label: "Statement date", transform: "date", patterns: [/\b(?:statement date|statement dated|issued)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "periodStart", label: "Period from", transform: "date", patterns: [/\b(?:period from|from)\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s*(?:to|until|through)\b/i] },
      { id: "periodEnd", label: "Period to", transform: "date", patterns: [/\b(?:to|until|through)\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "openingBalance", label: "Opening balance", transform: "amount", patterns: [/\bopening balance\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "totalInvoiced", label: "Total invoiced", transform: "amount", patterns: [/\b(?:total invoiced|invoiced)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "totalPaid", label: "Total paid", transform: "amount", patterns: [/\b(?:total paid|paid to date|amount paid)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "balanceDue", label: "Balance due", required: true, transform: "amount", patterns: [/\b(?:balance due|outstanding balance|amount outstanding|balance)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "terms", label: "Terms", patterns: [/\bterms\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,42})/i, /\b(payment due on receipt of statement|net\s*[0-9]{1,3})\b/i] },
    ],
    lineItems: { itemPrefix: "entryRef", amountPrefix: "entryAmount", label: "Statement entries", max: 3 },
  },
  {
    key: "expense_claim",
    label: "Expense claim",
    templateSlug: "expense-claim",
    description: "Reimbursement form with purpose, category, itemised costs, advance received and balance payable.",
    keywords: ["expense claim", "expense report", "expenses", "reimbursement", "claim form", "out-of-pocket"],
    fields: [
      {
        id: "claimNumber",
        label: "Claim number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:expense claim|claim|exp)\s*(?:no|number|ref(?:erence)?|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(EXP-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "organization", label: "Organisation", patterns: [/\b(?:organisation|organization|company|for)\s*[:#-]?\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:claim|dated|by)\b|[,;.]|$)/i] },
      { id: "claimantName", label: "Claimant", required: true, patterns: [/\b(?:claimant|claimed by|submitted by)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "claimantRole", label: "Role", patterns: [/\b(?:role|position)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "claimDate", label: "Claim date", transform: "date", patterns: [/\b(?:claim date|dated|submitted)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "purpose", label: "Purpose", patterns: [/\b(?:purpose|reason for claim|trip)\s*[:#-]\s*([^,;\n]{4,60})/i] },
      { id: "category", label: "Category", patterns: [/\bcategory\s*[:#-]?\s*([A-Za-z][A-Za-z .-]{2,20})/i, /\b(travel|equipment|software|meals|other)\b/i] },
      { id: "total", label: "Total claimed", transform: "amount", patterns: [/\b(?:total claimed|total|amount claimed)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "advance", label: "Advance received", transform: "amount", patterns: [/\b(?:advance received|advance|less advance)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "reimbursable", label: "Reimbursable", required: true, transform: "amount", patterns: [/\b(?:reimbursable|reimbursement|net claim|payable)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "approverName", label: "Approved by", patterns: [/\b(?:approved by|approver)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
    ],
    lineItems: { itemPrefix: "expense", amountPrefix: "expenseAmount", label: "Claim lines", max: 3 },
  },
  {
    key: "item_schedule",
    label: "Item schedule",
    templateSlug: "item-schedule",
    description: "Ten-row schedule for longer lists — paste a CSV or bulleted list and every line gets its own row.",
    keywords: [
      "item list",
      "list of items",
      "itemised list",
      "itemized list",
      "item schedule",
      "schedule of items",
      "csv",
      "spreadsheet",
      "price list",
      "parts list",
      "stock list",
      "product list",
      "multiple items",
    ],
    fields: [
      {
        id: "scheduleNumber",
        label: "Schedule number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:schedule|sch)\s*(?:no|number|ref(?:erence)?|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(SCH-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "organization", label: "Organisation", patterns: [/\b(?:issued by|from)\s*[:#-]?\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:for|dated|on)\b|[,;.]|$)/i] },
      { id: "preparedFor", label: "Prepared for", patterns: [/\b(?:prepared for|for client|client)\s*[:#-]?\s*([A-Za-z0-9&.'-]*(?: [A-Za-z0-9&.'-]+){0,3}?)(?=\s+(?:dated|on|reference)\b|[,;.]|$)/i] },
      { id: "scheduleDate", label: "Date", transform: "date", patterns: [/\b(?:schedule date|dated|issued on)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "reference", label: "Reference", patterns: [/\b(?:our reference|reference|ref)\s*[:#-]?\s*([A-Za-z0-9/][A-Za-z0-9/.-]{3,30})/i] },
      { id: "currencyCode", label: "Currency", patterns: [/\b(USD|EUR|GBP|NGN|CAD|AUD|KES|GHS|ZAR|INR)\b/] },
      { id: "subtotal", label: "Subtotal", transform: "amount", patterns: [/\bsubtotal\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "taxAmount", label: "Tax", transform: "amount", patterns: [/\b(?:tax|vat)\s*(?::)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
      { id: "total", label: "Total", transform: "amount", patterns: [/\b(?:total|grand total)\s*(?:value|:)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i] },
    ],
    lineItems: { itemPrefix: "schedule", qtyPrefix: "scheduleQty", amountPrefix: "scheduleAmount", label: "Item rows", max: 10 },
  },
];

// ─── Refused categories ───────────────────────────────────────────────────────

interface RefusedCategory {
  term: string;
  label: string;
  pattern: RegExp;
}

/**
 * Anything whose value depends on a third party believing it is genuine.
 * Crestline does not manufacture these, and the parser refuses them before any
 * template matching happens.
 */
const REFUSED: RefusedCategory[] = [
  { term: "passport", label: "passports", pattern: /\bpassport(s)?\b/i },
  { term: "driver license", label: "driver's licences", pattern: /\bdriver'?s?\s*licen[cs]es?\b/i },
  { term: "national id", label: "national ID cards", pattern: /\bnational\s+id\b|\bnational\s+identity\b/i },
  { term: "id card", label: "identity cards", pattern: /\bid\s*card(s)?\b|\bmilitary\s+id\b|\bemployee\s+id\b|\bfan\s+id\b|\brefugee\s+id\b/i },
  { term: "ssn", label: "social security cards", pattern: /\bssn\b|social\s+security\s+(card|number)/i },
  { term: "sin", label: "social insurance cards", pattern: /\bsin\b|social\s+insurance\s+(card|number)/i },
  { term: "death certificate", label: "death certificates", pattern: /\bdeath\s+certificate(s)?\b|\bvital\s+records?\b/i },
  { term: "bank check", label: "bank cheques", pattern: /\bbank\s+check(s)?\b|\bcheque(s)?\b|\bcashier'?s?\s+check\b/i },
  { term: "payment screenshot", label: "payment confirmations", pattern: /\bpayment\s+(screenshot|confirmation|receipt)\b|\btransfer\s+receipt\b|\bwire\s+receipt\b|\bcash\s*app\b|\bpaypal\b|\bbinance\b|\bgcash\b|\bvenmo\b|\bzelle\b/i },
  { term: "routing number", label: "bank routing or account numbers", pattern: /\brouting\s+(number|no)\b|\baccount\s+number\b/i },
  { term: "certificate", label: "credential or award certificates", pattern: /\b(certificate|diploma|credential)\b/i },
];

const SUPPORTED_SUMMARY = BRIEF_INTENTS.map((intent) => intent.label).join(", ");

export interface BriefRefusal {
  status: "blocked";
  reason: string;
  matched: string;
}

export interface BriefUnsupported {
  status: "unsupported";
  reason: string;
  suggestions: string[];
}

export interface BriefEmpty {
  status: "empty";
}

/** Two or more supported types scored close enough that a follow-up is fairer than a guess. */
export interface BriefAmbiguous {
  status: "ambiguous";
  reason: string;
  candidates: BriefCandidate[];
  /** Values extracted with the leading candidate, kept for convenience. */
  values: Record<string, string>;
}

export interface BriefCandidate {
  key: string;
  label: string;
  templateSlug: string;
  description: string;
  score: number;
}

export interface BriefRecognized {
  id: string;
  label: string;
  value: string;
  confidence: BriefConfidence;
}

export interface BriefMatch {
  status: "matched";
  intent: BriefIntent;
  values: Record<string, string>;
  missing: { id: string; label: string }[];
  recognized: BriefRecognized[];
  /** True when the brief mentioned the type by name instead of only hints. */
  explicit: boolean;
  /** Row counters, present for templates that render item rows. */
  lineItems?: BriefLineItemStats;
}

export type BriefResult = BriefMatch | BriefRefusal | BriefUnsupported | BriefEmpty | BriefAmbiguous;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIsoDate(raw: string): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

function ruleFieldType(rule: BriefFieldRule): FieldType {
  switch (rule.transform) {
    case "date": return "date";
    case "amount": return "currency";
    case "number": return "number";
    case "reference": return "reference";
    default: return "text";
  }
}

/** Phrases that mark the end of a short value but are never part of one. */
const STOP_PHRASES =
  /\s+(?:addressed to|signed by|required by|deliver(?:y)? to|subject|dated|invoice date|due date|payment terms|bank transfer|credit offset|reference|ref|total|amount due)\b/i;

/**
 * Short text values end at punctuation, not at the end of the sentence:
 * "Meridian Supply Co., recipient Riverside" is a sender, not a shipping story.
 */
function trimTextValue(raw: string): string {
  let value = raw;
  const cut = value.search(/[,;():|\n]/);
  if (cut >= 0) value = value.slice(0, cut);
  value = value.split(STOP_PHRASES)[0];
  value = value.replace(/\s+/g, " ").trim();
  let previous = "";
  while (previous !== value) {
    previous = value;
    value = value.replace(/\s+(?:and|or|to|at|by|with|for|from|of|the)$/i, "").trim();
  }
  return value.replace(/[\s.,;:–-]+$/, "").trim();
}

/** Addresses and free text keep their commas, but lose trailing filler. */
function softTrim(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/[\s,;:–-]+$/, "").trim();
}

function applyTransform(
  value: string,
  transform: BriefTransform | undefined,
  keepRaw = false,
): string {
  const trimmed = value.trim();
  switch (transform) {
    case "reference":
      return trimmed.toUpperCase().replace(/[^A-Z0-9\-/ ]/g, "").slice(0, 40);
    case "date":
      return toIsoDate(trimmed);
    case "amount":
      return trimmed.replace(/[^0-9.,]/g, "").replace(/,/g, "").slice(0, 20);
    case "number":
      return trimmed.replace(/[^0-9.]/g, "").slice(0, 20);
    default:
      return sanitizeText(keepRaw ? softTrim(trimmed) : trimTextValue(trimmed), 240);
  }
}

function confidenceForPattern(index: number): BriefConfidence {
  if (index === 0) return "high";
  if (index === 1) return "medium";
  return "low";
}

function extractRule(rule: BriefFieldRule, text: string): { value: string; confidence: BriefConfidence } | null {
  for (let index = 0; index < rule.patterns.length; index++) {
    const match = rule.patterns[index].exec(text);
    if (!match) continue;
    const raw = (match[1] ?? match[0] ?? "").trim();
    if (!raw) continue;
    const value = applyTransform(raw, rule.transform, rule.keepRaw);
    if (value) return { value, confidence: confidenceForPattern(index) };
  }
  return null;
}

function scoreIntent(intent: BriefIntent, haystack: string): number {
  return intent.keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + keyword.length : score), 0);
}

/** Row counters reported back to the caller so long lists can be flagged. */
export interface BriefLineItemStats {
  /** Row slots that were filled. */
  filled: number;
  /** Rows found in a pasted list or CSV block. */
  detected: number;
  /** Row slots the matched template renders. */
  capacity: number;
}

interface LineItemStats {
  entries: { id: string; label: string; value: string; confidence: BriefConfidence }[];
  filled: number;
  detected: number;
}

/**
 * Repeatable rows, from a pasted list or CSV first and from inline
 * "N x Description [amount]" fragments second, capped at the number of slots the
 * target template renders.
 */
function extractLineItems(text: string, spec: BriefLineItems): LineItemStats {
  const out: { id: string; label: string; value: string; confidence: BriefConfidence }[] = [];
  // Pass 1 — pasted lists and CSV. Each parsed row claims the next slot.
  const parsedRows = parseItemList(text);
  const seen = new Set<string>();
  let rows = 0;
  for (const row of parsedRows) {
    if (rows >= spec.max) break;
    // Table cells keep their commas: "Brackets, galvanised" is one description.
    const descriptionValue = applyTransform(row.description, "text", true);
    if (!descriptionValue) continue;
    const key = descriptionValue.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows += 1;
    out.push({
      id: `${spec.itemPrefix}${rows}`,
      label: `${spec.label} — row ${rows}`,
      value: descriptionValue,
      confidence: row.amount ? "high" : "medium",
    });
    if (spec.qtyPrefix && row.qty) {
      out.push({ id: `${spec.qtyPrefix}${rows}`, label: `Qty ${rows}`, value: row.qty, confidence: "high" });
    }
    if (spec.amountPrefix && row.amount) {
      out.push({ id: `${spec.amountPrefix}${rows}`, label: `Amount ${rows}`, value: row.amount, confidence: "high" });
    }
  }

  // Pass 2 — inline rows mentioned mid-sentence in a prose brief. Two items in
  // one sentence ("4 x tiles 880.00 and 2 x battens 240.00") are two rows, so
  // the text is split only where another "N x" follows.
  const segments = text.split(/\s+(?:and|plus|&)\s+(?=\d+(?:\.\d+)?\s*[x×]\s)/i);
  for (const segment of segments) {
    const rowPattern = /(\d+(?:\.\d+)?)\s*[x×]\s*([^,;\n]{2,80})/gi;
    let match = rowPattern.exec(segment);
    while (match && rows < spec.max) {
      const qty = match[1];
      let description = match[2].trim().replace(/[-–.\s]+$/, "").trim();
      let amount = "";
      // Money is "1920.00"; weights are "6.2 kg". Both belong to the last column.
      const amountMatch =
        /^(.*?)\s+(?:USD|EUR|GBP|NGN|CAD|AUD|KES|GHS|ZAR|INR)?\s*[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2}|[0-9]+(?:\.[0-9]+)?\s*(?:kg|kgs))$/i.exec(description);
      if (amountMatch && amountMatch[1].trim().length >= 2) {
        description = amountMatch[1].trim().replace(/[-–@]\s*$/, "").trim();
        amount = applyTransform(amountMatch[2], "amount");
      }
      // "3 x widgets from supplier Meridian" → description "widgets".
      const descriptionValue = applyTransform(
        description.split(/[,;]|\s+(?:from|at|for|@)\s/i)[0],
        "text",
      );
      // A row already claimed by the pasted block never takes a second slot, so
      // the slot counter only advances for rows that actually land.
      if (descriptionValue && !seen.has(descriptionValue.toLowerCase())) {
        seen.add(descriptionValue.toLowerCase());
        rows += 1;
        const index = rows;
        out.push({
          id: `${spec.itemPrefix}${index}`,
          label: `${spec.label} — row ${index}`,
          value: descriptionValue,
          confidence: amount ? "high" : "medium",
        });
        if (spec.qtyPrefix) {
          out.push({ id: `${spec.qtyPrefix}${index}`, label: `Qty ${index}`, value: qty, confidence: "high" });
        }
        if (amount && spec.amountPrefix) {
          out.push({ id: `${spec.amountPrefix}${index}`, label: `Amount ${index}`, value: amount, confidence: "high" });
        }
      }
      match = rowPattern.exec(segment);
    }
  }
  return { entries: out, filled: rows, detected: Math.max(parsedRows.length, rows) };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Find the refused category a brief mentions, if any. */
export function refusedCategory(text: string): RefusedCategory | null {
  return REFUSED.find((entry) => entry.pattern.test(text)) ?? null;
}

/** Rank every supported type against the brief, best first. */
export function rankIntents(text: string): BriefCandidate[] {
  const haystack = text.toLowerCase();
  return BRIEF_INTENTS.map((intent) => ({
    key: intent.key,
    label: intent.label,
    templateSlug: intent.templateSlug,
    description: intent.description,
    score: scoreIntent(intent, haystack),
  })).sort((a, b) => b.score - a.score);
}

function collectValues(intent: BriefIntent, text: string): {
  values: Record<string, string>;
  recognized: BriefRecognized[];
  missing: { id: string; label: string }[];
  lineItems?: BriefLineItemStats;
} {
  const values: Record<string, string> = {};
  const recognized: BriefRecognized[] = [];
  const missing: { id: string; label: string }[] = [];
  let lineItems: BriefLineItemStats | undefined;

  for (const rule of intent.fields) {
    const hit = extractRule(rule, text);
    if (hit) {
      values[rule.id] = hit.value;
      recognized.push({ id: rule.id, label: rule.label, value: hit.value, confidence: hit.confidence });
    } else if (rule.required) {
      missing.push({ id: rule.id, label: rule.label });
    }
  }

  if (intent.lineItems) {
    const stats = extractLineItems(text, intent.lineItems);
    for (const row of stats.entries) {
      values[row.id] = row.value;
      recognized.push({ id: row.id, label: row.label, value: row.value, confidence: row.confidence });
    }
    lineItems = { filled: stats.filled, detected: stats.detected, capacity: intent.lineItems.max };
  }

  return { values, recognized, missing, lineItems };
}

/**
 * Parse a plain-language brief.
 *
 * `intentKey` skips matching and uses that supported type directly — this is how
 * the follow-up question for an ambiguous brief is answered.
 */
export function parseDocumentBrief(input: string, intentKey?: string): BriefResult {
  const text = input.trim().replace(/[ \t]+/g, " ");
  if (!text) return { status: "empty" };

  const refused = refusedCategory(text);
  if (refused) {
    return {
      status: "blocked",
      matched: refused.term,
      reason: `Crestline does not generate ${refused.label}. Identity documents, government credentials, payment confirmations, bank instruments and credential certificates are declined. Supported instead: ${SUPPORTED_SUMMARY}.`,
    };
  }

  if (intentKey) {
    const forced = BRIEF_INTENTS.find((intent) => intent.key === intentKey);
    if (forced) {
      const collected = collectValues(forced, text);
      return { status: "matched", intent: forced, explicit: true, ...collected };
    }
  }

  const ranked = rankIntents(text);
  const best = ranked[0];

  // A pasted list or CSV with no document wording at all is an item schedule.
  if ((!best || best.score === 0) && parseItemList(text).length >= 2) {
    const schedule = BRIEF_INTENTS.find((entry) => entry.key === "item_schedule");
    if (schedule) {
      return { status: "matched", intent: schedule, explicit: false, ...collectValues(schedule, text) };
    }
  }

  if (!best || best.score === 0) {
    return {
      status: "unsupported",
      reason: `Could not match this brief to a supported document. Supported types: ${SUPPORTED_SUMMARY}.`,
      suggestions: BRIEF_INTENTS.map((intent) => intent.label),
    };
  }

  const runnersUp = ranked.filter((candidate) => candidate.score > 0 && candidate.score >= best.score * 0.8);
  if (runnersUp.length > 1) {
    const collected = collectValues(
      BRIEF_INTENTS.find((intent) => intent.key === best.key) ?? BRIEF_INTENTS[0],
      text,
    );
    return {
      status: "ambiguous",
      reason: "This brief could be more than one document. Pick the one you want and Crestline will extract its fields.",
      candidates: runnersUp.slice(0, 3),
      values: collected.values,
    };
  }

  const intent = BRIEF_INTENTS.find((entry) => entry.key === best.key) ?? BRIEF_INTENTS[0];
  const collected = collectValues(intent, text);
  const haystack = text.toLowerCase();
  return {
    status: "matched",
    intent,
    explicit: intent.keywords.some((keyword) => keyword.includes(" ") && haystack.includes(keyword)),
    ...collected,
  };
}

export interface BriefStructuredOutput {
  documentType: string;
  template: string;
  templateSlug: string;
  values: Record<string, string>;
  missingFields: string[];
  fieldSchema: Pick<FieldDef, "id" | "label" | "type">[];
}

/**
 * Structured output in the shape the Crestline document engine consumes:
 * canonical field ids plus the extracted values, ready to drop into the builder.
 */
export function buildStructuredOutput(
  result: BriefMatch,
  schema?: { fields: FieldDef[] },
): BriefStructuredOutput {
  const known = new Set(result.recognized.map((entry) => entry.id));
  const used = (schema?.fields ?? []).filter((field) => known.has(field.id));
  const fieldSchema =
    used.length > 0
      ? used.map((field) => ({ id: field.id, label: field.label, type: field.type }))
      : result.intent.fields.map((rule) => ({
          id: rule.id,
          label: rule.label,
          type: ruleFieldType(rule),
        }));
  const values: Record<string, string> = {};
  for (const field of fieldSchema) {
    const value = result.values[field.id];
    if (value) values[field.id] = value;
  }

  // Anything the template itself demands (and that has no default to fall back
  // on) is reported too, so the brief never looks complete when the builder
  // would still refuse to generate.
  const missingFields = result.missing.map((entry) => entry.label);
  if (schema) {
    const labels = new Set(missingFields);
    for (const field of schema.fields) {
      if (!field.required || field.default) continue;
      if (values[field.id] || labels.has(field.label)) continue;
      labels.add(field.label);
      missingFields.push(field.label);
    }
  }

  return {
    documentType: result.intent.key,
    template: result.intent.label,
    templateSlug: result.intent.templateSlug,
    values,
    missingFields,
    fieldSchema,
  };
}

// ─── Owner-authored templates ─────────────────────────────────────────────────

export interface BriefOwnTemplateRef {
  _id: string;
  name: string;
  description?: string;
  documentType?: string;
  categoryLabel?: string;
}

export interface BriefOwnMatch extends BriefOwnTemplateRef {
  score: number;
}

/**
 * Score the user's own templates against the brief's wording. Own layouts are
 * ranked on their name, then their description, so a brief that says
 * "site handover letter" finds a saved "Site handover letter" layout.
 */
export function scoreOwnTemplates(text: string, templates: BriefOwnTemplateRef[]): BriefOwnMatch[] {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return templates
    .map((template) => {
      let score = 0;
      for (const word of template.name.toLowerCase().split(/[^a-z0-9]+/)) {
        if (word.length < 4) continue;
        if (haystack.includes(` ${word}`)) score += 6;
      }
      for (const word of (template.description ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
        if (word.length < 6) continue;
        if (haystack.includes(` ${word}`)) score += 1;
      }
      return { ...template, score };
    })
    .filter((template) => template.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Value shapes we can recognise anywhere a field label appears. */
const VALUE_PATTERN: Record<string, string> = {
  text: "[A-Za-z0-9][A-Za-z0-9&.,'()/ -]{1,60}",
  textarea: "[^\\n;]{6,200}",
  reference: "[A-Za-z0-9][A-Za-z0-9/.-]{2,32}",
  date: "[0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\\/[0-9]{1,2}\\/[0-9]{4}",
  time: "[0-9]{1,2}:[0-9]{2}",
  datetime: "[0-9]{4}-[0-9]{2}-[0-9]{2}(?:[T ][0-9]{1,2}:[0-9]{2})?",
  number: "[0-9]+(?:[.,][0-9]+)?",
  currency: "[0-9][0-9,]*\\.[0-9]{2}",
  url: "[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(?:\\/[^\\s,;]*)?",
  country: "[A-Za-z][A-Za-z .'-]{2,40}",
};

export interface SchemaExtraction {
  values: Record<string, string>;
  recognized: BriefRecognized[];
  missing: { id: string; label: string }[];
}

/**
 * Label-driven extraction for owner-authored schemas: every field is looked up
 * by its own label ("Delivery address", "Invoice 1") and the value that follows
 * it. Types decide the shape that is accepted, so a date field never swallows a
 * sentence.
 */
export function extractValuesForSchema(text: string, schema: TemplateSchema): SchemaExtraction {
  const values: Record<string, string> = {};
  const recognized: BriefRecognized[] = [];
  const missing: { id: string; label: string }[] = [];

  for (const field of schema.fields) {
    if (field.type === "image" || field.type === "color" || field.type === "checkbox") continue;
    const label = field.label?.trim() || field.id;
    const words = label
      .toLowerCase()
      .replace(/\((?:%|[a-z]+)\)/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 1 && !["the", "and", "for", "our", "your"].includes(word));
    if (words.length === 0) continue;

    const keyword = words.map(escapeRegExp).join("\\s+");
    const shape = VALUE_PATTERN[field.type] ?? VALUE_PATTERN.text;
    const matcher = new RegExp(`${keyword}\\s*(?:no|number|ref(?:erence)?|#)?\\s*[:#-]?\\s*(${shape})`, "i");
    const match = matcher.exec(text);
    const raw = match?.[1]?.trim() ?? "";
    const value = raw ? applyTransform(raw, transformForType(field.type)) : "";
    const finalValue = field.type === "select" || field.type === "status" ? matchOption(field, value) : value;

    if (finalValue) {
      values[field.id] = finalValue;
      recognized.push({ id: field.id, label, value: finalValue, confidence: "medium" });
    } else if (field.required) {
      missing.push({ id: field.id, label });
    }
  }

  return { values, recognized, missing };
}

function transformForType(type: FieldType): BriefTransform | undefined {
  switch (type) {
    case "date":
    case "datetime": return "date";
    case "time": return "text";
    case "currency":
    case "number": return "amount";
    case "reference": return "reference";
    default: return "text";
  }
}

function matchOption(field: FieldDef, value: string): string {
  if (!value) return "";
  const options = field.options ?? [];
  if (options.length === 0) return value;
  const needle = value.trim().toLowerCase();
  const found = options.find(
    (option) => option.value.toLowerCase() === needle || option.label.toLowerCase() === needle,
  );
  if (found) return found.value;
  const partial = options.find(
    (option) => needle.includes(option.label.toLowerCase()) || option.label.toLowerCase().includes(needle),
  );
  return partial?.value ?? "";
}
