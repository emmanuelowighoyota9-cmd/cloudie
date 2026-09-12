import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import type { VLiteral, Validator } from "convex/values";

/** Typed helper: tuple of v.literal() validators for spreading into v.union(). */
type LiteralTuple<T extends readonly string[]> = {
  [K in keyof T]: VLiteral<T[K]>;
};
const literals = <T extends readonly string[]>(values: T) =>
  values.map((s) => v.literal(s)) as unknown as LiteralTuple<T> & Validator<unknown>;

// ─── Roles ───
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  VENDOR: "vendor",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.VENDOR),
);
export type Role = Infer<typeof roleValidator>;

// ─── Enums ───
export const SHIPMENT_STATUSES = [
  "pending",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const POINT_TX_TYPES = [
  "deposit",
  "purchase",
  "service_charge",
  "refund",
  "admin_adjustment",
  "referral_reward",
  "vendor_transaction",
  "marketplace_purchase",
  "shipment_creation",
  "tracking_update",
  "document_generation",
  "email_dispatch",
  "image_rendering",
] as const;
export type PointTxType = (typeof POINT_TX_TYPES)[number];
export const pointTxTypeValidator = v.union(...literals(POINT_TX_TYPES));

export const DOCUMENT_TYPES = [
  "flight",
  "hotel",
  "invoice",
  "customs",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const KYC_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "resubmission_required",
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

// ─── Native tracking platform enums (CRESTLINE) ───
export const TRACKING_STATUSES = [
  "CREATED",
  "BOOKED",
  "PICKED_UP",
  "PROCESSING",
  "AT_ORIGIN_FACILITY",
  "DEPARTED_ORIGIN",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION_COUNTRY",
  "CUSTOMS_CLEARANCE",
  "CUSTOMS_CLEARED",
  "AT_DESTINATION_FACILITY",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPTED",
  "DELIVERED",
  "EXCEPTION",
  "ON_HOLD",
  "CANCELLED",
  "RETURNED",
] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];
export const trackingStatusValidator = v.union(...literals(TRACKING_STATUSES));

export const LOCATION_TYPES = [
  "country",
  "state",
  "city",
  "warehouse",
  "airport",
  "sorting_center",
  "distribution_center",
  "customs_facility",
  "delivery_hub",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];
export const locationTypeValidator = v.union(...literals(LOCATION_TYPES));

export const FACILITY_TYPES = [
  "warehouse",
  "airport",
  "sorting_center",
  "distribution_center",
  "customs_facility",
  "delivery_hub",
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];
export const facilityTypeValidator = v.union(...literals(FACILITY_TYPES));

export const ROUTE_STOP_STATUSES = [
  "pending",
  "arrived",
  "departed",
  "skipped",
] as const;
export type RouteStopStatus = (typeof ROUTE_STOP_STATUSES)[number];
export const routeStopStatusValidator = v.union(...literals(ROUTE_STOP_STATUSES));

export const SITE_TYPES = ["bank", "investment"] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "escrow",
  "completed",
  "refunded",
  "disputed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ─── Schema ───
const schema = defineSchema(
  {
    ...authTables,

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
      pointsBalance: v.optional(v.number()),
      referralCode: v.optional(v.string()),
      referredBy: v.optional(v.string()),
      isSuspended: v.optional(v.boolean()),
      isTerminated: v.optional(v.boolean()),
      terminatedAt: v.optional(v.number()),
      lastActiveAt: v.optional(v.number()),
      createdAt: v.optional(v.number()),
    })
      .index("email", ["email"])
      .index("referralCode", ["referralCode"])
      .index("by_createdAt", ["createdAt"]),

    pointLedger: defineTable({
      userId: v.id("users"),
      amount: v.number(),
      balanceAfter: v.number(),
      description: v.string(),
      type: v.union(...literals(POINT_TX_TYPES)),
      reference: v.optional(v.string()),
      referenceId: v.optional(v.string()),
      idempotencyKey: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId", "createdAt"])
      .index("by_type", ["type", "createdAt"])
      .index("by_idempotency", ["idempotencyKey"])
      .index("by_createdAt", ["createdAt"]),

    shipments: defineTable({
      userId: v.id("users"),
      trackingNumber: v.string(),
      status: v.union(
        ...literals(SHIPMENT_STATUSES),
      ),
      senderName: v.string(),
      senderPhone: v.string(),
      senderEmail: v.string(),
      senderAddress: v.string(),
      senderCity: v.string(),
      senderState: v.string(),
      senderCountry: v.string(),
      senderPostalCode: v.string(),
      recipientName: v.string(),
      recipientPhone: v.string(),
      recipientEmail: v.string(),
      recipientAddress: v.string(),
      recipientCity: v.string(),
      recipientState: v.string(),
      recipientCountry: v.string(),
      recipientPostalCode: v.string(),
      packageDescription: v.string(),
      weight: v.number(),
      dimensions: v.optional(v.string()),
      serviceType: v.string(),
      estimatedDelivery: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId", "createdAt"])
      .index("by_tracking", ["trackingNumber"])
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"]),

    shipmentEvents: defineTable({
      shipmentId: v.id("shipments"),
      status: v.string(),
      location: v.optional(v.string()),
      description: v.string(),
      metadata: v.optional(v.any()),
      timestamp: v.number(),
    }).index("by_shipment", ["shipmentId", "timestamp"]),

    documents: defineTable({
      userId: v.id("users"),
      type: v.union(
        ...literals(DOCUMENT_TYPES),
      ),
      title: v.string(),
      data: v.any(),
      pointsCost: v.number(),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    tenantSites: defineTable({
      ownerId: v.id("users"),
      siteName: v.string(),
      subdomain: v.string(),
      siteType: v.union(v.literal("bank"), v.literal("investment")),
      isActive: v.boolean(),
      renewalDate: v.optional(v.number()),
      branding: v.optional(
        v.object({
          logo: v.optional(v.string()),
          primaryColor: v.optional(v.string()),
          accentColor: v.optional(v.string()),
        }),
      ),
      contactEmail: v.optional(v.string()),
      contactPhone: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_owner", ["ownerId"])
      .index("by_subdomain", ["subdomain"]),

    kycRecords: defineTable({
      tenantId: v.id("tenantSites"),
      userId: v.id("users"),
      status: v.union(
        ...literals(KYC_STATUSES),
      ),
      fullName: v.string(),
      dateOfBirth: v.optional(v.string()),
      documentUrl: v.optional(v.string()), // legacy field, unused by the new flow
      storageFileId: v.optional(v.id("storageFiles")),
      documentName: v.optional(v.string()),
      resubmissionCount: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
      notes: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_tenant", ["tenantId", "createdAt"]).index("by_user", ["userId", "createdAt"]).index("by_status", ["status"]),

    tenantUsers: defineTable({
      tenantId: v.id("tenantSites"),
      userId: v.id("users"),
      role: v.string(),
      createdAt: v.number(),
    }).index("by_tenant", ["tenantId"]),

    tenantLedger: defineTable({
      tenantId: v.id("tenantSites"),
      userId: v.id("users"),
      amount: v.number(),
      description: v.string(),
      type: v.string(),
      createdAt: v.number(),
    }).index("by_tenant", ["tenantId", "createdAt"]),

    vendors: defineTable({
      userId: v.id("users"),
      businessName: v.string(),
      description: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      contactPhone: v.optional(v.string()),
      category: v.optional(v.string()),
      website: v.optional(v.string()),
      supportingInfo: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("approved"), v.literal("suspended"), v.literal("rejected")),
      statusReason: v.optional(v.string()),
      earnings: v.number(),
      totalSales: v.number(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]).index("by_status", ["status", "createdAt"]),

    marketplaceProducts: defineTable({
      vendorId: v.id("vendors"),
      name: v.string(),
      description: v.string(),
      pointsPrice: v.number(),
      category: v.string(),
      imageUrl: v.optional(v.string()),
      isActive: v.boolean(),
      isApproved: v.boolean(),
      totalSold: v.number(),
      createdAt: v.number(),
    }).index("by_vendor", ["vendorId"]).index("by_category", ["category"]),

    marketplaceOrders: defineTable({
      buyerId: v.id("users"),
      productId: v.id("marketplaceProducts"),
      vendorId: v.id("vendors"),
      quantity: v.number(),
      totalPoints: v.number(),
      status: v.union(
        ...literals(ORDER_STATUSES),
      ),
      createdAt: v.number(),
    }).index("by_buyer", ["buyerId"]).index("by_vendor", ["vendorId"]),

    disputes: defineTable({
      orderId: v.id("marketplaceOrders"),
      raisedBy: v.id("users"),
      reason: v.string(),
      priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"))),
      notes: v.optional(
        v.array(
          v.object({
            authorId: v.id("users"),
            authorEmail: v.optional(v.string()),
            text: v.string(),
            createdAt: v.number(),
          }),
        ),
      ),
      status: v.union(v.literal("open"), v.literal("under_review"), v.literal("resolved"), v.literal("closed")),
      resolution: v.optional(v.string()),
      resolvedBy: v.optional(v.id("users")),
      resolvedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_order", ["orderId"]).index("by_status", ["status", "createdAt"]),

    referrals: defineTable({
      referrerId: v.id("users"),
      referredUserId: v.id("users"),
      status: v.union(v.literal("pending"), v.literal("completed"), v.literal("rewarded")),
      rewardPoints: v.number(),
      createdAt: v.number(),
    }).index("by_referrer", ["referrerId"]).index("by_referred", ["referredUserId"]),

    notifications: defineTable({
      userId: v.id("users"),
      title: v.string(),
      message: v.string(),
      type: v.string(),
      isRead: v.boolean(),
      link: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    }).index("by_user", ["userId", "isRead", "createdAt"]),

    auditLogs: defineTable({
      actorId: v.optional(v.id("users")),
      actorEmail: v.optional(v.string()),
      action: v.string(),
      resource: v.string(),
      resourceId: v.optional(v.string()),
      before: v.optional(v.any()),
      after: v.optional(v.any()),
      reason: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_actor", ["actorId", "createdAt"]).index("by_action", ["action", "createdAt"]),

    assets: defineTable({
      userId: v.id("users"),
      name: v.string(),
      url: v.string(),
      type: v.string(),
      size: v.number(),
      folder: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]).index("by_createdAt", ["createdAt"]),

    emailCampaigns: defineTable({
      userId: v.id("users"),
      subject: v.string(),
      senderName: v.string(),
      content: v.string(),
      recipients: v.array(v.string()),
      status: v.union(v.literal("draft"), v.literal("scheduled"), v.literal("sent"), v.literal("failed")),
      scheduledAt: v.optional(v.number()),
      sentAt: v.optional(v.number()),
      totalRecipients: v.number(),
      pointsCost: v.number(),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    emailDeliveries: defineTable({
      campaignId: v.id("emailCampaigns"),
      recipientEmail: v.string(),
      status: v.union(v.literal("pending"), v.literal("sent"), v.string()),
      sentAt: v.optional(v.number()),
    }).index("by_campaign", ["campaignId"]),

    // ─── Super Admin tables ───
    pointPricing: defineTable({
      service: v.string(),
      workspace: v.string(),
      pointsCost: v.number(),
      isActive: v.boolean(),
      effectiveFrom: v.number(),
      updatedBy: v.optional(v.id("users")),
      updatedAt: v.number(),
    }).index("by_service", ["service"]),

    adminSettings: defineTable({
      key: v.string(),
      value: v.any(),
      category: v.string(),
      updatedBy: v.optional(v.id("users")),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),

    moderationFlags: defineTable({
      tenantId: v.id("tenantSites"),
      rule: v.string(),
      severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical")),
      status: v.union(v.literal("open"), v.literal("reviewing"), v.literal("resolved"), v.literal("dismissed")),
      details: v.optional(v.string()),
      reviewNotes: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_tenant", ["tenantId"]).index("by_status", ["status", "createdAt"]),

    adminSessions: defineTable({
      adminId: v.id("users"),
      action: v.string(),
      ip: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_admin", ["adminId", "createdAt"]),

    // ─── Native shipment tracking platform (CRESTLINE) ───
    // Internal location database — populated manually by admins. No geocoding APIs.
    trackingLocations: defineTable({
      name: v.string(),
      type: locationTypeValidator,
      country: v.string(),
      countryCode: v.string(),
      state: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      address: v.optional(v.string()),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      timezone: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_type", ["type"])
      .index("by_country", ["countryCode"])
      .index("by_active", ["isActive"]),

    trackingFacilities: defineTable({
      name: v.string(),
      code: v.string(),
      type: facilityTypeValidator,
      locationId: v.id("trackingLocations"),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_location", ["locationId"])
      .index("by_type", ["type"]),

    trackingCarriers: defineTable({
      name: v.string(),
      code: v.string(),
      logo: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
    }).index("by_code", ["code"]),

    trackingServiceTypes: defineTable({
      name: v.string(),
      code: v.string(),
      description: v.string(),
      estimatedTransitDays: v.number(),
      isActive: v.boolean(),
    }).index("by_code", ["code"]),

    // Full tracking-native shipments. The legacy `shipments` table keeps working;
    // this is the source of truth for the native tracking platform.
    trackingShipments: defineTable({
      trackingNumber: v.string(),
      referenceNumber: v.optional(v.string()),
      status: trackingStatusValidator,
      progress: v.number(),
      carrierId: v.optional(v.id("trackingCarriers")),
      serviceTypeId: v.optional(v.id("trackingServiceTypes")),
      serviceTypeName: v.string(),
      senderId: v.optional(v.id("users")),
      recipientId: v.optional(v.id("users")),
      originLocationId: v.optional(v.id("trackingLocations")),
      destinationLocationId: v.optional(v.id("trackingLocations")),
      currentLocationId: v.optional(v.id("trackingLocations")),
      senderName: v.string(),
      senderPhone: v.string(),
      senderEmail: v.string(),
      senderAddress: v.string(),
      senderCity: v.string(),
      senderState: v.string(),
      senderCountry: v.string(),
      senderPostalCode: v.string(),
      recipientName: v.string(),
      recipientPhone: v.string(),
      recipientEmail: v.string(),
      recipientAddress: v.string(),
      recipientCity: v.string(),
      recipientState: v.string(),
      recipientCountry: v.string(),
      recipientPostalCode: v.string(),
      packageDescription: v.string(),
      totalWeight: v.number(),
      weightUnit: v.union(v.literal("kg"), v.literal("lb")),
      dimensions: v.optional(v.string()),
      declaredValue: v.optional(v.number()),
      currency: v.optional(v.string()),
      notes: v.optional(v.string()),
      estimatedDelivery: v.optional(v.number()),
      actualDelivery: v.optional(v.number()),
      shippedAt: v.optional(v.number()),
      deliveredAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_tracking", ["trackingNumber"])
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"])
      .index("by_sender", ["senderId", "createdAt"])
      .searchIndex("search_tracking", { searchField: "trackingNumber" }),

    trackingEvents: defineTable({
      shipmentId: v.id("trackingShipments"),
      status: v.string(),
      title: v.string(),
      description: v.string(),
      locationId: v.optional(v.id("trackingLocations")),
      locationLabel: v.optional(v.string()),
      facilityId: v.optional(v.id("trackingFacilities")),
      eventTimestamp: v.number(),
      timezone: v.optional(v.string()),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      isPublic: v.boolean(),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    }).index("by_shipment", ["shipmentId", "eventTimestamp"]),

    trackingPackages: defineTable({
      shipmentId: v.id("trackingShipments"),
      packageNumber: v.number(),
      trackingNumber: v.string(),
      description: v.string(),
      packageType: v.string(),
      weight: v.number(),
      dimensions: v.optional(v.string()),
      quantity: v.number(),
      barcodeData: v.string(),
      qrData: v.string(),
      createdAt: v.number(),
    }).index("by_shipment", ["shipmentId", "packageNumber"]),

    trackingRouteStops: defineTable({
      shipmentId: v.id("trackingShipments"),
      locationId: v.optional(v.id("trackingLocations")),
      facilityId: v.optional(v.id("trackingFacilities")),
      label: v.string(),
      sequence: v.number(),
      status: routeStopStatusValidator,
      arrivalAt: v.optional(v.number()),
      departureAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_shipment", ["shipmentId", "sequence"]),

    // ─── Cloudie-owned storage abstraction ───
    // Metadata for every file Cloudie stores. Bytes live in the runtime's own
    // file storage; ALL authorization/ownership flows through this table.
    storageFiles: defineTable({
      storageId: v.id("_storage"),
      ownerId: v.id("users"),
      tenantId: v.optional(v.id("tenantSites")),
      kind: v.union(
        v.literal("kyc_document"),
        v.literal("pdf_document"),
        v.literal("image"),
        v.literal("generic"),
      ),
      originalName: v.string(),
      mimeType: v.string(),
      sizeBytes: v.number(),
      path: v.string(),
      sha256: v.optional(v.string()),
      isDeleted: v.boolean(),
      createdAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
      .index("by_owner", ["ownerId", "createdAt"])
      .index("by_tenant", ["tenantId"])
      .index("by_storage", ["storageId"]),

    // ─── Document engine: templates → versions → render → stored bytes ───
    documentTemplates: defineTable({
      documentType: v.string(),
      name: v.string(),
      createdById: v.id("users"),
      tenantId: v.optional(v.id("tenantSites")),
      isActive: v.boolean(),
      currentVersion: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_type", ["documentType"])
      .index("by_creator", ["createdById", "createdAt"]),

    documentTemplateVersions: defineTable({
      templateId: v.id("documentTemplates"),
      version: v.number(),
      title: v.string(),
      blocks: v.any(), // PdfBlock[] structure validated at render time
      pointsCost: v.number(),
      createdById: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_template", ["templateId", "version"]),

    renderedDocuments: defineTable({
      templateVersionId: v.id("documentTemplateVersions"),
      ownerId: v.id("users"),
      tenantId: v.optional(v.id("tenantSites")),
      storageFileId: v.id("storageFiles"),
      fileName: v.string(),
      pageCount: v.number(),
      sizeBytes: v.number(),
      metadata: v.optional(v.any()),
      pointsCost: v.number(),
      createdAt: v.number(),
    })
      .index("by_owner", ["ownerId", "createdAt"])
      .index("by_tenant", ["tenantId"])
      .index("by_version", ["templateVersionId", "createdAt"]),

    // ─── Cloudie email engine (no third-party SaaS) ───
    emailMessages: defineTable({
      to: v.string(),
      fromName: v.string(),
      subject: v.string(),
      textBody: v.string(),
      templateKey: v.optional(v.string()),
      userId: v.optional(v.id("users")),
      campaignId: v.optional(v.id("emailCampaigns")),
      jobId: v.optional(v.id("cloudieJobs")),
      status: v.union(
        v.literal("queued"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("bounced"),
        v.literal("blocked_unsubscribed"),
      ),
      attempts: v.number(),
      maxAttempts: v.number(),
      nextAttemptAt: v.number(),
      lastError: v.optional(v.string()),
      providerMessageId: v.optional(v.string()),
      sentAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status", ["status", "nextAttemptAt"])
      .index("by_campaign", ["campaignId"])
      .index("by_to", ["to", "createdAt"]),

    emailDeliveryLogs: defineTable({
      messageId: v.id("emailMessages"),
      event: v.union(
        v.literal("queued"),
        v.literal("send_attempt"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("bounced"),
        v.literal("blocked_unsubscribed"),
      ),
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_message", ["messageId", "createdAt"]),

    emailUnsubscribes: defineTable({
      email: v.string(),
      reason: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_email", ["email"]),

    // ─── Cloudie job system (Postgres-equivalent: Convex-owned DB queue) ───
    cloudieJobs: defineTable({
      type: v.string(),
      payload: v.any(),
      status: v.union(
        v.literal("queued"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("dead"),
      ),
      attempts: v.number(),
      maxAttempts: v.number(),
      runAfter: v.number(),
      claimedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      failedAt: v.optional(v.number()),
      lastError: v.optional(v.string()),
      idempotencyKey: v.optional(v.string()),
      result: v.optional(v.any()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status", ["status", "runAfter"])
      .index("by_idempotency", ["idempotencyKey"])
      .index("by_type", ["type", "createdAt"]),

    // ─── Payments: the ONE intentional external integration (Paystack) ───
    paymentOrders: defineTable({
      orderNumber: v.string(),
      buyerId: v.id("users"),
      kind: v.union(v.literal("points_package")),
      packageId: v.string(),
      points: v.number(),
      amountSubunit: v.number(), // authoritative server-side amount (cents/kobo)
      currency: v.string(),
      status: v.union(
        v.literal("initialized"),
        v.literal("pending"),
        v.literal("paid"),
        v.literal("failed"),
        v.literal("abandoned"),
      ),
      paystackReference: v.optional(v.string()),
      accessCode: v.optional(v.string()),
      authorizationUrl: v.optional(v.string()),
      verifiedAt: v.optional(v.number()),
      paidAt: v.optional(v.number()),
      failureReason: v.optional(v.string()),
      creditedLedgerId: v.optional(v.id("pointLedger")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_buyer", ["buyerId", "createdAt"])
      .index("by_reference", ["paystackReference"])
      .index("by_order", ["orderNumber"]),

    // Webhook event log: idempotency + replay protection
    paymentWebhookEvents: defineTable({
      eventId: v.string(),
      reference: v.string(),
      channel: v.string(),
      signatureValid: v.boolean(),
      processedAt: v.number(),
      duplicate: v.boolean(),
    }).index("by_event", ["eventId"]),

    // ─── Crypto provider abstraction (BLOCKED without infra) ───
    cryptoDeposits: defineTable({
      userId: v.id("users"),
      asset: v.string(),
      address: v.string(),
      expectedAmount: v.number(),
      receivedAmount: v.optional(v.number()),
      confirmations: v.number(),
      state: v.union(
        v.literal("awaiting_deposit"),
        v.literal("confirming"),
        v.literal("confirmed"),
        v.literal("failed"),
      ),
      txHash: v.optional(v.string()),
      normalizedEvent: v.optional(v.any()),
      idempotencyKey: v.optional(v.string()),
      creditedLedgerId: v.optional(v.id("pointLedger")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId", "createdAt"])
      .index("by_state", ["state"]),

    // ─── KYC audit history (first-party review workflow) ───
    kycEvents: defineTable({
      kycId: v.id("kycRecords"),
      actorId: v.id("users"),
      action: v.string(),
      fromStatus: v.optional(v.string()),
      toStatus: v.optional(v.string()),
      reason: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_kyc", ["kycId", "createdAt"]),

    // ─── Notification preferences (Cloudie-owned delivery state) ───
    notificationPreferences: defineTable({
      userId: v.id("users"),
      inApp: v.boolean(),
      email: v.boolean(),
      shipmentEvents: v.boolean(),
      marketplaceEvents: v.boolean(),
      pointsEvents: v.boolean(),
      marketing: v.boolean(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
