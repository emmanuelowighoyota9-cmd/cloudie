import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  Check,
  Coins,
  Copy,
  Download,
  Eye,
  FileText,
  Link2,
  Loader2,
  Share2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatValueForField, type TemplateSchema } from "@/lib/docTemplateEngine";
import { downloadBlob, formatBytes } from "@/lib/renderClient";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { PageHeader, StatusPill, formatDateTime } from "@/components/documents/ui";

async function saveArtifact(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    downloadBlob(await res.blob(), fileName);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function DocumentDetail() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId as Id<"renderedDocuments"> | undefined;
  const navigate = useNavigate();

  const doc = useQuery(api.docTemplates.getDocument, documentId ? { documentId } : "skip");
  const shareDocument = useMutation(api.docTemplates.shareDocument);
  const revokeShare = useMutation(api.docTemplates.revokeShare);
  const archiveDocument = useMutation(api.docTemplates.archiveDocument);

  const [working, setWorking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (doc === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Document" description="Loading…" />
        <Skeleton className="h-[520px]" />
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Document not found" description="It may have been archived or belongs to another account." />
        <Button asChild variant="outline">
          <Link to="/documents" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to documents
          </Link>
        </Button>
      </div>
    );
  }

  const schema = (doc.schema ?? { fields: [] }) as TemplateSchema;
  const values = (doc.values ?? {}) as Record<string, unknown>;
  const shareUrl = doc.publicSlug ? `${window.location.origin}/d/${doc.publicSlug}` : null;
  const isReady = doc.status === "completed" || doc.status === "shared";

  const onShare = async () => {
    setWorking("share");
    try {
      const result = await shareDocument({ documentId: doc._id, expiresInDays: 30 });
      const url = `${window.location.origin}/d/${result.slug}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied to clipboard");
      } catch {
        toast.success("Share link created");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the share link");
    } finally {
      setWorking(null);
    }
  };

  const onRevoke = async () => {
    setWorking("revoke");
    try {
      await revokeShare({ documentId: doc._id });
      toast.success("Share link revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the link");
    } finally {
      setWorking(null);
    }
  };

  const onArchive = async () => {
    setWorking("archive");
    try {
      await archiveDocument({ documentId: doc._id });
      toast.success("Document archived");
      navigate("/documents");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive");
    } finally {
      setWorking(null);
    }
  };

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard is not available");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={doc.title}
        description={`${doc.categoryLabel} · template v${doc.templateVersion} · generated ${formatDateTime(doc.createdAt)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/documents" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Documents
              </Link>
            </Button>
            {isReady && doc.pdfUrl && (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => saveArtifact(doc.pdfUrl as string, doc.fileName)}
              >
                <Download className="h-4 w-4" /> PDF
              </Button>
            )}
            {isReady && doc.imageUrl && (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  saveArtifact(doc.imageUrl as string, doc.fileName.replace(/\.pdf$/i, "") + ".png")
                }
              >
                <Download className="h-4 w-4" /> PNG
              </Button>
            )}
            {isReady && (shareUrl ? (
              <Button variant="outline" onClick={onRevoke} disabled={working === "revoke"} className="gap-1.5">
                {working === "revoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Revoke link
              </Button>
            ) : (
              <Button onClick={onShare} disabled={working === "share"} className="gap-1.5">
                {working === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Share
              </Button>
            ))}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={doc.status} />
        {doc.sensitivity === "sensitive" && (
          <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
            <ShieldAlert className="h-3 w-3" /> demo watermark
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Coins className="h-3 w-3" /> {doc.pointsCost} pts
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3" /> {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} ·{" "}
          {formatBytes(doc.sizeBytes)}
        </span>
        {doc.viewCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3" /> {doc.viewCount} views
          </span>
        )}
      </div>

      {doc.failureReason && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-[11px] text-destructive">
            <p className="font-semibold">Last generation failed</p>
            <p className="mt-0.5 text-destructive/80">{doc.failureReason}</p>
          </div>
        </div>
      )}

      {shareUrl && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3"
        >
          <Link2 className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground">Public share link</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{shareUrl}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onCopy} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </Button>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {isReady ? "Generated document" : "Draft preview"}
          </p>
          {isReady && doc.imageUrl ? (
            <img
              src={doc.imageUrl}
              alt={doc.title}
              className="mx-auto block h-auto w-full max-w-full rounded-lg border border-border shadow-sm"
            />
          ) : (
            <DocumentPreview
              configuration={doc.configuration}
              schema={schema}
              values={values}
              sensitive={doc.sensitivity === "sensitive"}
            />
          )}
        </motion.div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Details</p>
            <dl className="mt-3 space-y-2 text-xs">
              {[
                ["Status", doc.status],
                ["Template", doc.templateName],
                ["Category", doc.categoryLabel],
                ["Version", `v${doc.templateVersion}`],
                ["Pages", String(doc.pageCount)],
                ["File size", formatBytes(doc.sizeBytes)],
                ["Credits", `${doc.pointsCost} pts`],
                ["Share state", doc.shareState],
                ["Created", formatDateTime(doc.createdAt)],
                ["Updated", formatDateTime(doc.updatedAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-medium capitalize text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Submitted values
            </p>
            <dl className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1 text-xs">
              {schema.fields.map((field) => {
                const shown = formatValueForField(field, values[field.id]);
                if (!shown) return null;
                return (
                  <div key={field.id} className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="max-w-[55%] truncate text-right font-medium text-foreground">{shown}</dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <Button variant="outline" onClick={onArchive} disabled={working === "archive"} className="w-full gap-1.5">
            {working === "archive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Archive document
          </Button>
        </div>
      </div>
    </div>
  );
}
