import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

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

export const DOCUMENT_TYPES = [
  "flight",
  "hotel",
  "invoice",
  "customs",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const KYC_STATUSES = [
  "pending",
  "under_review",
  "verified",
  "rejected",
  "more_information_required",
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

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
      type: v.union(...POINT_TX_TYPES.map((t) => v.literal(t)) as [any, ...any[]]),
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
        ...SHIPMENT_STATUSES.map((s) => v.literal(s)) as [any, ...any[]],
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
        ...DOCUMENT_TYPES.map((t) => v.literal(t)) as [any, ...any[]],
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
        ...KYC_STATUSES.map((s) => v.literal(s)) as [any, ...any[]],
      ),
      fullName: v.string(),
      dateOfBirth: v.optional(v.string()),
      documentUrl: v.optional(v.string()),
      notes: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_tenant", ["tenantId", "createdAt"]),

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
        ...ORDER_STATUSES.map((s) => v.literal(s)) as [any, ...any[]],
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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
