import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, auditLog } from "./adminApi";
import { sanitizeText, validateTemplateDefinition, categoryDef, CATEGORIES } from "../lib/docTemplateEngine";
import type { FieldDef, TemplateConfiguration } from "../lib/docTemplateEngine";
import {
  CLOUDIE_CATEGORIES,
  classifyAndExtract,
  type CloudieCategory,
  type ClassifierInput,
  type CloudieTemplateJson,
} from "../lib/cloudieClassifier";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

function mapCloudieToInternal(category: string, subcategory: string): { documentType: string; sensitivity: string } {
  const c = category as CloudieCategory;
  if (c === "Identity & Personal Documents") return { documentType: "certificates", sensitivity: "standard" };
  if (c === "Financial & Payment Artifacts") return { documentType: "financial", sensitivity: "standard" };
  if (c === "Logistics & Travel") {
    const lower = (subcategory + " " + category).toLowerCase();
    if (lower.includes("flight") || lower.includes("itinerary") || lower.includes("boarding")) {
      return { documentType: "flight_itinerary", sensitivity: "standard" };
    }
    return { documentType: "tracking", sensitivity: "standard" };
  }
  const genLower = subcategory.toLowerCase();
  if (genLower.includes("certificate") || genLower.includes("death") || genLower.includes("nursing") || genLower.includes("contract award")) {
    return { documentType: "certificates", sensitivity: "standard" };
  }
  if (genLower.includes("letter") || genLower.includes("invoice") || genLower.includes("corporate")) {
    return { documentType: "corporate", sensitivity: "standard" };
  }
  return { documentType: "general", sensitivity: "standard" };
}

function toFieldType(dataType: string): FieldDef["type"] {
  switch (dataType) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "image_url":
      return "image";
    default:
      return "text";
  }
}

function buildConfigFromFields(fields: CloudieTemplateJson["required_fields"], title: string): TemplateConfiguration {
  const PAGE_W = 794;
  const PAGE_H = 1123;
  // chunk fields into pages (18 per page keeps layout within bounds)
  const perPage = 18;
  const pages: TemplateConfiguration["pages"] = [];
  const chunks: typeof fields[] = [];
  for (let i = 0; i < fields.length; i += perPage) chunks.push(fields.slice(i, i + perPage));
  if (chunks.length === 0) chunks.push([]);

  chunks.forEach((chunk, pageIndex) => {
    const elements: TemplateConfiguration["pages"][number]["elements"] = [];

    // Header band
    elements.push({ kind: "rect", x: 0, y: 0, w: PAGE_W, h: 112, fill: "#0f172a", rx: 0 } as never);
    elements.push({
      kind: "text",
      x: 56,
      y: 54,
      text: pageIndex === 0 ? "CLOUDIE TEMPLATE" : `CLOUDIE TEMPLATE — page ${pageIndex + 1}`,
      size: 10,
      weight: 700,
      color: "#7dd3fc",
      letterSpacing: 3,
    } as never);
    elements.push({ kind: "text", x: 56, y: 88, text: title.slice(0, 48), size: 20, weight: 800, color: "#ffffff" } as never);

    // Field rows
    const startY = 156;
    const rowH = 36;
    chunk.forEach((f, idx) => {
      const y = startY + idx * rowH;
      // faint rule
      elements.push({ kind: "line", x1: 56, y1: y + 28, x2: PAGE_W - 56, y2: y + 28, stroke: "#e2e8f0", strokeWidth: 1 } as never);
      // label
      elements.push({
        kind: "text",
        x: 56,
        y: y,
        text: f.label.toUpperCase(),
        size: 8.5,
        weight: 700,
        color: "#94a3b8",
        letterSpacing: 1.2,
        uppercase: true,
      } as never);
      // bound value: string/number/date -> text, image -> image
      if (f.data_type === "image_url") {
        elements.push({ kind: "image", x: PAGE_W - 56 - 92, y: y - 6, w: 92, h: 24, bind: f.field_key, rx: 6 } as never);
        elements.push({ kind: "text", x: 56, y: y + 18, bind: f.field_key, size: 12, color: "#0f172a" } as never);
      } else {
        elements.push({ kind: "text", x: 56, y: y + 18, bind: f.field_key, size: 12.5, color: "#0f172a" } as never);
      }
      // data type hint at right
      elements.push({
        kind: "text",
        x: PAGE_W - 56,
        y: y + 18,
        text: f.data_type,
        size: 9,
        color: "#64748b",
        align: "right",
        w: 80,
      } as never);
    });

    // Footer
    const footerY = PAGE_H - 56;
    elements.push({ kind: "line", x1: 56, y1: footerY - 14, x2: PAGE_W - 56, y2: footerY - 14, stroke: "#e2e8f0", strokeWidth: 1 } as never);
    elements.push({
      kind: "text",
      x: PAGE_W / 2,
      y: footerY + 6,
      text: "Generated by Cloudie Classifier · Review layout in the template editor",
      size: 9,
      color: "#94a3b8",
      align: "center",
      w: PAGE_W - 112,
    } as never);

    pages.push({ width: PAGE_W, height: PAGE_H, background: "#ffffff", elements: elements as never });
  });

  return { pages, renderScale: 2 };
}

// ─── Deterministic preview (no AI, fast) ────────────────────────────────────

export const classifyDeterministic = query({
  args: {
    templateTitle: v.optional(v.string()),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    documentType: v.optional(v.string()),
    rawText: v.optional(v.string()),
    placeholders: v.optional(v.array(v.string())),
    fields: v.optional(v.array(v.object({ id: v.optional(v.string()), label: v.optional(v.string()), type: v.optional(v.string()) }))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const input: ClassifierInput = {
      template_title: args.templateTitle,
      name: args.name,
      title: args.title,
      description: args.description,
      slug: args.slug,
      documentType: args.documentType,
      rawText: args.rawText,
      placeholders: args.placeholders,
      fields: args.fields?.map((f) => ({ id: f.id, label: f.label, type: f.type })),
    };
    return classifyAndExtract(input);
  },
});

// ─── Ingest classified JSON into documentTemplates ───────────────────────────

export const ingestClassifiedTemplate = mutation({
  args: {
    result: v.object({
      template_title: v.string(),
      category: v.string(),
      subcategory: v.string(),
      description: v.string(),
      required_fields: v.array(
        v.object({
          field_key: v.string(),
          label: v.string(),
          data_type: v.string(),
          required: v.boolean(),
        }),
      ),
      is_active: v.boolean(),
    }),
    slug: v.optional(v.string()),
    requiredCredits: v.optional(v.number()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);

    const r = args.result;

    if (!CLOUDIE_CATEGORIES.includes(r.category as CloudieCategory)) {
      throw new Error(`Category must be one of: ${CLOUDIE_CATEGORIES.join(", ")}`);
    }
    if (!r.template_title.trim()) throw new Error("template_title is required");
    if (!r.subcategory.trim()) throw new Error("subcategory is required");
    if (!r.description.trim()) throw new Error("description is required");
    if (!r.required_fields.length) throw new Error("required_fields must not be empty");
    if (r.required_fields.length > 40) throw new Error("Too many required_fields (max 40)");

    // Validate each field_key is camelCase and data_type is allowed
    const seen = new Set<string>();
    for (const f of r.required_fields) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(f.field_key)) throw new Error(`Invalid field_key: ${f.field_key}`);
      if (seen.has(f.field_key)) throw new Error(`Duplicate field_key: ${f.field_key}`);
      seen.add(f.field_key);
      if (!["string", "number", "date", "image_url"].includes(f.data_type)) {
        throw new Error(`Invalid data_type for ${f.field_key}: ${f.data_type}`);
      }
      if (f.required !== true) throw new Error(`required must be true for ${f.field_key}`);
      if (!f.label.trim()) throw new Error(`Label required for ${f.field_key}`);
    }

    const title = sanitizeText(r.template_title.trim(), 80);
    const baseSlug = slugify(args.slug?.trim() || title);
    let slug = baseSlug;
    let suffix = 1;
    while (await ctx.db.query("documentTemplates").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
      if (suffix > 50) throw new Error("Could not generate a unique slug");
    }

    const mapped = mapCloudieToInternal(r.category, r.subcategory);
    const documentType = mapped.documentType;
    const sensitivity = mapped.sensitivity;

    // Double-check the mapped category is known (fallback guard)
    if (!CATEGORIES.some((c) => c.key === documentType)) {
      throw new Error(`Internal mapping failed for category ${r.category}`);
    }

    // Build schema + configuration from required_fields
    const schemaFields: FieldDef[] = r.required_fields.map((f) => ({
      id: f.field_key,
      type: toFieldType(f.data_type),
      label: sanitizeText(f.label.trim(), 60) || f.field_key,
      required: true,
      maxLength: f.data_type === "string" ? 240 : f.data_type === "image_url" ? undefined : 40,
    }));

    const schema = { fields: schemaFields };
    const configuration = buildConfigFromFields(r.required_fields as CloudieTemplateJson["required_fields"], title);

    const issues = validateTemplateDefinition(schema, configuration);
    if (issues.length > 0) {
      throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join("; ").slice(0, 600));
    }

    const requiredCredits = Math.min(Math.max(0, Math.round(args.requiredCredits ?? 25)), 1000);
    const visibility = args.visibility && ["public", "unlisted", "private"].includes(args.visibility) ? args.visibility : "public";

    const now = Date.now();

    const templateId = await ctx.db.insert("documentTemplates", {
      documentType,
      name: title,
      slug,
      description: sanitizeText(r.description.trim(), 300),
      renderer: "svg",
      status: r.is_active ? "active" : "draft",
      visibility,
      sensitivity,
      requiredCredits,
      supportedFormats: ["png", "pdf"],
      schema,
      configuration,
      createdById: adminId,
      isActive: r.is_active,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("documentTemplateVersions", {
      templateId,
      version: 1,
      title,
      blocks: {
        schema,
        configuration,
        sensitivity,
        requiredCredits,
        supportedFormats: ["png", "pdf"],
      },
      pointsCost: requiredCredits,
      createdById: adminId,
      createdAt: now,
    });

    // Store classifier provenance for audit / filtering
    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      actorEmail: (await ctx.db.get(adminId))?.email,
      action: "TEMPLATE_CLASSIFIED_AND_INGESTED",
      resource: "documentTemplates",
      resourceId: templateId,
      after: {
        template_title: title,
        slug,
        category: r.category,
        subcategory: r.subcategory,
        documentType,
        sensitivity,
        fieldCount: r.required_fields.length,
      },
      reason: `Classified as ${r.category} · ${r.subcategory}`,
      createdAt: now,
    });

    await auditLog(ctx, adminId, {
      action: "DOCUMENT_TEMPLATE_CREATED",
      resource: "documentTemplates",
      resourceId: templateId,
      after: { name: title, slug, documentType, category: r.category, subcategory: r.subcategory },
      reason: "Ingested via AI Template Classification",
    });

    return { templateId, slug, documentType, sensitivity };
  },
});

// ─── Helper: list recently classified/ingested templates (admin) ─────────────

export const listClassifiedTemplates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    // Most recent templates first; we surface those created via classifier (audit log) but also any recent template for convenience
    const rows = await ctx.db.query("documentTemplates").order("desc").take(limit);
    return rows.map((t) => ({
      _id: t._id,
      name: t.name,
      slug: t.slug,
      documentType: t.documentType,
      categoryLabel: categoryDef(t.documentType).label,
      sensitivity: t.sensitivity ?? "standard",
      status: t.status ?? "draft",
      fieldCount: ((t.schema as { fields?: unknown[] } | undefined)?.fields ?? []).length,
      updatedAt: t.updatedAt,
    }));
  },
});
