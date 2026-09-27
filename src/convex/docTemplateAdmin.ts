import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, auditLog } from "./adminApi";
import {
  CATEGORIES,
  categoryDef,
  sanitizeText,
  validateTemplateDefinition,
  type TemplateConfiguration,
  type TemplateSchema,
} from "../lib/docTemplateEngine";
import { artworkUrl, slugify, type VersionBlocks } from "./docTemplates";

/**
 * Admin-only document template management.
 *
 * Split out of `docTemplates.ts` purely for file size — these functions are
 * catalog administration, not the customer-facing document pipeline, and the
 * customer pipeline already owns the helpers above.
 */

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
    // All documents are clean — version sensitivity is always "standard".
    const sensitivity = "standard" as string;
    await ctx.db.insert("documentTemplateVersions", {
      templateId: template._id,
      version: nextVersion,
      title: template.name,
      blocks: {
        schema: args.schema,
        configuration: args.configuration,
        sensitivity,
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

    // All documents are clean — sensitivity is always "standard".
    const sensitivity = "standard" as string;
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
        // Price of the most recent render, not the lifetime total — the
        // catalog list quotes what one document costs, not what its
        // re-renders have added up to over time.
        renderPrice: d.renderPrice ?? null,
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
        const sensitivity = "standard" as string;
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
