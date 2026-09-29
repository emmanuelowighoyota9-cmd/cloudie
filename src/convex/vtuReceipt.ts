/**
 * VTU receipts — issued on demand, never at settlement.
 *
 * WHY NOT AT SETTLEMENT. A receipt produced the moment a transaction settles
 * pins a document to a status that can still change, and it charges the render
 * work for every transaction whether or not anybody ever looks. Issuing on the
 * first "View receipt" click inverts both: the document reflects the record as
 * it stands when the customer asks for it, and nothing is generated for the
 * purchases nobody wants paperwork for.
 *
 * WHY THE VALUES COME FROM HERE AND NOT FROM THE BROWSER. The document engine's
 * `createDocument` takes values from its caller, which is right for a template
 * a human fills in. It is wrong here: a receipt renders the platform's own name
 * over money figures, so a client that could supply the figures could produce a
 * platform-authored document showing an amount it never charged. The values are
 * therefore built server-side from the transaction's own snapshot — see
 * `../lib/vtuReceipt.ts`, where that mapping is pure and independently testable.
 *
 * IDEMPOTENT BY POINTER, NOT BY GUESS. The transaction carries
 * `receiptDocumentId` (the receipt that is currently true) and
 * `receiptTemplateKey` (which template produced it). A second click returns the
 * first document rather than generating a rival, and a generation interrupted
 * halfway is resumed rather than restarted — the draft it left behind is handed
 * back with the values it already holds, so a retry cannot produce a second
 * receipt number for the same purchase.
 *
 * THE POINTER IS ALLOWED TO MOVE, THE DOCUMENT IS NOT. A generated document is
 * immutable, so a refund that lands after a receipt was issued cannot edit it.
 * This module issues the AMENDED sibling instead and repoints, which is why
 * `receiptTemplateKey` is stored rather than derived: a read must be able to ask
 * "is the receipt on file still the right KIND" without loading a second table.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, type MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type {
  DocumentValues,
  TemplateConfiguration,
  TemplateSchema,
} from "../lib/docTemplateEngine";
import { insertDocumentRecord, type VersionBlocks } from "./docTemplates";
import { readBrand } from "./platform";
import { resolveServiceLabel } from "./vtu";
import {
  VTU_AMENDED_RECEIPT_TEMPLATE_SLUG,
  VTU_RECEIPT_TEMPLATE_SLUG,
} from "../lib/vtu";
import {
  amendedReceiptNumberFor,
  buildReceiptValues,
  receiptNumberFor,
} from "../lib/vtuReceipt";

/**
 * Does the receipt on file predate the reversal?
 *
 * COMPARING TIMESTAMPS, rather than reading a status off the document or
 * carrying a "was it reversed when we issued this" flag. Both of those record a
 * fact about a moment; the two timestamps ARE that moment, and they exist
 * already — `reversedAt` is written by the reversal, and `createdAt` is written
 * when the document row is created.
 *
 * It also gets the asymmetric case right for free. A receipt first requested
 * AFTER a refund was issued on a reversed transaction, and describes it
 * correctly — so `createdAt > reversedAt`, no amendment is due, and the customer
 * is not handed a second document apologising for a receipt that was right.
 */
function needsAmendment(
  tx: { status: string; reversedAt?: number | null },
  receipt: { createdAt: number },
): boolean {
  if (tx.status !== "reversed") return false;
  const reversedAt = tx.reversedAt;
  if (typeof reversedAt !== "number" || !Number.isFinite(reversedAt)) return false;
  return receipt.createdAt < reversedAt;
}

/**
 * The receipt template for a slug, seeding the platform set if it is missing.
 *
 * The self-heal matters more than it looks. Templates are installed by an
 * idempotent, version-guarded mutation that runs when the document library is
 * opened — so on a deployment where nobody has opened the library yet, the
 * first customer to click "View receipt" would otherwise be told to ask an
 * administrator for a document the product owes them. Running the seeder here
 * turns that into a first click that simply works; after the first run the
 * version guard makes it one settings read.
 *
 * A template an administrator has ARCHIVED is a different case and is not
 * second-guessed: the seeder does not reactivate anything, the retry fails, and
 * the customer is told receipts are unavailable. Silently overriding an
 * operator's decision to switch a template off would be the wrong repair.
 */
async function findReceiptTemplate(ctx: MutationCtx, slug: string) {
  const look = async () =>
    await ctx.db
      .query("documentTemplates")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

  const found = await look();
  if (found && found.isActive) return found;

  await ctx.runMutation(api.docTemplates.ensureStarterTemplates, {});
  const retry = await look();
  if (!retry || !retry.isActive) {
    throw new Error("Receipts are not available yet. Please try again in a moment.");
  }
  return retry;
}

/**
 * Get the current receipt for a transaction, generating it if there is none.
 *
 * Returns either "already rendered, go and read it" or "here is the frozen
 * schema, layout and values — render them, upload the artifacts and finalize",
 * because rendering happens in the browser (SVG → canvas → PNG/PDF) on the same
 * code path every other document uses. A second renderer on the server would be
 * a second thing to keep in step with the engine.
 */
export const prepareReceipt = mutation({
  args: { transactionId: v.id("vtuTransactions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Transaction not found");
    // Owner check, not an admin check: a receipt is the customer's document.
    // An operator reads the transaction through the admin surfaces, which have
    // their own audit trail, rather than by minting a customer-facing receipt.
    if (tx.userId !== userId) throw new Error("Forbidden");

    const existing: Doc<"renderedDocuments"> | null = tx.receiptDocumentId
      ? await ctx.db.get(tx.receiptDocumentId)
      : null;

    const supersede = existing !== null && needsAmendment(tx, existing);

    if (existing && !supersede) {
      if (existing.status === "completed" || existing.status === "shared") {
        return { needsRender: false as const, documentId: existing._id };
      }
      // An attempt that did not finish. Resume it from the frozen version and
      // the values it already holds, so the retry renders the receipt the first
      // attempt was going to render — same number, same timestamps — rather
      // than minting a new one for the same purchase.
      const version = await ctx.db.get(existing.templateVersionId);
      const blocks = version?.blocks as VersionBlocks | undefined;
      return {
        needsRender: true as const,
        documentId: existing._id,
        title: existing.title ?? "Receipt",
        schema: blocks?.schema ?? { fields: [] },
        configuration: blocks?.configuration ?? { pages: [] },
        values: (existing.inputData ?? {}) as DocumentValues,
      };
    }

    const templateSlug = supersede
      ? VTU_AMENDED_RECEIPT_TEMPLATE_SLUG
      : VTU_RECEIPT_TEMPLATE_SLUG;
    const template = await findReceiptTemplate(ctx, templateSlug);

    const issuedAt = Date.now();
    const receiptNumber = supersede
      ? amendedReceiptNumberFor(tx._id)
      : receiptNumberFor(tx._id);

    // What this receipt supersedes, read off the document that printed it. The
    // pointer records WHICH kind is current; what it NUMBERED itself lives on
    // the document, and only the document can be trusted for it.
    const amendsReceiptNumber =
      supersede && existing
        ? String(
            ((existing.inputData ?? {}) as DocumentValues).receiptNumber ?? "",
          ).trim() || undefined
        : undefined;

    const built = buildReceiptValues(
      {
        transactionId: tx._id,
        customerIdentifier: tx.customerIdentifier,
        nairaPrice: tx.nairaPrice,
        ngnPerPoint: tx.ngnPerPoint,
        pointsDebited: tx.pointsDebited,
        status: tx.status,
        providerReference: tx.providerReference ?? null,
        reversalReason: tx.reversalReason ?? null,
        resolvedAt: tx.resolvedAt ?? null,
      },
      {
        // The platform's own name, not the customer's organization: this is the
        // issuer's document.
        issuer: (await readBrand(ctx)).name,
        serviceName: await resolveServiceLabel(ctx, tx.serviceCode),
        issuedAt,
        receiptNumber,
        amendsReceiptNumber,
      },
    );
    if (!built.ok) throw new Error(built.error);

    const created = await insertDocumentRecord(ctx, {
      userId,
      templateId: template._id,
      title: `${supersede ? "Amended receipt" : "Receipt"} ${receiptNumber}`,
      values: built.values,
      applyOrganizationDefault: false,
      // Not rate-limited. Receipts are idempotent per transaction, so the most
      // a customer can generate is one per purchase they have made, and
      // throttling them for clicking through their own history would punish
      // exactly the behaviour the product asks for.
      rateLimited: false,
      // Refused rather than created if the values could not render. A receipt
      // with an unfillable field would sit in the table erroring on every future
      // click, and a human cannot fix it — it is not their document.
      requireRenderable: true,
    });

    await ctx.db.patch(tx._id, {
      receiptDocumentId: created.documentId,
      receiptTemplateKey: templateSlug,
      // `updatedAt` is deliberately NOT touched. It is the provider-facing
      // lifecycle clock — the reconciliation sweep measures staleness on it —
      // and viewing a receipt is not a lifecycle event. Moving it would make
      // the history page say "last update" about something that did not change
      // the transaction.
    });

    return {
      needsRender: true as const,
      documentId: created.documentId,
      title: created.title,
      schema: created.schema,
      configuration: created.configuration,
      values: created.values,
    };
  },
});

/** The shape `prepareReceipt` returns, for the client to narrow on. */
export type PreparedReceipt =
  | { needsRender: false; documentId: Id<"renderedDocuments"> }
  | {
      needsRender: true;
      documentId: Id<"renderedDocuments">;
      title: string;
      schema: TemplateSchema;
      configuration: TemplateConfiguration;
      values: DocumentValues;
    };
