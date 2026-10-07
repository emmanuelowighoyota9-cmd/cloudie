import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { auditLog } from "./adminApi";
import { effectiveNgnCost, effectivePointsCost, readPointRate } from "./pricing";
import { debitWallet } from "./wallet";
import type { Id } from "./_generated/dataModel";

type StorageFileId = Id<"storageFiles">;
import {
  CATEGORIES,
  categoryDef,
  defaultValues,
  generateShareSlug,
  isValidShareSlug,
  documentCreationKey,
  shouldChargeForRender,
  renderIdempotencyKey,
  resolveDocumentCost,
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
import { PLATFORM_SEED_VERSION, PLATFORM_TEMPLATES } from "../lib/platformTemplates";
import { VTU_RECEIPT_LIBRARY_TAG } from "../lib/vtu";

/**
 * Cloudie document workspace.
 *
 * Templates are versioned: every generated document points at a frozen
 * `documentTemplateVersions.blocks` snapshot, so editing a live template never
 * changes a document that was already produced.
 *
 * Rendering happens on the client (SVG → PNG via canvas → PDF via the
 * dependency-free raster PDF writer), then the artifacts are uploaded and
 * `finalizeDocument` completes the record — server-side, schema-validated and
 * idempotent per render attempt.
 *
 * NGN wallet funds are charged at the full render cost by `createDocument`, so a
 * document is a paid object from the moment it exists: unlimited free drafts
 * are no longer possible, and the price a customer is quoted is the price they
 * keep even if pricing changes before the render finishes. That charge pays for
 * the document's FIRST render only — `finalizeDocument` bills every subsequent
 * re-render as new work. Drafts created before this rule existed carry no
 * creation charge and are still billed at render, so no historical document is
 * left unpaid.
 */

const RENDER_SERVICE = "document_render";
const DEFAULT_RENDER_COST = 40;
const DESIGN_SERVICE = "custom_document_design";
const DEFAULT_DESIGN_COST = 25;

async function resolveDocumentNgnCost(ctx: QueryCtx | MutationCtx, billable: boolean | undefined, service: string, requiredCredits: number, fallbackPoints: number): Promise<number> {
  const pointCost = resolveDocumentCost(billable, await effectivePointsCost(ctx, service, fallbackPoints), requiredCredits, fallbackPoints);
  if (pointCost <= 0) return 0;
  const rate = await readPointRate(ctx);
  return Math.round((await effectiveNgnCost(ctx, service, pointCost * rate.ngnPerPoint)) * 100) / 100;
}
const MAX_LIST = 100;
const MAX_DOCUMENTS = 60;
const MAX_IMAGE_B64 = 4_500_000;

export type VersionBlocks = {
  schema: TemplateSchema;
  configuration: TemplateConfiguration;
  sensitivity: string;
  requiredCredits: number;
  supportedFormats: string[];
  /**
   * Frozen with the version, like every other rail field here. Absent means
   * billable — see `resolveDocumentCost`, the only reader.
   */
  billable?: boolean;
  /**
   * Value written to a created document's `metadata.category` when it has to
   * differ from the template's `documentType`. Frozen with the version so a
   * document created today is filed the way the version that made it said, not
   * the way a later edit says.
   */
  libraryTag?: string;
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

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "document";
}

/** Charge the owner for one customer-authored design save, atomically with it. */
async function chargeDocumentDesign(
  ctx: MutationCtx,
  userId: Id<"users">,
  templateId: Id<"documentTemplates">,
  templateName: string,
): Promise<number> {
  const cost = await effectiveNgnCost(ctx, DESIGN_SERVICE, (await effectivePointsCost(ctx, DESIGN_SERVICE, DEFAULT_DESIGN_COST)) * (await readPointRate(ctx)).ngnPerPoint);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  const balance = user.walletBalanceNgn ?? ((user.pointsBalance ?? 0) * (await readPointRate(ctx)).ngnPerPoint);
  if (balance < cost) {
    throw new Error(`Insufficient NGN wallet balance. Designing a document costs ₦${cost.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
  }

  await debitWallet(ctx, {
    userId,
    amountNgn: cost,
    description: `Custom document design: ${templateName}`,
    type: "service_charge",
    reference: DESIGN_SERVICE,
    referenceId: templateId,
    idempotencyKey: `document-design:${templateId}`,
    metadata: { service: DESIGN_SERVICE, action: "design" },
  });
  return cost;
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
      // @deprecated All documents are clean — kept for backwards compatibility.
      sensitive: false as boolean,
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
        // All documents are clean — thumbnails never carry a watermark.
        const isSensitive = false as boolean;
        // Thumbnails are built from the template's own defaults, so the library
        // shows an authentic preview without shipping full layouts to the client.
        let previewSvg = "";
        try {
          previewSvg = buildPreviewSvg(configuration, schema, defaultValues(schema), {});
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
      requiredCredits: resolveDocumentCost(
        blocks?.billable ?? template.billable,
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
 * Key used by installs created before the Cloudie rebrand. It is only ever read
 * to migrate that row onto SEED_VERSION_KEY, so no legacy identifier is written
 * or displayed again.
 */
const LEGACY_SEED_VERSION_KEY = "softbaker_seed_version";

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
    // Legacy deployments stored the marker under the product's previous key.
    // Treat that value as the current version so existing data is not reseeded
    // twice, and rename the row to the Cloudie key immediately so the old
    // identifier never lingers in the database.
    const legacyMarker = marker
      ? null
      : await ctx.db
          .query("adminSettings")
          .withIndex("by_key", (q) => q.eq("key", LEGACY_SEED_VERSION_KEY))
          .first();
    if (!marker && legacyMarker) {
      await ctx.db.patch(legacyMarker._id, {
        key: SEED_VERSION_KEY,
        updatedAt: Date.now(),
      });
    }
    const effectiveMarker = marker ?? legacyMarker;
    const seededVersion =
      typeof effectiveMarker?.value === "number" ? (effectiveMarker.value as number) : 0;
    if (seededVersion >= PLATFORM_SEED_VERSION) return { created: 0, updated: 0 };

    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const starter of PLATFORM_TEMPLATES) {
      const issues = validateTemplateDefinition(starter.schema, starter.configuration);
      if (issues.length > 0) continue; // never ship an invalid template

      const blocks: VersionBlocks = {
        schema: starter.schema,
        configuration: starter.configuration,
        sensitivity: starter.sensitivity,
        requiredCredits: starter.requiredCredits,
        supportedFormats: starter.supportedFormats,
        billable: starter.billable,
        libraryTag: starter.libraryTag,
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
          billable: starter.billable,
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
        billable: starter.billable,
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
        value: PLATFORM_SEED_VERSION,
        updatedBy: userId,
        updatedAt: now,
      });
    } else if (legacyMarker) {
      await ctx.db.patch(legacyMarker._id, {
        key: SEED_VERSION_KEY,
        value: PLATFORM_SEED_VERSION,
        updatedBy: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: SEED_VERSION_KEY,
        value: PLATFORM_SEED_VERSION,
        category: "documents",
        updatedBy: userId,
        updatedAt: now,
      });
    }

    return { created, updated };
  },
});

// ─── Drafts & generation ──────────────────────────────────────────────────────

/**
 * Create a document record and take its creation charge.
 *
 * Shared by the two ways a document comes into existence: the customer-authored
 * `createDocument` below, and the server-authored receipt in `vtuReceipt.ts`.
 * They must charge, file and record identically — a second copy of this body
 * would be a second place for the money logic to drift, which is the exact
 * problem `resolveDocumentCost` was written to make unavailable.
 *
 * What the CALLER decides, rather than this function, is the three things that
 * genuinely differ between the two paths: whether the values came from a human
 * (re-derivable, and defaulted from their profile) or from the server (already
 * final), whether creating documents by hand at speed is worth throttling, and
 * whether an unrenderable draft should be refused outright.
 *
 * Exported so `vtuReceipt.ts` can call it. It is a plain function, not a
 * registered Convex function, so it is not in the API surface.
 */
export async function insertDocumentRecord(
  ctx: MutationCtx,
  input: {
    userId: Id<"users">;
    templateId: Id<"documentTemplates">;
    /** Blank falls back to the template's own name. */
    title: string;
    values: DocumentValues;
    /** Fill a blank `organization` field from the user's profile setting. */
    applyOrganizationDefault: boolean;
    /**
     * Throttle this creation.
     *
     * Off for server-authored documents, which are idempotent per subject and
     * therefore bounded by the caller's own data rather than by how fast they
     * can click. A customer with thirty transactions to receipts is doing
     * exactly what the product asked and should not meet a rate limiter.
     */
    rateLimited: boolean;
    /**
     * Refuse to create a row whose values could never pass validation.
     *
     * Only worth having on for server-authored documents. A human can fix an
     * incomplete draft; a receipt whose values are wrong can never render, and
     * would error on every future click while sitting in the table looking
     * like a document. Failing at creation at least fails once, and says why.
     */
    requireRenderable: boolean;
  },
): Promise<{
  documentId: Id<"renderedDocuments">;
  values: DocumentValues;
  charged: number;
  title: string;
  /** The FROZEN schema and layout the new row points at, so a server-authored
   *  caller can hand them straight to the renderer without a second read. */
  schema: TemplateSchema;
  configuration: TemplateConfiguration;
}> {
  const template = await ctx.db.get(input.templateId);
  if (!template || !template.isActive) throw new Error("Template unavailable");
  const version = await ctx.db
    .query("documentTemplateVersions")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .order("desc")
    .first();
  if (!version) throw new Error("Template has no published version");

  // ── NGN wallet funds are taken HERE, once, for the full render cost ──
  // Creating a document is a chargeable act. A draft is therefore a paid object
  // from the moment it exists, and the price quoted at this instant is the price
  // the customer keeps for the whole render.
  if (input.rateLimited && !(await consumeRateLimit(ctx, `createDocument:${input.userId}`, 30, 60_000))) {
    throw new Error("Too many documents created. Try again in a minute.");
  }

  const blocks = version.blocks as VersionBlocks;
  const cost = await resolveDocumentNgnCost(
    ctx,
    blocks?.billable ?? template.billable,
    RENDER_SERVICE,
    blocks?.requiredCredits ?? template.requiredCredits ?? 0,
    DEFAULT_RENDER_COST,
  );

  // Checked before the insert so an unaffordable request never leaves an orphan
  // draft behind. Convex mutations are transactional, so the debit below cannot
  // outlive the row it belongs to.
  const payer = await ctx.db.get(input.userId);
  if (!payer) throw new Error("User not found");
  const balance = payer.walletBalanceNgn ?? ((payer.pointsBalance ?? 0) * (await readPointRate(ctx)).ngnPerPoint);
  if (balance < cost) {
    throw new Error(
      `Insufficient NGN wallet balance. Creating a document costs ₦${cost.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} and your balance is ₦${balance.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }

  const schema = blocks?.schema ?? { fields: [] };
  const values = sanitizeValues(schema, input.values);
  // A customer's own documents are issued under their organization name: the
  // letterhead field starts from their profile setting when left blank. A
  // server-authored document has no such field to fill, and filling it would
  // invent an issuer for a document the PLATFORM issued.
  if (
    input.applyOrganizationDefault &&
    schema.fields.some((f) => f.id === "organization") &&
    !String(values.organization ?? "").trim()
  ) {
    const org = payer.organizationName?.trim();
    if (org) values.organization = sanitizeText(org, 60);
  }

  if (input.requireRenderable) {
    const check = validateValues(schema, values);
    if (!check.ok) {
      throw new Error(
        `This document cannot be produced: ${check.issues.map((i) => i.message).join("; ")}`.slice(0, 300),
      );
    }
  }

  const title = sanitizeText(input.title.trim() || template.name, 120);
  const now = Date.now();

  const documentId = await ctx.db.insert("renderedDocuments", {
    templateVersionId: version._id,
    templateId: template._id,
    templateVersion: version.version,
    ownerId: input.userId,
    title,
    status: "draft",
    inputData: values,
    fileName: `${slugify(title)}.pdf`,
    pageCount: 0,
    sizeBytes: 0,
    viewCount: 0,
    isPublic: false,
    pointsCost: cost,
    // What one render of this document costs. Kept separate from pointsCost,
    // which accumulates across re-renders and is only an accounting total.
    renderPrice: cost,
    metadata: {
      // The version's library tag wins over the template's category when it
      // declares one, which is how a receipt files under `vtu_receipt` and
      // stays out of the library while its template sits on the `financial`
      // shelf.
      category: blocks?.libraryTag ?? template.documentType,
      // The shelf the TEMPLATE is on, kept beside the tag so an admin view can
      // still say "this is a financial document" about a document whose
      // category is a library-filter tag. Write-once, like the rest of the
      // metadata: which shelf a template sits on can be edited, which shelf the
      // document was created from cannot.
      templateCategory: template.documentType,
      sensitivity: template.sensitivity ?? "standard",
      // Marker read back by `finalizeDocument` so the render never charges for a
      // document that was already paid for at creation.
      pointsChargedAtCreation: cost,
    },
    createdAt: now,
    updatedAt: now,
  });

  // ── Debit (exactly once per document) ──
  //
  // Skipped entirely at zero rather than written as a zero-amount row. The
  // ledger is the money log; a 0-point entry in it is noise that every later
  // reader has to filter, and it would also make a free document look like a
  // paid one to anything counting rows rather than amounts.
  if (cost > 0) {
    const idempotencyKey = documentCreationKey(documentId);
    await debitWallet(ctx, {
      userId: input.userId,
      amountNgn: cost,
      description: `${title} — document created`,
      type: "document_generation",
      reference: "document",
      referenceId: documentId,
      idempotencyKey,
      metadata: { stage: "creation", costNgn: cost },
    });
  }

  return {
    documentId,
    values,
    charged: cost,
    title,
    schema,
    configuration: blocks?.configuration ?? { pages: [] },
  };
}

/**
 * Customer-authored creation: values come from a form, and creating documents
 * by hand is throttled.
 */
export const createDocument = mutation({
  args: {
    templateId: v.id("documentTemplates"),
    title: v.optional(v.string()),
    values: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const created = await insertDocumentRecord(ctx, {
      userId,
      templateId: args.templateId,
      title: args.title?.trim() ?? "",
      values: (args.values ?? {}) as DocumentValues,
      applyOrganizationDefault: true,
      rateLimited: true,
      // A customer can complete an incomplete draft, so this path keeps its
      // long-standing behaviour of allowing one.
      requireRenderable: false,
    });

    return { documentId: created.documentId, values: created.values, charged: created.charged };
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
 * Validates the input values against the frozen template schema, takes the
 * render charge for re-renders and for documents that predate creation-time
 * billing (idempotent per attempt via the ledger index, so a retried attempt is
 * never charged twice), registers the uploaded PNG/PDF artifacts, and records
 * audit + notification.
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

    const cost = await resolveDocumentNgnCost(
      ctx,
      // No fallback to `template.billable` here: this mutation deliberately does
      // not load the template row, and the flag is frozen into the version this
      // document was created from — which is the one that must be honoured.
      blocks?.billable,
      RENDER_SERVICE,
      blocks?.requiredCredits ?? 0,
      DEFAULT_RENDER_COST,
    );

    // ── Charge (idempotent) ──
    // The creation charge pays for the document's FIRST render. Anything the
    // customer renders after that — a re-render of an edited document — is new
    // work and is billed again. Retries of the same attemptId are held free by
    // the ledger key below, so a flaky network never costs twice.
    //
    // `cost > 0` is the non-billable exemption, applied HERE as well as at
    // creation. It has to be: `pointsChargedAtCreation: 0` is a number, so
    // `shouldChargeForRender` reads a free document as "already paid for once"
    // and would bill every subsequent re-render. The exemption is a property of
    // the TEMPLATE, not of the first render, and this is the second of the three
    // places that has to know it.
    const billThisAttempt = shouldChargeForRender(meta) && cost > 0;

    let charged = 0;
    if (billThisAttempt) {
      const idempotencyKey = renderIdempotencyKey(args.documentId, "pdf", attemptId);
      await debitWallet(ctx, {
        userId,
        amountNgn: cost,
        description: `${doc.title ?? "Document"} render`,
        type: "document_generation",
        reference: "document",
        referenceId: args.documentId,
        idempotencyKey,
        metadata: { attemptId, pageCount: args.pageCount, costNgn: cost },
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

    // The price shown for this document: the creation price when the creation
    // charge paid for this render, otherwise the price just charged.
    const creationPrice =
      typeof meta.pointsChargedAtCreation === "number" && Number.isFinite(meta.pointsChargedAtCreation)
        ? meta.pointsChargedAtCreation
        : cost;
    const renderPrice = charged > 0 ? cost : creationPrice;

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
      renderPrice,
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
    // Receipts live in this table but not in this library, and they are filtered
    // AFTER the read (there is no index on a metadata field, and adding one for
    // a tag would be the tail wagging the dog). That means reading `limit` rows
    // and then dropping some could let a run of receipts empty the page — so
    // read a bounded multiple and cut back to `limit` at the end. Bounded, not
    // unbounded: at most three times the page, never the whole table.
    const scan = Math.min(limit * 3, MAX_DOCUMENTS * 3);
    const rows = await ctx.db
      .query("renderedDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(scan);
    const meta = (d: (typeof rows)[number]) =>
      (d.metadata ?? {}) as Record<string, unknown>;
    return rows
      .filter((d) => meta(d).category !== VTU_RECEIPT_LIBRARY_TAG)
      .filter((d) => (args.status ? d.status === args.status : true))
      .slice(0, limit)
      .map((d) => ({
        _id: d._id,
        title: d.title ?? "Untitled document",
        status: d.status ?? "draft",
        fileName: d.fileName,
        pageCount: d.pageCount,
        sizeBytes: d.sizeBytes,
        pointsCost: d.pointsCost,
        renderPrice: d.renderPrice ?? null,
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
      renderPrice: doc.renderPrice ?? null,
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
    let libraryDocuments = 0;
    let generated = 0;
    let shared = 0;
    let drafts = 0;
    let credits = 0;
    let storageBytes = 0;
    for (const d of docs) {
      // Storage is counted for EVERY row, receipts included: it is a physical
      // fact about the account, and under-reporting it would be a lie about
      // disk. The four counts below are about the customer's own library, and
      // they exclude receipts for the same reason the library list does —
      // otherwise the Documents page prints "5 documents" above "No documents
      // yet", which is the numbers contradicting the list directly beneath
      // them.
      storageBytes += d.sizeBytes ?? 0;

      if ((d.metadata as Record<string, unknown> | undefined)?.category === VTU_RECEIPT_LIBRARY_TAG) {
        continue;
      }
      libraryDocuments++;
      const status = d.status ?? "draft";
      if (status === "completed" || status === "shared") generated++;
      if (d.isPublic && !d.revokedAt) shared++;
      if (status === "draft") drafts++;
      credits += d.pointsCost ?? 0;
    }
    const templateCount = (
      await ctx.db
        .query("documentTemplates")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(500)
    ).length;

    return {
      documents: libraryDocuments,
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
        renderPrice: d.renderPrice ?? null,
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
    const cost = await resolveDocumentNgnCost(
      ctx,
      blocks?.billable ?? template.billable,
      RENDER_SERVICE,
      blocks?.requiredCredits ?? template.requiredCredits ?? 0,
      DEFAULT_RENDER_COST,
    );
    const user = await ctx.db.get(userId);
    const rate = await readPointRate(ctx);
    const balance = user?.walletBalanceNgn ?? ((user?.pointsBalance ?? 0) * rate.ngnPerPoint);
    return { cost, balance, currency: "NGN", affordable: balance >= cost };
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
      // @deprecated All shares are clean — kept for backwards compatibility.
      sensitive: false as boolean,
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
 * starter: it lives in a clean category only. Rows are private
 * to their creator and never appear in another customer's library.
 */

const MAX_OWN_TEMPLATES = 25;

function isOwnerAuthoredCategory(_key: string): boolean {
  // All categories are clean — every category is owner-authorable.
  return true;
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
export async function artworkUrl(
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

    const charged = await chargeDocumentDesign(ctx, userId, templateId, name);

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

    return { templateId, slug, charged };
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

    const charged = await chargeDocumentDesign(ctx, userId, template._id, name);

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

    return { version: nextVersion, charged };
  },
});

