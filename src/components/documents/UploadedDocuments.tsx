import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Check,
  Download,
  ExternalLink,
  FileText,
  LayoutTemplate,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyBlock, SectionHeader, formatDateTime } from "@/components/documents/ui";
import DocumentUploadDialog from "@/components/documents/DocumentUploadDialog";
import { formatBytes } from "@/lib/renderClient";
import { artworkDataUrl, imageDimensions } from "@/lib/templateArtwork";
import type { FieldDef } from "@/lib/docTemplateEngine";

interface UploadedDocument {
  _id: Id<"uploadedDocuments">;
  fileId: Id<"storageFiles">;
  title: string;
  fileName: string;
  kind: "pdf" | "image";
  mimeType: string;
  sizeBytes: number;
  notes: string;
  url: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Files the customer already owns, kept in their document workspace.
 *
 * Uploaded documents are clean by construction — they are shown and served
 * exactly as provided. Previewing and downloading both go through the
 * owner-only signed URLs the backend hands back.
 */
export default function UploadedDocuments() {
  const documents = useQuery(api.uploadedDocuments.list, { limit: 24 });
  const organization = useQuery(api.organization.getMyOrganization, {});
  const renameDocument = useMutation(api.uploadedDocuments.rename);
  const removeDocument = useMutation(api.uploadedDocuments.remove);
  const createMyTemplate = useMutation(api.docTemplates.createMyTemplate);
  const navigate = useNavigate();

  const [viewing, setViewing] = useState<UploadedDocument | null>(null);
  const [renaming, setRenaming] = useState<UploadedDocument | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<UploadedDocument | null>(null);
  const [converting, setConverting] = useState<Id<"uploadedDocuments"> | null>(null);
  const [working, setWorking] = useState(false);

  /**
   * Trace an uploaded file into a reusable template.
   *
   * The file becomes the page artwork at render time (never inlined into the
   * layout), the page is sized to the file, and a small set of fields is added
   * so the template produces new clean documents straight away.
   */
  const onUseAsTemplate = async (doc: UploadedDocument) => {
    if (doc.kind !== "image" || !doc.url) {
      toast.error("Only uploaded images can be traced as template artwork today.");
      return;
    }
    setConverting(doc._id);
    try {
      const dataUrl = await artworkDataUrl(doc.url);
      const size = await imageDimensions(dataUrl);
      const naturalWidth = size?.width ?? 794;
      const naturalHeight = size?.height ?? 1123;
      const landscape = naturalWidth > naturalHeight;
      const pageWidth = landscape ? 1123 : 794;
      const pageHeight = Math.min(Math.max(Math.round(pageWidth * (naturalHeight / naturalWidth)), 200), 4000);

      const fields: FieldDef[] = [
        { id: "title", type: "text", label: "Document title", default: doc.title.slice(0, 60), required: true, maxLength: 60 },
        { id: "reference", type: "reference", label: "Reference", default: "DOC-0001", required: true },
        { id: "notes", type: "textarea", label: "Notes", default: "", maxLength: 400 },
      ];
      const organizationName = organization?.organizationName ?? "";
      if (organizationName) {
        fields.splice(1, 0, {
          id: "organization",
          type: "text",
          label: "Issued by",
          default: organizationName,
          maxLength: 60,
          help: "Shown when you place it on the page. Defaults to your organization name.",
        });
      }

      const result = await createMyTemplate({
        name: doc.title.slice(0, 80),
        documentType: "corporate",
        description: `Traced from ${doc.fileName} — your own clean document.`,
        requiredCredits: 0,
        supportedFormats: ["png", "pdf"],
        schema: { fields },
        configuration: {
          renderScale: 2,
          pages: [{ width: pageWidth, height: pageHeight, background: "#ffffff", elements: [] }],
        },
        artworkFileId: doc.fileId,
      });

      toast.success("Template created — add text or codes on top of your file");
      navigate(`/documents/own/${result.templateId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a template from this file");
    } finally {
      setConverting(null);
    }
  };

  const onRename = async () => {
    if (!renaming) return;
    setWorking(true);
    try {
      await renameDocument({ documentId: renaming._id, title: renameValue });
      toast.success("Document renamed");
      setRenaming(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename the document");
    } finally {
      setWorking(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setWorking(true);
    try {
      await removeDocument({ documentId: deleting._id });
      toast.success("Document removed");
      setDeleting(null);
      if (viewing?._id === deleting._id) setViewing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the document");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Uploaded documents"
        action={
          <div className="flex items-center gap-2">
            <DocumentUploadDialog />
          </div>
        }
      />

      {documents === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyBlock
          title="No uploaded documents yet"
          message="Bring in the PDFs and images you already have — contracts, invoices, scans or photos. They stay exactly as you uploaded them, with no demo watermark."
          action={<DocumentUploadDialog />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(documents as UploadedDocument[]).map((doc, index) => (
            <motion.div
              key={doc._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => setViewing(doc)}
                className="relative flex h-36 items-center justify-center overflow-hidden border-b border-border bg-muted/30"
                title={`Open ${doc.title}`}
              >
                {doc.kind === "image" && doc.url ? (
                  <img
                    src={doc.url}
                    alt={doc.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest">PDF</span>
                  </div>
                )}
                <span className="absolute right-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  your file
                </span>
              </button>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{doc.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {formatBytes(doc.sizeBytes)} · {formatDateTime(doc.createdAt)}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2" onClick={() => setViewing(doc)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 px-2"
                    disabled={doc.kind !== "image" || converting === doc._id}
                    title={
                      doc.kind === "image"
                        ? "Reuse this file as the page artwork of a new template"
                        : "PDF pages can't be traced as artwork yet — upload the page as an image instead"
                    }
                    onClick={() => onUseAsTemplate(doc)}
                  >
                    {converting === doc._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LayoutTemplate className="h-3.5 w-3.5" />
                    )}
                    Template
                  </Button>
                  {doc.url && (
                    <Button size="sm" variant="outline" className="h-8 px-2" asChild>
                      <a href={doc.url} download={doc.fileName} title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    title="Rename"
                    onClick={() => {
                      setRenaming(doc);
                      setRenameValue(doc.title);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => setDeleting(doc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Viewer */}
      <Dialog open={viewing !== null} onOpenChange={(next) => !next && setViewing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing ? `${viewing.fileName} · ${formatBytes(viewing.sizeBytes)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
                {viewing.kind === "image" && viewing.url ? (
                  <img src={viewing.url} alt={viewing.title} className="mx-auto max-h-[65vh] w-auto" />
                ) : viewing.url ? (
                  <iframe src={viewing.url} title={viewing.title} className="h-[65vh] w-full bg-background" />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">This file is no longer available.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {viewing.url && (
                  <>
                    <Button asChild className="gap-1.5">
                      <a href={viewing.url} download={viewing.fileName}>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                    <Button variant="outline" asChild className="gap-1.5">
                      <a href={viewing.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" /> Open in a new tab
                      </a>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={renaming !== null} onOpenChange={(next) => !next && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>The file itself is untouched — only the name in your workspace changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="rename-title" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Name
            </Label>
            <Input
              id="rename-title"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={120}
              className="h-11 sm:h-9"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={working}>
              Cancel
            </Button>
            <Button onClick={onRename} disabled={working || !renameValue.trim()} className="gap-1.5">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the file from your workspace permanently. Documents you generated from templates are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onDelete();
              }}
              disabled={working}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
