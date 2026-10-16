import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/*
 * Cloudie storage abstraction.
 *
 * All business logic goes through THIS module — nothing else may read/write
 * file bytes directly. The runtime's blob storage is used purely as a dumb
 * byte store; ownership, privacy, validation and audit live here.
 */

type StorageFileId = Id<"storageFiles">;

// ─── Policy ───────────────────────────────────────────────────────────────────

export const SIZE_LIMITS: Record<string, number> = {
  kyc_document: 10 * 1024 * 1024, // 10 MB
  pdf_document: 25 * 1024 * 1024, // 25 MB
  image: 8 * 1024 * 1024, // 8 MB
  generic: 25 * 1024 * 1024,
};

export const MIME_ALLOWLIST: Record<string, string[]> = {
  kyc_document: ["application/pdf", "image/jpeg", "image/png"],
  pdf_document: ["application/pdf"],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  generic: [
    "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif",
    "text/csv", "text/plain", "application/json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

function randomPath(kind: string, userId: string): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const day = new Date().toISOString().slice(0, 10);
  return `cloudie/${kind}/${userId}/${day}/${rand}`;
}

/** Sanitize a client-supplied filename: strip paths/control chars, cap length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\w.\- ]+/g, "_").trim();
  return (clean || "file").slice(0, 120);
}

// ─── Upload flow ──────────────────────────────────────────────────────────────

/** Step 1: client asks for a one-time upload URL (runtime infrastructure). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2: after the client POSTs the bytes, register them in the Cloudie
 * storage catalog with ownership, MIME/size policy enforcement and audit.
 */
export const registerFile = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: v.union(v.literal("kyc_document"), v.literal("pdf_document"), v.literal("image"), v.literal("generic")),
    originalName: v.string(),
    tenantId: v.optional(v.id("tenantSites")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new Error("Upload not found — register files only after a successful upload");

    const mime = meta.contentType ?? "application/octet-stream";
    const allowed = MIME_ALLOWLIST[args.kind] ?? [];
    if (!allowed.includes(mime)) {
      await ctx.storage.delete(args.storageId); // reject + clean up
      throw new Error(`MIME type ${mime} is not allowed for ${args.kind} uploads`);
    }
    const limit = SIZE_LIMITS[args.kind] ?? SIZE_LIMITS.generic;
    if (meta.size > limit) {
      await ctx.storage.delete(args.storageId);
      throw new Error(`File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit for ${args.kind} uploads`);
    }

    // Tenant ownership: only the tenant owner may attach files to that tenant
    if (args.tenantId) {
      const tenant = await ctx.db.get(args.tenantId);
      if (!tenant || tenant.ownerId !== userId) {
        await ctx.storage.delete(args.storageId);
        throw new Error("Forbidden — you do not own this workspace");
      }
    }

    const fileId = await ctx.db.insert("storageFiles", {
      storageId: args.storageId,
      ownerId: userId,
      tenantId: args.tenantId,
      kind: args.kind,
      originalName: sanitizeFileName(args.originalName),
      mimeType: mime,
      sizeBytes: meta.size,
      path: randomPath(args.kind, userId),
      sha256: meta.sha256,
      isDeleted: false,
      createdAt: Date.now(),
    });

    const user = await ctx.db.get(userId);
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user?.email,
      action: "storage_upload",
      resource: "storageFile",
      resourceId: fileId,
      after: { kind: args.kind, mimeType: mime, sizeBytes: meta.size },
      createdAt: Date.now(),
    });

    return fileId;
  },
});

// ─── Authorized retrieval ─────────────────────────────────────────────────────

/**
 * Returns a short-lived signed URL ONLY to the file's owner, a same-tenant
 * member, or an admin. Private by default — this is the single access gate.
 */
export const getFileUrl = mutation({
  args: { fileId: v.id("storageFiles") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Unauthorized");

    const file = await ctx.db.get(args.fileId);
    if (!file || file.isDeleted) throw new Error("Not found");

    const isOwner = file.ownerId === userId;
    const isAdmin = user.role === "admin";
    let isTenantMember = false;
    if (file.tenantId) {
      const tenant = await ctx.db.get(file.tenantId);
      isTenantMember = tenant?.ownerId === userId;
    }
    if (!isOwner && !isAdmin && !isTenantMember) {
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actorEmail: user.email,
        action: "storage_access_denied",
        resource: "storageFile",
        resourceId: args.fileId,
        createdAt: Date.now(),
      });
      throw new Error("Forbidden");
    }

    const url = await ctx.storage.getUrl(file.storageId);
    if (!url) throw new Error("File bytes missing");
    return url;
  },
});

export const listMyFiles = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    fileId: v.id("storageFiles"),
    name: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    kind: v.union(v.literal("kyc_document"), v.literal("pdf_document"), v.literal("image"), v.literal("generic")),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 100));
    const rows = await ctx.db
      .query("storageFiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(limit);
    return rows
      .filter((file) => !file.isDeleted)
      .map((file) => ({
        fileId: file._id,
        name: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        kind: file.kind,
        createdAt: file.createdAt,
      }));
  },
});

export const getMetadata = query({
  args: { fileId: v.id("storageFiles") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.isDeleted) return null;
    if (file.ownerId !== userId && user?.role !== "admin") return null;
    return {
      fileId: file._id,
      kind: file.kind,
      name: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      path: file.path,
      createdAt: file.createdAt,
      ownerId: file.ownerId,
      tenantId: file.tenantId ?? null,
    };
  },
});

export const exists = query({
  args: { fileId: v.id("storageFiles") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    const file = await ctx.db.get(args.fileId);
    return !!file && !file.isDeleted && (file.ownerId === userId || user?.role === "admin");
  },
});

/** Secure deletion: owner or admin. Soft-deletes the catalog row and removes bytes. */
export const deleteFile = mutation({
  args: { fileId: v.id("storageFiles") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.isDeleted) throw new Error("Not found");
    if (file.ownerId !== userId && user?.role !== "admin") throw new Error("Forbidden");

    await ctx.db.patch(args.fileId, { isDeleted: true, deletedAt: Date.now() });
    await ctx.storage.delete(file.storageId);

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user?.email,
      action: "storage_delete",
      resource: "storageFile",
      resourceId: args.fileId,
      before: { name: file.originalName, sizeBytes: file.sizeBytes },
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

// ─── Internal helpers for engines (documents/image studio) ───────────────────

/** Register bytes that were stored server-side by a trusted engine. */
export const registerEngineFile = internalMutation({
  args: {
    storageId: v.id("_storage"),
    ownerId: v.id("users"),
    tenantId: v.optional(v.id("tenantSites")),
    kind: v.union(v.literal("kyc_document"), v.literal("pdf_document"), v.literal("image"), v.literal("generic")),
    originalName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new Error("Engine storage missing");
    const fileId = await ctx.db.insert("storageFiles", {
      storageId: args.storageId,
      ownerId: args.ownerId,
      tenantId: args.tenantId,
      kind: args.kind,
      originalName: sanitizeFileName(args.originalName),
      mimeType: args.mimeType,
      sizeBytes: meta.size,
      path: randomPath(args.kind, args.ownerId),
      sha256: meta.sha256,
      isDeleted: false,
      createdAt: Date.now(),
    });
    return fileId;
  },
});

/** Internal signed-URL read used by engines after their own authorization. */
export const engineFileUrl = internalMutation({
  args: { fileId: v.id("storageFiles") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.isDeleted) return null;
    return await ctx.storage.getUrl(file.storageId);
  },
});

export type StorageFileIdType = StorageFileId;
