import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin, auditLog } from "./adminApi";
import { effectivePointsCost } from "./pricing";
import type { Id } from "./_generated/dataModel";

type StorageFileId = Id<"storageFiles">;
import {
  CATEGORIES,
  categoryDef,
  defaultValues,
  generateShareSlug,
  isValidShareSlug,
  renderIdempotencyKey,
  resolveRenderCost,
  sanitizeText,
  buildPreviewSvg,
  shareState,
  validateTemplateDefinition,
  validateValues,
  type DocumentValues,
  type TemplateConfiguration,
  type TemplateSchema,
} from "../lib/docTemplateEngine";
import { STARTER_SET_VERSION, STARTER_TEMPLATES } from "../lib/starterTemplates";

/**
 * Cloudie document workspace.
 *
 * Templates are versioned: every generated document points at a frozen
 * `documentTemplateVersions.blocks` snapshot, so editing a live template never
 * changes a document that was already produced.
 *
 * Rendering happens on the client (SVG → PNG via canvas → PDF via the
 * dependency-free raster PDF writer), then the artifacts are uploaded and
 * `finalizeDocument` is the ONLY place points are charged — server-side,
 * schema-validated and idempotent per render attempt.
 */

const RENDER_SERVICE = "document_render";
const DEFAULT_RENDER_COST = 40;
const MAX_LIST = 100;
const MAX_DOCUMENTS = 60;
const MAX_IMAGE_B64 = 4_500_000;

type VersionBlocks = {
  schema: TemplateSchema;
  configuration: TemplateConfiguration;
  sensitivity: string;
  requiredCredits: number;
  supportedFormats: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Keep only schema-known fields; sanitize every string. Never trust the client. */
function sanitizeValues(schema: TemplateSchema, raw: unknown): DocumentValues {
  const input = (raw ?? {}) as Record<string, unknown>;
  const out: DocumentValues = {};
  for (const field of schema.fields) {
    const value = input[field.id];
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") out[field.id] = value;
    else if (typeof value === "number") out[field.id] = String(value);
    else out[field.id] = sanitizeText(String(value), field.maxLength ?? 4000);
  }
  return out;
}

/** Fixed-window rate limiter, persisted — no Redis in this runtime. */
async function consumeRateLimit(
  ctx: { db: any },
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const row = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key_and_window", (q: any) => q.eq("key", key).eq("windowStart", windowStart))
    .first();
  if (!row) {
    await ctx.db.insert("rateLimitBuckets", { key, windowStart, count: 1 });
    return true;
  }
  if (row.count >= limit) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "document";
}

// ─── Templates: public reads ──────────────────────────────────────────────────

/** Category tiles for the document library, with live template counts. */
export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const templates = await ctx.db
      .query("documentTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(500);
    const counts = new Map<string, number>();
    // Private rows are a single customer's own documents — never counted here.
    for (const t of templates) {
      if (t.visibility === "private") continue;
      counts.set(t.documentType, (counts.get(t.documentType) ?? 0) + 1);
    }
    return CATEGORIES.filter((c) => c.enabledByDefault).map((c) => ({
      key: c.key,
      label: c.label,
      description: c.description,
      sensitive: c.sensitive,
      count: counts.get(c.key) ?? 0,
    }));
  },
});

export const listTemplates = query({
  args: {
    documentType: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 60, 1), MAX_LIST);
    const rows = args.documentType
      ? await ctx.db
          .query("documentTemplates")
          .withIndex("by_type", (q) => q.eq("documentType", args.documentType!))
          .take(limit)
      : await ctx.db
          .query("documentTemplates")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .take(limit);

    const needle = args.search?.trim().toLowerCase() ?? "";
    return rows
      .filter((t) => t.isActive && (!args.documentType || t.status === "active"))
      // Customer-authored documents live in their own section, never the grid.
      .filter((t) => t.visibility !== "private")
      .filter((t) =>
        needle.length === 0
          ? true
          : t.name.toLowerCase().includes(needle) || t.description?.toLowerCase().includes(needle) === true,
      )
      .slice(0, limit)
      .map((t) => {
        const schema = (t.schema as TemplateSchema | undefined) ?? { fields: [] };
        const configuration = (t.configuration as TemplateConfiguration | undefined) ?? { pages: [] };
        const isSensitive =
          t.sensitivity === "sensitive" || categoryDef(t.documentType).sensitive;
        // Thumbnails are built from the template's own defaults, so the library
        // shows an authentic preview without shipping full layouts to the client.
        let previewSvg = "";
        try {
          previewSvg = buildPreviewSvg(configuration, schema, defaultValues(schema), {
            sensitive: isSensitive,
          });
        } catch {
          previewSvg = "";
        }
        return {
          _id: t._id,
          name: t.name,
          slug: t.slug,
          description: t.description ?? "",
          documentType: t.documentType,
          categoryLabel: categoryDef(t.documentType).label,
          sensitivity: t.sensitivity ?? "standard",
          requiredCredits: t.requiredCredits ?? 0,
          supportedFormats: t.supportedFormats ?? ["png", "pdf"],
          currentVersion: t.currentVersion,
          fieldCount: schema.fields.length,
          isSensitive,
          previewSvg,
          updatedAt: t.updatedAt,
        };
      });
  },
});

export const getTemplate = query({
  args: { templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const template = await ctx.db.get(args.templateId);
    if (!template || !template.isActive) return null;
    const version = await ctx.db
      .query("documentTemplateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .order("desc")
      .first();
    if (!version) return null;
    const blocks = version.blocks as VersionBlocks;
    return {
      _id: template._id,
      name: template.name,
      slug: template.slug,
      description: template.description ?? "",
      documentType: template.documentType,
      categoryLabel: categoryDef(template.documentType).label,
      sensitivity: template.sensitivity ?? "standard",
      supportedFormats: template.supportedFormats ?? ["png", "pdf"],
      currentVersion: template.currentVersion,
      versionId: version._id,
      requiredCredits: resolveRenderCost(
        await effectivePointsCost(ctx, RENDER_SERVICE, DEFAULT_RENDER_COST),
        blocks?.requiredCredits ?? template.requiredCredits ?? 0,
        DEFAULT_RENDER_COST,
      ),
      schema: blocks?.schema ?? { fields: [] },
      configuration: blocks?.configuration ?? { pages: [] },
      defaults: defaultValues(blocks?.schema ?? { fields: [] }),
      artworkUrl: await artworkUrl(ctx, template.artworkFileId, userId),
    };
  },
});

// ─── Seeding ──────────────────────────────────────────────────────────────────

const SEED_VERSION_KEY = "cloudie_seed_version";

/**
 * Idempotent platform seeding.
 *
 * Installs the starter templates the first time a user opens the library, and
 * republishes them as new versions when the starter set changes. Existing
 * template rows keep their ids, so links and analytics stay stable, while
 * already-generated documents continue to render from their frozen snapshots.
 */
export const ensureStarterTemplates = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const marker = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", SEED_VERSION_KEY))
      .first();
    // Legacy deployments stored the marker under the previous key. Treat
    // that value as the current version so existing data is not reseeded twice,
    // then migrate it to the new Cloudie key on the next seed pass.
    const legacyMarker = marker
      ? null
      : await ctx.db
          .query("adminSettings")
          .withIndex("by_key", (q) => q.eq("key", "softbaker_seed_version"))
          .first();
    const effectiveMarker = marker ?? legacyMarker;
    const seededVersion =
      typeof effectiveMarker?.value === "number" ? (effectiveMarker.value as number) : 0;
    if (seededVersion >= STARTER_SET_VERSION) return { created: 0, updated: 0 };

    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const starter of STARTER_TEMPLATES) {
      const issues = validateTemplateDefinition(starter.schema, starter.configuration);
      if (issues.length > 0) continue; // never ship an invalid template

      const blocks: VersionBlocks = {
        schema: starter.schema,
        configuration: starter.configuration,
        sensitivity: starter.sensitivity,
        requiredCredits: starter.requiredCredits,
        supportedFormats: starter.supportedFormats,
      };

      const existing = await ctx.db
        .query("documentTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", starter.slug))
        .first();

      if (existing) {
        const nextVersion = existing.currentVersion + 1;
        await ctx.db.insert("documentTemplateVersions", {
          templateId: existing._id,
          version: nextVersion,
          title: starter.name,
          blocks,
          pointsCost: starter.requiredCredits,
          createdById: existing.createdById,
          createdAt: now,
        });
        await ctx.db.patch(existing._id, {
          documentType: starter.documentType,
          name: starter.name,
          description: starter.description,
          sensitivity: starter.sensitivity,
          requiredCredits: starter.requiredCredits,
          supportedFormats: starter.supportedFormats,
          schema: starter.schema,
          configuration: starter.configuration,
          currentVersion: nextVersion,
          updatedAt: now,
        });
        updated++;
        continue;
      }

      const templateId = await ctx.db.insert("documentTemplates", {
        documentType: starter.documentType,
        name: starter.name,
        slug: starter.slug,
        description: starter.description,
        renderer: "svg",
        status: "active",
        visibility: "public",
        sensitivity: starter.sensitivity,
        requiredCredits: starter.requiredCredits,
        supportedFormats: starter.supportedFormats,
        schema: starter.schema,
        configuration: starter.configuration,
        createdById: userId,
        isActive: true,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("documentTemplateVersions", {
        templateId,
        version: 1,
        title: starter.name,
        blocks,
        pointsCost: starter.requiredCredits,
        createdById: userId,
        createdAt: now,
      });
      created++;
    }

    if (marker) {
      await ctx.db.patch(marker._id, {
        value: STARTER_SET_VERSION,
        updatedBy: userId,
        updatedAt: now,
      });
    } else if (legacyMarker) {
      await ctx.db.patch(legacyMarker._id, {
        key: SEED_VERSION_KEY,
        value: STARTER_SET_VERSION,
        updatedBy: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: SEED_VERSION_KEY,
        value: STARTER_SET_VERSION,
        category: "documents",
        updatedBy: userId,
        updatedAt: now,
      });
    }

    return { created, updated };
  },
});

// ─── Drafts & generation ──────────────────────────────────────────────────────

export const createDocument = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    title: v.optional(v.string()),
    values: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const template = await ctx.db.get(args.templateId);
    if (!template || !template.isActive) throw new Error("Template unavailable");
    const version = await ctx.db
      .query("documentTemplateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .order("desc")
      .first();
    if (!version) throw new Error("Template has no published version");

    const blocks = version.blocks as VersionBlocks;
    const schema = blocks?.schema ?? { fields: [] };
    const values = sanitizeValues(schema, args.values);
    // A customer's own documents are issued under their organization name:
    // the letterhead field starts from their profile setting when left blank.
    if (schema.fields.some((f) => f.id === "organization") && !String(values.organization ?? "").trim()) {
      const org = (await ctx.db.get(userId))?.organizationName?.trim();
      if (org) values.organization = sanitizeText(org, 60);
    }
    const title = sanitizeText(args.title?.trim() || template.name, 120);
    const now = Date.now();

    const documentId = await ctx.db.insert("renderedDocuments", {
      templateVersionId: version._id,
      templateId: template._id,
      templateVersion: version.version,
      ownerId: userId,
      title,
      status: "draft",
      inputData: values,
      fileName: `${slugify(title)}.pdf`,
      pageCount: 0,
      sizeBytes: 0,
      viewCount: 0,
      isPublic: false,
      pointsCost: 0,
      metadata: { category: template.documentType, sensitivity: template.sensitivity ?? "standard" },
      createdAt: now,
      updatedAt: now,
    });

    return { documentId, values };
  },
});

export const updateDocumentValues = mutation({
  args: {
    documentId: v.id("renderedDocuments"),
    title: v.optional(v.string()),
    values: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");

    const version = await ctx.db.get(doc.templateVersionId);
    const blocks = version?.blocks as VersionBlocks | undefined;
    const schema = blocks?.schema ?? { fields: [] };
    const values = sanitizeValues(schema, args.values);
    const title = args.title ? sanitizeText(args.title.trim() || "Untitled", 120) : doc.title;

    await ctx.db.patch(args.documentId, {
      inputData: values,
      title,
      updatedAt: Date.now(),
    });
    return { values };
  },
});

/**
 * Server-side completion of a client-rendered document.
 *
 * Validates the input values against the frozen template schema, debits the
 * render cost exactly once per attempt (idempotent via the ledger index),
 * registers the uploaded PNG/PDF artifacts, and records audit + notification.
 */
export const finalizeDocument = mutation({
  args: {
    documentId: v.id("renderedDocuments"),
    attemptId: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    pdfStorageId: v.optional(v.id("_storage")),
    pageCount: v.number(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");

    const attemptId = sanitizeText(args.attemptId, 64);
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;

    // Fully idempotent: the same attempt can never charge or store twice.
    if (doc.status === "completed" && meta.lastAttemptId === attemptId) {
      return { documentId: doc._id, charged: 0, alreadyCompleted: true };
    }

    const version = await ctx.db.get(doc.templateVersionId);
    if (!version) throw new Error("Template version missing");
    const blocks = version.blocks as VersionBlocks;
    const schema = blocks?.schema ?? { fields: [] };

    // Strict validation happens server-side, not in the browser.
    const result = validateValues(schema, (doc.inputData ?? {}) as DocumentValues);
    if (!result.ok) {
      await ctx.db.patch(args.documentId, {
        status: "failed",
        failureReason: `Validation failed: ${result.issues.map((i) => i.message).join("; ")}`.slice(0, 400),
        updatedAt: Date.now(),
      });
      throw new Error(result.issues.map((i) => i.message).join("; "));
    }

    if (!args.pdfStorageId && !args.imageStorageId) {
      throw new Error("No rendered artifacts were uploaded");
    }

    const cost = resolveRenderCost(
      await effectivePointsCost(ctx, RENDER_SERVICE, DEFAULT_RENDER_COST),
      blocks?.requiredCredits ?? 0,
      DEFAULT_RENDER_COST,
    );

    // ── Charge (idempotent) ──
    const idempotencyKey = renderIdempotencyKey(args.documentId, "pdf", attemptId);
    const prior = await ctx.db
      .query("pointLedger")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    let charged = 0;
    const freshUser = await ctx.db.get(userId);
    const balance = freshUser?.pointsBalance ?? 0;
    if (!prior) {
      if (balance < cost) {
        throw new Error(`Insufficient points. This render costs ${cost} points.`);
      }
      const newBalance = balance - cost;
      await ctx.db.patch(userId, { pointsBalance: newBalance });
      await ctx.db.insert("pointLedger", {
        userId,
        amount: -cost,
        balanceAfter: newBalance,
        description: `${doc.title ?? "Document"} render`,
        type: "document_generation",
        reference: "document",
        referenceId: args.documentId,
        idempotencyKey,
        metadata: { attemptId, pageCount: args.pageCount },
        createdAt: Date.now(),
      });
      charged = cost;
    }

    // ── Register artifacts, replacing any previous render of this document ──
    const previousFileIds: StorageFileId[] = [doc.imageFileId, doc.pdfFileId].filter(
      (value): value is StorageFileId => value !== undefined,
    );
    for (const fileId of previousFileIds) {
      const file = await ctx.db.get(fileId);
      if (file && !file.isDeleted) {
        await ctx.storage.delete(file.storageId);
        await ctx.db.patch(fileId, { isDeleted: true, deletedAt: Date.now() });
      }
    }

    let imageFileId: StorageFileId | undefined = doc.imageFileId ?? undefined;
    let pdfFileId: StorageFileId | undefined = doc.pdfFileId ?? undefined;
    if (args.imageStorageId) {
      imageFileId = await ctx.runMutation(internal.storage.registerEngineFile, {
        storageId: args.imageStorageId,
        ownerId: userId,
        kind: "image",
        originalName: `${slugify(doc.title ?? "document")}.png`,
        mimeType: "image/png",
      });
    }
    if (args.pdfStorageId) {
      pdfFileId = await ctx.runMutation(internal.storage.registerEngineFile, {
        storageId: args.pdfStorageId,
        ownerId: userId,
        kind: "pdf_document",
        originalName: `${slugify(doc.title ?? "document")}.pdf`,
        mimeType: "application/pdf",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      status: "completed",
      inputData: result.values,
      imageFileId,
      pdfFileId,
      storageFileId: pdfFileId ?? imageFileId,
      fileName: `${slugify(doc.title ?? "document")}.${pdfFileId ? "pdf" : "png"}`,
      pageCount: Math.max(0, Math.min(Math.round(args.pageCount), 20)),
      sizeBytes: Math.max(0, Math.round(args.sizeBytes)),
      pointsCost: (doc.pointsCost ?? 0) + charged,
      failureReason: undefined,
      metadata: {
        ...meta,
        lastAttemptId: attemptId,
        category: doc.metadata?.category,
        sensitivity: blocks?.sensitivity ?? "standard",
        renderedAt: now,
      },
      updatedAt: now,
    });

    await ctx.db.insert("notifications", {
      userId,
      title: "Document generated",
      message: `${doc.title ?? "Document"} is ready to download`,
      type: "document_generated",
      isRead: false,
      link: `/documents/${args.documentId}`,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "DOCUMENT_RENDERED",
      resource: "renderedDocuments",
      resourceId: args.documentId,
      after: { cost: charged, pageCount: args.pageCount, attemptId },
      createdAt: now,
    });

    return { documentId: args.documentId, charged, alreadyCompleted: false };
  },
});

// ─── Library reads ────────────────────────────────────────────────────────────

export const listMyDocuments = query({
  args: { limit: v.optional(v.number()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 30, 1), MAX_DOCUMENTS);
    const rows = await ctx.db
      .query("renderedDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(limit);
    return rows
      .filter((d) => (args.status ? d.status === args.status : true))
      .map((d) => ({
        _id: d._id,
        title: d.title ?? "Untitled document",
        status: d.status ?? "draft",
        fileName: d.fileName,
        pageCount: d.pageCount,
        sizeBytes: d.sizeBytes,
        pointsCost: d.pointsCost,
        isPublic: d.isPublic ?? false,
        publicSlug: d.publicSlug ?? null,
        category: (d.metadata as Record<string, unknown> | undefined)?.category as string | undefined,
        templateVersion: d.templateVersion ?? 1,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt ?? d.createdAt,
      }));
  },
});

export const getDocument = query({
  args: { documentId: v.id("renderedDocuments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    if (doc.ownerId !== userId && user?.role !== "admin") return null;

    const template = doc.templateId ? await ctx.db.get(doc.templateId) : null;
    const version = await ctx.db.get(doc.templateVersionId);
    const blocks = version?.blocks as VersionBlocks | undefined;

    const urlFor = async (fileId?: StorageFileId) => {
      if (!fileId) return null;
      const file = await ctx.db.get(fileId);
      if (!file || file.isDeleted) return null;
      return await ctx.storage.getUrl(file.storageId);
    };

    return {
      _id: doc._id,
      title: doc.title ?? "Untitled document",
      status: doc.status ?? "draft",
      fileName: doc.fileName,
      pageCount: doc.pageCount,
      sizeBytes: doc.sizeBytes,
      pointsCost: doc.pointsCost,
      isPublic: doc.isPublic ?? false,
      publicSlug: doc.publicSlug ?? null,
      expiresAt: doc.expiresAt ?? null,
      revokedAt: doc.revokedAt ?? null,
      viewCount: doc.viewCount ?? 0,
      values: doc.inputData ?? {},
      failureReason: doc.failureReason ?? null,
      templateId: doc.templateId ?? null,
      templateVersion: doc.templateVersion ?? 1,
      templateName: template?.name ?? "Template removed",
      category: template?.documentType ?? "general",
      categoryLabel: categoryDef(template?.documentType ?? "general").label,
      sensitivity: (blocks?.sensitivity ?? template?.sensitivity ?? "standard") as string,
      schema: blocks?.schema ?? { fields: [] },
      configuration: blocks?.configuration ?? { pages: [] },
      imageUrl: await urlFor(doc.imageFileId),
      pdfUrl: await urlFor(doc.pdfFileId),
      shareState: shareState({
        isPublic: doc.isPublic,
        status: doc.status,
        expiresAt: doc.expiresAt,
        revokedAt: doc.revokedAt,
      }),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt ?? doc.createdAt,
    };
  },
});

export const getStudioStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const docs = await ctx.db
      .query("renderedDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(200);

    const user = await ctx.db.get(userId);
    let generated = 0;
    let shared = 0;
    let drafts = 0;
    let credits = 0;
    let storageBytes = 0;
    for (const d of docs) {
      const status = d.status ?? "draft";
      if (status === "completed" || status === "shared") generated++;
      if (d.isPublic && !d.revokedAt) shared++;
      if (status === "draft") drafts++;
      credits += d.pointsCost ?? 0;
      storageBytes += d.sizeBytes ?? 0;
    }
    const templateCount = (
      await ctx.db
        .query("documentTemplates")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(500)
    ).length;

    return {
      documents: docs.length,
      generated,
      shared,
      drafts,
      credits,
      storageBytes,
      templates: templateCount,
      balance: user?.pointsBalance ?? 0,
      recent: docs.slice(0, 6).map((d) => ({
        _id: d._id,
        title: d.title ?? "Untitled document",
        status: d.status ?? "draft",
        pointsCost: d.pointsCost,
        category: (d.metadata as Record<string, unknown> | undefined)?.category as string | undefined,
        createdAt: d.createdAt,
      })),
    };
  },
});

export const getRenderQuote = query({
  args: { templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;
    const version = await ctx.db
      .query("documentTemplateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .order("desc")
      .first();
    const blocks = version?.blocks as VersionBlocks | undefined;
    const cost = resolveRenderCost(
      await effectivePointsCost(ctx, RENDER_SERVICE, DEFAULT_RENDER_COST),
      blocks?.requiredCredits ?? template.requiredCredits ?? 0,
      DEFAULT_RENDER_COST,
    );
    const user = await ctx.db.get(userId);
    return { cost, balance: user?.pointsBalance ?? 0, affordable: (user?.pointsBalance ?? 0) >= cost };
  },
});

// ─── Sharing & lifecycle ──────────────────────────────────────────────────────

export const shareDocument = mutation({
  args: { documentId: v.id("renderedDocuments"), expiresInDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");
    if (doc.status !== "completed" && doc.status !== "shared") {
      throw new Error("Generate the document before sharing it");
    }
    if (doc.revokedAt) throw new Error("This share link was revoked and cannot be re-enabled");

    const slug = doc.publicSlug ?? generateShareSlug();
    const days = args.expiresInDays && args.expiresInDays > 0 ? Math.min(args.expiresInDays, 365) : undefined;
    await ctx.db.patch(args.documentId, {
      publicSlug: slug,
      isPublic: true,
      status: "shared",
      expiresAt: days ? Date.now() + days * 86_400_000 : undefined,
      updatedAt: Date.now(),
    });
    return { slug };
  },
});

export const revokeShare = mutation({
  args: { documentId: v.id("renderedDocuments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");
    await ctx.db.patch(args.documentId, {
      isPublic: false,
      revokedAt: Date.now(),
      status: doc.status === "shared" ? "completed" : doc.status,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const archiveDocument = mutation({
  args: { documentId: v.id("renderedDocuments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");
    await ctx.db.patch(args.documentId, {
      status: "archived",
      isPublic: false,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Public, unauthenticated read of a shared document. Rate-limited per slug.
 * Only the artifacts are exposed — never input data, owner or template internals.
 */
export const publicViewDocument = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    if (!isValidShareSlug(args.slug)) return { state: "not_found" as const };

    const allowed = await consumeRateLimit(
      ctx as unknown as { db: any },
      `public_doc_view:${args.slug}`,
      240,
      60_000,
    );
    if (!allowed) return { state: "rate_limited" as const };

    const doc = await ctx.db
      .query("renderedDocuments")
      .withIndex("by_publicSlug", (q) => q.eq("publicSlug", args.slug))
      .unique();
    if (!doc) return { state: "not_found" as const };

    const state = shareState({
      isPublic: doc.isPublic,
      status: doc.status,
      expiresAt: doc.expiresAt,
      revokedAt: doc.revokedAt,
    });
    if (state !== "active") return { state: state as "expired" | "revoked" | "private" };

    await ctx.db.patch(doc._id, {
      viewCount: (doc.viewCount ?? 0) + 1,
      lastViewedAt: Date.now(),
    });

    const urlFor = async (fileId?: StorageFileId) => {
      if (!fileId) return null;
      const file = await ctx.db.get(fileId);
      if (!file || file.isDeleted) return null;
      return await ctx.storage.getUrl(file.storageId);
    };

    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    return {
      state: "active" as const,
      title: doc.title ?? "Shared document",
      fileName: doc.fileName,
      pageCount: doc.pageCount,
      category: (meta.category as string) ?? "general",
      sensitive: meta.sensitivity === "sensitive",
      viewCount: (doc.viewCount ?? 0) + 1,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt ?? null,
      imageUrl: await urlFor(doc.imageFileId),
      pdfUrl: await urlFor(doc.pdfFileId),
    };
  },
});

// ─── Your own documents — owner-authored, always clean ────────────────────────

/**
 * Owner-authored documents.
 *
 * A customer can design their own document from scratch instead of picking a
 * starter: it lives in a non-sensitive category only, so nothing authored here
 * can ever carry the platform's forced SPECIMEN / NOT VALID stamp. Rows are private
 * to their creator and never appear in another customer's library.
 */

const MAX_OWN_TEMPLATES = 25;

function isOwnerAuthoredCategory(key: string): boolean {
  return !categoryDef(key).sensitive;
}

function ownerSlug(name: string): string {
  const base = slugify(name).slice(0, 48) || "document";
  return `own-${base}`;
}

/**
 * Resolve a template's artwork file to a signed URL, owner/admin only.
 *
 * Artwork comes from a customer upload, so the URL is never exposed to anyone
 * but the person who owns the file.
 */
async function artworkUrl(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"storageFiles"> | undefined,
  viewerId: Id<"users">,
): Promise<string | null> {
  if (!fileId) return null;
  const file = await ctx.db.get(fileId);
  if (!file || file.isDeleted) return null;
  if (file.ownerId !== viewerId) return null;
  return await ctx.storage.getUrl(file.storageId);
}

/** Owner-authored documents visible only to their creator. */
export const listMyTemplates = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("documentTemplates")
      .withIndex("by_creator", (q) => q.eq("createdById", userId))
      .order("desc")
      .take(MAX_OWN_TEMPLATES);
    return rows
      .filter((t) => t.visibility === "private")
      .map((t) => {
        const schema = (t.schema as TemplateSchema | undefined) ?? { fields: [] };
        const configuration = (t.configuration as TemplateConfiguration | undefined) ?? { pages: [] };
        return {
          _id: t._id,
          name: t.name,
          slug: t.slug,
          description: t.description ?? "",
          documentType: t.documentType,
          categoryLabel: categoryDef(t.documentType).label,
          requiredCredits: t.requiredCredits ?? 0,
          fieldCount: schema.fields.length,
          pageCount: configuration.pages.length,
          isActive: t.isActive,
          hasArtwork: Boolean(t.artworkFileId),
          updatedAt: t.updatedAt,
        };
      });
  },
});

/** Owner-only editor read: the live schema + layout of one of your documents. */
export const getMyTemplate = query({
  args: { templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const template = await ctx.db.get(args.templateId);
    if (!template || template.createdById !== userId || template.visibility !== "private") return null;
    return {
      _id: template._id,
      name: template.name,
      slug: template.slug,
      description: template.description ?? "",
      documentType: template.documentType,
      categoryLabel: categoryDef(template.documentType).label,
      sensitivity: "standard",
      requiredCredits: template.requiredCredits ?? 0,
      supportedFormats: template.supportedFormats ?? ["png", "pdf"],
      currentVersion: template.currentVersion,
      schema: template.schema ?? { fields: [] },
      configuration: template.configuration ?? { pages: [] },
      artworkUrl: await artworkUrl(ctx, template.artworkFileId, userId),
    };
  },
});

/** Shared validation for owner-authored saves: clean categories, valid layout. */
function assertOwnDocument(
  documentType: string,
  schema: unknown,
  configuration: unknown,
): void {
  if (!CATEGORIES.some((c) => c.key === documentType)) {
    throw new Error(`Unknown category: ${documentType}`);
  }
  if (!isOwnerAuthoredCategory(documentType)) {
    throw new Error("That category is reserved for platform templates");
  }
  const issues = validateTemplateDefinition(schema, configuration);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join("; ").slice(0, 400));
  }
}

/** Create a clean, owner-authored document template. */
export const createMyTemplate = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    documentType: v.string(),
    description: v.optional(v.string()),
    requiredCredits: v.optional(v.number()),
    supportedFormats: v.optional(v.array(v.string())),
    schema: v.any(),
    configuration: v.any(),
    artworkFileId: v.optional(v.id("storageFiles")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const name = sanitizeText(args.name.trim(), 80);
    if (!name) throw new Error("A document name is required");

    // Always clean: no owner-authored document is ever stamped.
    assertOwnDocument(args.documentType, args.schema, args.configuration);

    // Artwork may only be one of your own image uploads — never someone else's
    // file, and never a template that renders outside the platform's reach.
    if (args.artworkFileId) {
      const file = await ctx.db.get(args.artworkFileId);
      if (!file || file.isDeleted || file.ownerId !== userId || !file.mimeType.startsWith("image/")) {
        throw new Error("Artwork must be an image you uploaded yourself");
      }
    }

    const mine = await ctx.db
      .query("documentTemplates")
      .withIndex("by_creator", (q) => q.eq("createdById", userId))
      .take(MAX_OWN_TEMPLATES + 1);
    if (mine.filter((t) => t.visibility === "private").length >= MAX_OWN_TEMPLATES) {
      throw new Error(`You can keep up to ${MAX_OWN_TEMPLATES} of your own documents`);
    }

    const base = ownerSlug(args.slug?.trim() || name);
    let slug = base;
    let suffix = 1;
    while (
      await ctx.db
        .query("documentTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first()
    ) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    const requiredCredits = Math.min(Math.max(0, Math.round(args.requiredCredits ?? 0)), 1000);
    const supportedFormats = (args.supportedFormats ?? ["png", "pdf"]).filter(
      (f) => f === "png" || f === "pdf",
    );
    const formats = supportedFormats.length > 0 ? supportedFormats : ["png", "pdf"];
    const now = Date.now();

    const templateId = await ctx.db.insert("documentTemplates", {
      documentType: args.documentType,
      name,
      slug,
      description: sanitizeText(args.description?.trim() ?? "", 240),
      renderer: "svg",
      status: "active",
      visibility: "private",
      sensitivity: "standard",
      requiredCredits,
      supportedFormats: formats,
      schema: args.schema,
      configuration: args.configuration,
      artworkFileId: args.artworkFileId,
      createdById: userId,
      isActive: true,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("documentTemplateVersions", {
      templateId,
      version: 1,
      title: name,
      blocks: {
        schema: args.schema,
        configuration: args.configuration,
        sensitivity: "standard",
        requiredCredits,
        supportedFormats: formats,
      } satisfies VersionBlocks,
      pointsCost: requiredCredits,
      createdById: userId,
      createdAt: now,
    });

    await auditLog(ctx, userId, {
      action: "DOCUMENT_TEMPLATE_CREATED",
      resource: "documentTemplates",
      resourceId: templateId,
      after: { name, slug, documentType: args.documentType, requiredCredits },
      reason: "Created an own document",
    });

    return { templateId, slug };
  },
});

/** Publish a new version of one of your own documents. */
export const updateMyTemplate = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    name: v.optional(v.string()),
    documentType: v.optional(v.string()),
    description: v.optional(v.string()),
    requiredCredits: v.optional(v.number()),
    supportedFormats: v.optional(v.array(v.string())),
    schema: v.any(),
    configuration: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Not found");
    if (template.createdById !== userId || template.visibility !== "private") {
      throw new Error("Forbidden");
    }

    const documentType = args.documentType ?? template.documentType;
    assertOwnDocument(documentType, args.schema, args.configuration);

    const name = args.name ? sanitizeText(args.name.trim(), 80) || template.name : template.name;
    const requiredCredits = Math.min(
      Math.max(0, Math.round(args.requiredCredits ?? template.requiredCredits ?? 0)),
      1000,
    );
    const supportedFormats = (args.supportedFormats ?? template.supportedFormats ?? ["png", "pdf"]).filter(
      (f) => f === "png" || f === "pdf",
    );
    const formats = supportedFormats.length > 0 ? supportedFormats : ["png", "pdf"];
    const nextVersion = template.currentVersion + 1;
    const now = Date.now();

    await ctx.db.insert("documentTemplateVersions", {
      templateId: template._id,
      version: nextVersion,
      title: name,
      blocks: {
        schema: args.schema,
        configuration: args.configuration,
        sensitivity: "standard",
        requiredCredits,
        supportedFormats: formats,
      } satisfies VersionBlocks,
      pointsCost: requiredCredits,
      createdById: userId,
      createdAt: now,
    });

    await ctx.db.patch(template._id, {
      documentType,
      name,
      description: sanitizeText(args.description?.trim() ?? template.description ?? "", 240),
      sensitivity: "standard",
      requiredCredits,
      supportedFormats: formats,
      schema: args.schema,
      configuration: args.configuration,
      currentVersion: nextVersion,
      isActive: true,
      status: "active",
      updatedAt: now,
    });

    await auditLog(ctx, userId, {
      action: "DOCUMENT_TEMPLATE_VERSION_PUBLISHED",
      resource: "documentTemplates",
      resourceId: template._id,
      after: { version: nextVersion },
      reason: "Published a new version of an own document",
    });

    return { version: nextVersion };
  },
});

// ─── Admin template management ────────────────────────────────────────────────

export const adminListTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("documentTemplates").take(300);
    return rows.map((t) => ({
      _id: t._id,
      name: t.name,
      slug: t.slug,
      documentType: t.documentType,
      categoryLabel: categoryDef(t.documentType).label,
      status: t.status ?? "draft",
      sensitivity: t.sensitivity ?? "standard",
      requiredCredits: t.requiredCredits ?? 0,
      currentVersion: t.currentVersion,
      isActive: t.isActive,
      fieldCount: ((t.schema as TemplateSchema | undefined)?.fields ?? []).length,
      pageCount: ((t.configuration as TemplateConfiguration | undefined)?.pages ?? []).length,
      updatedAt: t.updatedAt,
    }));
  },
});

export const adminSetTemplateStatus = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    status: v.union(v.literal("active"), v.literal("draft"), v.literal("disabled"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Not found");
    const before = { status: template.status, isActive: template.isActive };
    await ctx.db.patch(args.templateId, {
      status: args.status,
      isActive: args.status === "active",
      archivedAt: args.status === "archived" ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    await auditLog(ctx, adminId, {
      action: "DOCUMENT_TEMPLATE_STATUS_CHANGED",
      resource: "documentTemplates",
      resourceId: args.templateId,
      before,
      after: { status: args.status },
      reason: `Template ${args.status}`,
    });
    return { success: true };
  },
});

/** Admin: re-price a template in the catalog without republishing its layout. */
export const adminSetTemplatePrice = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    requiredCredits: v.number(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Not found");
    if (!Number.isFinite(args.requiredCredits)) throw new Error("INVALID_PRICE");

    const requiredCredits = Math.min(Math.max(0, Math.round(args.requiredCredits)), 1000);
    const before = { requiredCredits: template.requiredCredits ?? 0 };
    await ctx.db.patch(args.templateId, { requiredCredits, updatedAt: Date.now() });

    await auditLog(ctx, adminId, {
      action: "DOCUMENT_TEMPLATE_PRICE_CHANGED",
      resource: "documentTemplates",
      resourceId: args.templateId,
      before,
      after: { requiredCredits },
      reason: `Priced ${template.name} at ${requiredCredits} points`,
    });

    return { requiredCredits };
  },
});

/** Admin: publish a new version of a template (schema + layout validated first). */
export const adminPublishTemplateVersion = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    schema: v.any(),
    configuration: v.any(),
    requiredCredits: v.optional(v.number()),
    sensitivity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Not found");

    const issues = validateTemplateDefinition(args.schema, args.configuration);
    if (issues.length > 0) {
      throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join("; ").slice(0, 400));
    }

    const nextVersion = template.currentVersion + 1;
    const sensitivity = template.sensitivity ?? "standard";
    await ctx.db.insert("documentTemplateVersions", {
      templateId: template._id,
      version: nextVersion,
      title: template.name,
      blocks: {
        schema: args.schema,
        configuration: args.configuration,
        sensitivity: args.sensitivity ?? sensitivity,
        requiredCredits: args.requiredCredits ?? template.requiredCredits ?? 0,
        supportedFormats: template.supportedFormats ?? ["png", "pdf"],
      } satisfies VersionBlocks,
      pointsCost: args.requiredCredits ?? template.requiredCredits ?? 0,
      createdById: adminId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(template._id, {
      schema: args.schema,
      configuration: args.configuration,
      requiredCredits: args.requiredCredits ?? template.requiredCredits,
      currentVersion: nextVersion,
      isActive: true,
      status: "active",
      updatedAt: Date.now(),
    });

    await auditLog(ctx, adminId, {
      action: "DOCUMENT_TEMPLATE_VERSION_PUBLISHED",
      resource: "documentTemplates",
      resourceId: template._id,
      after: { version: nextVersion },
      reason: "Published new template version",
    });

    return { version: nextVersion };
  },
});

/** Admin: load a template (any status) with its editable schema + layout. */
export const adminGetTemplate = query({
  args: { templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;
    return {
      _id: template._id,
      name: template.name,
      slug: template.slug,
      description: template.description ?? "",
      documentType: template.documentType,
      categoryLabel: categoryDef(template.documentType).label,
      sensitivity: template.sensitivity ?? "standard",
      requiredCredits: template.requiredCredits ?? 0,
      supportedFormats: template.supportedFormats ?? ["png", "pdf"],
      status: template.status ?? "draft",
      currentVersion: template.currentVersion,
      schema: template.schema ?? { fields: [] },
      configuration: template.configuration ?? { pages: [] },
      artworkUrl: await artworkUrl(ctx, template.artworkFileId, adminId),
    };
  },
});

/** Admin: create a brand-new template with its first published version. */
export const adminCreateTemplate = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    documentType: v.string(),
    description: v.optional(v.string()),
    sensitivity: v.optional(v.string()),
    requiredCredits: v.optional(v.number()),
    supportedFormats: v.optional(v.array(v.string())),
    schema: v.any(),
    configuration: v.any(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);

    const name = sanitizeText(args.name.trim(), 80);
    if (!name) throw new Error("A template name is required");

    const known = CATEGORIES.some((c) => c.key === args.documentType);
    if (!known) throw new Error(`Unknown category: ${args.documentType}`);

    const issues = validateTemplateDefinition(args.schema, args.configuration);
    if (issues.length > 0) {
      throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join("; ").slice(0, 400));
    }

    const slug = slugify(args.slug?.trim() || name);
    const clash = await ctx.db
      .query("documentTemplates")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (clash) throw new Error(`The slug "${slug}" is already taken`);

    // A sensitive category can never be downgraded to standard: the forced
    // The forced stamp is a platform guarantee, not a per-template preference.
    const forcedSensitive = categoryDef(args.documentType).sensitive;
    const sensitivity = forcedSensitive ? "sensitive" : (args.sensitivity ?? "standard");
    const requiredCredits = Math.max(0, Math.round(args.requiredCredits ?? 0));
    const supportedFormats = (args.supportedFormats ?? ["png", "pdf"]).filter(
      (f) => f === "png" || f === "pdf",
    );
    const now = Date.now();

    const templateId = await ctx.db.insert("documentTemplates", {
      documentType: args.documentType,
      name,
      slug,
      description: sanitizeText(args.description?.trim() ?? "", 240),
      renderer: "svg",
      status: "active",
      visibility: "public",
      sensitivity,
      requiredCredits,
      supportedFormats: supportedFormats.length > 0 ? supportedFormats : ["png", "pdf"],
      schema: args.schema,
      configuration: args.configuration,
      createdById: adminId,
      isActive: true,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("documentTemplateVersions", {
      templateId,
      version: 1,
      title: name,
      blocks: {
        schema: args.schema,
        configuration: args.configuration,
        sensitivity,
        requiredCredits,
        supportedFormats: supportedFormats.length > 0 ? supportedFormats : ["png", "pdf"],
      } satisfies VersionBlocks,
      pointsCost: requiredCredits,
      createdById: adminId,
      createdAt: now,
    });

    await auditLog(ctx, adminId, {
      action: "DOCUMENT_TEMPLATE_CREATED",
      resource: "documentTemplates",
      resourceId: templateId,
      after: { name, slug, documentType: args.documentType, requiredCredits },
      reason: "Created a document template",
    });

    return { templateId, slug };
  },
});

/** Admin: which templates are being used, and how much they earn. */
export const adminDocumentStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const docs = await ctx.db.query("renderedDocuments").order("desc").take(400);
    const byCategory = new Map<string, { count: number; credits: number }>();
    let credits = 0;
    let generated = 0;
    let shared = 0;
    for (const d of docs) {
      const category = ((d.metadata as Record<string, unknown> | undefined)?.category as string) ?? "general";
      const bucket = byCategory.get(category) ?? { count: 0, credits: 0 };
      bucket.count += 1;
      bucket.credits += d.pointsCost ?? 0;
      byCategory.set(category, bucket);
      credits += d.pointsCost ?? 0;
      if (d.status === "completed" || d.status === "shared") generated++;
      if (d.isPublic && !d.revokedAt) shared++;
    }
    return {
      total: docs.length,
      generated,
      shared,
      credits,
      byCategory: Array.from(byCategory.entries())
        .map(([key, value]) => ({ key, label: categoryDef(key).label, ...value }))
        .sort((a, b) => b.count - a.count),
      recent: docs.slice(0, 25).map((d) => ({
        _id: d._id,
        title: d.title ?? "Untitled document",
        status: d.status ?? "draft",
        pointsCost: d.pointsCost,
        category: ((d.metadata as Record<string, unknown> | undefined)?.category as string) ?? "general",
        createdAt: d.createdAt,
      })),
    };
  },
});

// ─── Admin bulk template import (JSON array) ────────────────────────────────

export const adminBulkImportTemplates = mutation({
  args: {
    templates: v.array(
      v.object({
        name: v.string(),
        slug: v.optional(v.string()),
        documentType: v.string(),
        description: v.optional(v.string()),
        sensitivity: v.optional(v.string()),
        requiredCredits: v.optional(v.number()),
        supportedFormats: v.optional(v.array(v.string())),
        schema: v.any(),
        configuration: v.any(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (args.templates.length === 0) throw new Error("No templates supplied");
    if (args.templates.length > 20) throw new Error("TOO_MANY: max 20 templates per import");
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const item of args.templates) {
      try {
        const name = sanitizeText(String(item.name ?? "").trim(), 80);
        if (!name) throw new Error("missing name");
        const known = CATEGORIES.some((c) => c.key === String(item.documentType ?? ""));
        if (!known) throw new Error(`unknown category: ${item.documentType}`);
        const issues = validateTemplateDefinition(item.schema, item.configuration);
        if (issues.length > 0) throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
        const slug = slugify((item.slug?.trim() || name).trim());
        const clash = await ctx.db.query("documentTemplates").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
        if (clash) {
          skipped++;
          errors.push(`${name}: slug "${slug}" already taken`);
          continue;
        }
        const forcedSensitive = categoryDef(String(item.documentType)).sensitive;
        const sensitivity = forcedSensitive ? "sensitive" : (item.sensitivity ?? "standard");
        const requiredCredits = Math.max(0, Math.round(item.requiredCredits ?? 0));
        const supportedFormats = (item.supportedFormats ?? ["png", "pdf"]).filter((f) => f === "png" || f === "pdf");
        const now = Date.now();
        const templateId = await ctx.db.insert("documentTemplates", {
          documentType: String(item.documentType),
          name,
          slug,
          description: sanitizeText(String(item.description ?? "").trim(), 240),
          renderer: "svg",
          status: "active",
          visibility: "public",
          sensitivity,
          requiredCredits,
          supportedFormats: supportedFormats.length > 0 ? supportedFormats : ["png", "pdf"],
          schema: item.schema,
          configuration: item.configuration,
          createdById: adminId,
          isActive: true,
          currentVersion: 1,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("documentTemplateVersions", {
          templateId,
          version: 1,
          title: name,
          blocks: {
            schema: item.schema,
            configuration: item.configuration,
            sensitivity,
            requiredCredits,
            supportedFormats: supportedFormats.length > 0 ? supportedFormats : ["png", "pdf"],
          } satisfies VersionBlocks,
          pointsCost: requiredCredits,
          createdById: adminId,
          createdAt: now,
        });
        created++;
      } catch (e) {
        skipped++;
        const msg = e instanceof Error ? e.message : String(e);
        if (errors.length < 10) errors.push(`${String(item.name ?? "?")}: ${msg}`.slice(0, 160));
      }
    }
    if (created > 0) {
      await auditLog(ctx, adminId, {
        action: "DOCUMENT_TEMPLATES_BULK_IMPORTED",
        resource: "documentTemplates",
        after: { created, skipped },
      });
    }
    return { created, skipped, errors };
  },
});

export const adminExportTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("documentTemplates").take(100);
    return rows.map((t) => ({
      name: t.name,
      slug: t.slug,
      documentType: t.documentType,
      description: t.description ?? "",
      sensitivity: t.sensitivity ?? "standard",
      requiredCredits: t.requiredCredits ?? 0,
      supportedFormats: t.supportedFormats ?? ["png", "pdf"],
      status: t.status ?? "draft",
      schema: t.schema ?? { fields: [] },
      configuration: t.configuration ?? { pages: [] },
    }));
  },
});
