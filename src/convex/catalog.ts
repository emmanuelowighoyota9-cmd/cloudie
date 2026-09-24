import { query } from "./_generated/server";
import { requireAdmin } from "./adminApi";

/**
 * Platform service catalog.
 *
 * `pointPricing` stores whatever an admin has configured; this file holds the
 * canonical definition of every service the platform can bill, so the admin
 * catalog can show a human name, a description, the customer-facing unit and
 * the platform default cost even before a price row exists.
 *
 * `defaultPoints` MUST stay in sync with the fallback passed to
 * `effectivePointsCost` at each charging site.
 */

export const CATALOG_WORKSPACES = [
  { key: "shipments", label: "Shipments" },
  { key: "documents", label: "Documents" },
  { key: "ticketing", label: "Ticketing" },
  { key: "services", label: "Services" },
  { key: "business", label: "Business sites" },
  { key: "platform", label: "Platform" },
] as const;

export type CatalogServiceDef = {
  service: string;
  label: string;
  description: string;
  workspace: string;
  unit: string;
  defaultPoints: number;
};

export const CATALOG_SERVICES: CatalogServiceDef[] = [
  {
    service: "shipment_create",
    label: "Create a shipment",
    description: "Book a new shipment and mint its tracking number.",
    workspace: "shipments",
    unit: "per shipment",
    defaultPoints: 100,
  },
  {
    service: "shipment_tracking_update",
    label: "Push a tracking update",
    description: "Append a scan or status update to a shipment timeline.",
    workspace: "shipments",
    unit: "per update",
    defaultPoints: 25,
  },
  {
    service: "shipment_event_add",
    label: "Add a shipment event",
    description: "Log an event such as pickup, delay or delivery attempt.",
    workspace: "shipments",
    unit: "per event",
    defaultPoints: 15,
  },
  {
    service: "document_render",
    label: "Generate a document",
    description: "Render a PDF or PNG from any document template in the library.",
    workspace: "documents",
    unit: "per document",
    defaultPoints: 40,
  },
  {
    service: "flight_pdf",
    label: "Flight itinerary",
    description: "Issue a flight itinerary document from the ticketing suite.",
    workspace: "ticketing",
    unit: "per document",
    defaultPoints: 150,
  },
  {
    service: "hotel_pdf",
    label: "Hotel voucher",
    description: "Issue a hotel booking voucher document.",
    workspace: "ticketing",
    unit: "per document",
    defaultPoints: 120,
  },
  {
    service: "commercial_invoice",
    label: "Commercial invoice",
    description: "Produce a commercial invoice for a trade shipment.",
    workspace: "ticketing",
    unit: "per document",
    defaultPoints: 80,
  },
  {
    service: "customs_document",
    label: "Customs document",
    description: "Produce the customs paperwork for a shipment.",
    workspace: "ticketing",
    unit: "per document",
    defaultPoints: 100,
  },
  {
    service: "email_per_recipient",
    label: "Email delivery",
    description: "Deliver one campaign email to one recipient.",
    workspace: "services",
    unit: "per recipient",
    defaultPoints: 10,
  },
  {
    service: "image_render",
    label: "Render studio artwork",
    description: "Produce a rendered image or artwork export in the render studio.",
    workspace: "services",
    unit: "per render",
    defaultPoints: 50,
  },
  {
    service: "tenant_site_create",
    label: "Publish a business site",
    description: "Create and publish a tenant site under its own subdomain.",
    workspace: "business",
    unit: "per site",
    defaultPoints: 250,
  },
  {
    service: "marketplace_purchase_fee",
    label: "Marketplace order fee",
    description: "Platform fee added to marketplace purchases (0 keeps orders fee-free).",
    workspace: "platform",
    unit: "per order",
    defaultPoints: 0,
  },
];

/** "shipment_create" → "Shipment Create" — used for admin-added services. */
export function humanizeServiceKey(service: string): string {
  return service
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const WORKSPACE_ORDER = new Map<string, number>(CATALOG_WORKSPACES.map((w, i) => [w.key, i]));

/**
 * Admin: the full catalog — every canonical service merged with its configured
 * price, plus any custom service an admin has added, ordered by workspace.
 */
export const getCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const rows = await ctx.db.query("pointPricing").withIndex("by_service").take(300);
    const byService = new Map(rows.map((row) => [row.service, row]));

    const services = CATALOG_SERVICES.map((def) => {
      const row = byService.get(def.service);
      return {
        service: def.service,
        label: row?.label?.trim() || def.label,
        description: row?.description?.trim() || def.description,
        workspace: row?.workspace || def.workspace,
        unit: def.unit,
        defaultPoints: def.defaultPoints,
        pointsCost: row?.pointsCost ?? def.defaultPoints,
        priceNgn: row?.priceNgn,
        priceUsd: row?.priceUsd,
        isActive: row?.isActive ?? false,
        configured: row !== undefined,
        updatedAt: row?.updatedAt ?? 0,
        /** True for services that exist only because an admin added them. */
        custom: false,
      };
    });

    const canonical = new Set(CATALOG_SERVICES.map((def) => def.service));
    for (const row of rows) {
      if (canonical.has(row.service)) continue;
      services.push({
        service: row.service,
        label: row.label?.trim() || humanizeServiceKey(row.service),
        description: row.description?.trim() || "Custom service added by an admin.",
        workspace: row.workspace,
        unit: "per use",
        defaultPoints: 0,
        pointsCost: row.pointsCost,
        priceNgn: row.priceNgn,
        priceUsd: row.priceUsd,
        isActive: row.isActive,
        configured: true,
        updatedAt: row.updatedAt,
        custom: true,
      });
    }

    services.sort(
      (a, b) =>
        (WORKSPACE_ORDER.get(a.workspace) ?? 99) - (WORKSPACE_ORDER.get(b.workspace) ?? 99) ||
        a.label.localeCompare(b.label),
    );

    return {
      services,
      workspaces: CATALOG_WORKSPACES.map((w) => ({ key: w.key as string, label: w.label as string })),
    };
  },
});
