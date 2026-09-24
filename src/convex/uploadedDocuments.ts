import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

/**
 * Documents a customer already owns.
 *
 * "Add your own document" also means bringing files you already have: a signed
 * contract, a scanned invoice, a photographed receipt. Bytes go through the
 * shared storage policy (MIME + size limits, ownership, audit); this module is
 * the workspace record the library lists. Uploaded files are always clean —
 * nothing here is ever stamped with a demo watermark.
 */

const MAX_UPLOADS = 200;
const MAX_LIST = 60;

function sanitizeText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function titleFromFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "Document";
  const withoutExtension = base.replace(/\.[a-z0-9]{1,6}$/i, "");
  const pretty = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (pretty || "Document").slice(0, 120);
}

function mimeToKind(mime: string): "pdf" | "image" | null {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "image/gif") {
    return "image";
  }
  return null;
}

/** Owner's uploaded documents, newest first, with preview URLs. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 24, 1), MAX_LIST);
    const rows = await ctx.db
      .query("uploadedDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(limit);
    const active = rows.filter((row) => !row.isArchived);
    // Resolve storage rows in parallel — never a sequential await in a loop.
    const files = await Promise.all(active.map((row) => ctx.db.get(row.fileId)));
    const urls = await Promise.all(
      files.map((file) => (file && !file.isDeleted ? ctx.storage.getUrl(file.storageId) : Promise.resolve(null))),
    );
    return active.map((row, index) => ({
      _id: row._id,
      fileId: row.fileId,
      title: row.title,
      fileName: row.fileName,
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      notes: row.notes ?? "",
      url: urls[index],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
    }));
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const rows = await ctx.db
      .query("uploadedDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(MAX_UPLOADS);
    return rows.filter((row) => !row.isArchived).length;
  },
});

/** Register an already-uploaded file as a workspace document. */
export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new Error("Upload not found — send the bytes before registering the file");

    const mime = meta.contentType ?? "";
    const kind = mimeToKind(mime);
    if (!kind) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Only PDF, PNG, JPEG, WebP and GIF documents can be uploaded");
    }

    const existing = await ctx.db
      .query("uploadedDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(MAX_UPLOADS + 1);
    if (existing.length >= MAX_UPLOADS) {
      await ctx.storage.delete(args.storageId);
      throw new Error(`You can keep up to ${MAX_UPLOADS} uploaded documents`);
    }

    // Shared storage policy: MIME allow-list, size limit, ownership and audit.
    const fileId: Id<"storageFiles"> = await ctx.runMutation(api.storage.registerFile, {
      storageId: args.storageId,
      kind: kind === "pdf" ? "pdf_document" : "image",
      originalName: args.fileName,
    });
    const file = await ctx.db.get(fileId);
    if (!file) throw new Error("Could not register the uploaded file");

    const fileName = file.originalName;
    const now = Date.now();
    const documentId = await ctx.db.insert("uploadedDocuments", {
      ownerId: userId,
      fileId,
      title: sanitizeText(args.title?.trim() || titleFromFileName(fileName), 120) || "Document",
      fileName,
      kind,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      notes: args.notes?.trim() ? sanitizeText(args.notes, 400) : undefined,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    return { documentId, fileId, title: sanitizeText(args.title?.trim() || titleFromFileName(fileName), 120) };
  },
});

export const rename = mutation({
  args: { documentId: v.id("uploadedDocuments"), title: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");

    const title = sanitizeText(args.title, 120);
    if (!title) throw new Error("Give the document a name");
    await ctx.db.patch(args.documentId, {
      title,
      notes: args.notes !== undefined ? (args.notes.trim() ? sanitizeText(args.notes, 400) : undefined) : doc.notes,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/** Remove an uploaded document: catalog row + bytes. */
export const remove = mutation({
  args: { documentId: v.id("uploadedDocuments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Not found");
    if (doc.ownerId !== userId) throw new Error("Forbidden");

    const file = await ctx.db.get(doc.fileId);
    if (file && !file.isDeleted) {
      await ctx.db.patch(file._id, { isDeleted: true, deletedAt: Date.now() });
      await ctx.storage.delete(file.storageId);
    }
    await ctx.db.delete(args.documentId);

    const user = await ctx.db.get(userId);
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user?.email,
      action: "uploaded_document_removed",
      resource: "uploadedDocuments",
      resourceId: args.documentId,
      before: { title: doc.title, fileName: doc.fileName, sizeBytes: doc.sizeBytes },
      createdAt: Date.now(),
    });
    return { success: true };
  },
});
