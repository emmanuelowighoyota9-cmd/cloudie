import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Coins,
  Download,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  isSafeImageDataUrl,
  validateValues,
  type DocumentValues,
} from "@/lib/docTemplateEngine";
import {
  newAttemptId,
  renderDocumentArtifacts,
  uploadArtifact,
} from "@/lib/renderClient";
import { useTemplateArtwork } from "@/hooks/use-template-artwork";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { TemplateForm } from "@/components/documents/TemplateForm";
import { PageHeader } from "@/components/documents/ui";

/**
 * Document builder.
 *
 * Fill the dynamic form → the preview re-renders instantly from the same
 * engine used for export → Generate rasterizes PNG + assembles the PDF in the
 * browser, uploads both, and the server validates + charges + records.
 */
export default function DocumentBuilder() {
  const params = useParams<{ templateId: string }>();
  const templateId = params.templateId as Id<"documentTemplates"> | undefined;
  const navigate = useNavigate();

  const template = useQuery(
    api.docTemplates.getTemplate,
    templateId ? { templateId } : "skip",
  );
  const quote = useQuery(
    api.docTemplates.getRenderQuote,
    templateId ? { templateId } : "skip",
  );

  const createDocument = useMutation(api.docTemplates.createDocument);
  const updateDocumentValues = useMutation(api.docTemplates.updateDocumentValues);
  const finalizeDocument = useMutation(api.docTemplates.finalizeDocument);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [title, setTitle] = useState("");
  const [values, setValues] = useState<DocumentValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftId, setDraftId] = useState<Id<"renderedDocuments"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");

  // Seed the form from the template once it loads.
  useEffect(() => {
    if (!template) return;
    setTitle((current) => current || template.name);
    setValues((current) => (Object.keys(current).length > 0 ? current : { ...template.defaults }));
  }, [template]);

  const schema = template?.schema ?? { fields: [] };
  const configuration = template?.configuration ?? { pages: [] };
  // Artwork traced from an upload is injected at render time, never stored in
  // the layout. Export waits for it so a page never loses its background.
  const artwork = useTemplateArtwork(configuration.pages, template?.artworkUrl);
  const renderConfiguration = useMemo(
    () => ({ ...configuration, pages: artwork.pages }),
    [configuration, artwork.pages],
  );
  const sensitive = template?.sensitivity === "sensitive";
  const cost = quote?.cost ?? template?.requiredCredits ?? 0;
  const balance = quote?.balance ?? 0;
  const affordable = quote?.affordable ?? balance >= cost;

  const imageDataUrls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of schema.fields) {
      if (field.type !== "image") continue;
      const value = values[field.id];
      if (isSafeImageDataUrl(value)) out[field.id] = value;
    }
    return out;
  }, [schema, values]);

  const handleChange = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const persistDraft = async (): Promise<Id<"renderedDocuments"> | null> => {
    if (!templateId) return null;
    if (draftId) {
      await updateDocumentValues({ documentId: draftId, title, values });
      return draftId;
    }
    const created = await createDocument({ templateId, title, values });
    setDraftId(created.documentId);
    return created.documentId;
  };

  const onSaveDraft = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await persistDraft();
      toast.success("Draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft");
    } finally {
      setSaving(false);
    }
  };

  const onGenerate = async () => {
    if (!template) return;
    const result = validateValues(schema, values);
    if (!result.ok) {
      const map: Record<string, string> = {};
      for (const issue of result.issues) map[issue.field] = issue.message;
      setErrors(map);
      toast.error(`Fix ${result.issues.length} field${result.issues.length === 1 ? "" : "s"} before generating`);
      return;
    }
    if (!affordable) {
      toast.error(`Insufficient points — this render costs ${cost} points`);
      return;
    }

    setGenerating(true);
    try {
      setStage("Rendering pages…");
      const artifacts = await renderDocumentArtifacts(renderConfiguration, schema, result.values, {
        sensitive,
        images: imageDataUrls,
        title: title || template.name,
        creationDate: Date.now(),
      });

      setStage("Uploading artifacts…");
      const [imageUploadUrl, pdfUploadUrl] = await Promise.all([
        generateUploadUrl({}),
        generateUploadUrl({}),
      ]);
      const [imageStorageId, pdfStorageId] = await Promise.all([
        uploadArtifact(imageUploadUrl, artifacts.imagePng),
        uploadArtifact(
          pdfUploadUrl,
          new Blob([artifacts.pdfBytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
        ),
      ]);

      setStage("Finalizing…");
      const documentId = await persistDraft();
      if (!documentId) throw new Error("Could not create the document record");

      const outcome = await finalizeDocument({
        documentId,
        attemptId: newAttemptId(),
        imageStorageId: imageStorageId as Id<"_storage">,
        pdfStorageId: pdfStorageId as Id<"_storage">,
        pageCount: artifacts.pageCount,
        sizeBytes: artifacts.sizeBytes,
      });

      toast.success(
        outcome.charged > 0
          ? `Document generated — ${outcome.charged} points used`
          : "Document generated",
      );
      navigate(`/documents/${documentId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setGenerating(false);
      setStage("");
    }
  };

  if (template === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Document builder" description="Loading template…" />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Template unavailable" description="This template may have been archived or removed." />
        <Button asChild variant="outline">
          <Link to="/documents/templates" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to the library
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={template.name}
        description={template.description}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/documents/templates" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Library
              </Link>
            </Button>
            <Button variant="outline" onClick={onSaveDraft} disabled={saving || generating} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </Button>
            <Button
              onClick={onGenerate}
              disabled={generating || !affordable || !artwork.ready}
              className="gap-1.5"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate ({cost} pts)
            </Button>
          </>
        }
      />

      {artwork.failed && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            The artwork file for this template could not be loaded, so the page background is missing. Your text and
            fields still render. Reload the page or re-attach the artwork in the editor.
          </p>
        </div>
      )}

      {sensitive && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-[11px] leading-relaxed text-destructive">
            <p className="font-semibold">Sensitive template — demo output</p>
            <p className="mt-0.5 text-destructive/80">
              Every page is stamped with a non-removable DEMO · SAMPLE · SIMULATION watermark and a notice bar. Use
              fictional names, references and amounts only.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="space-y-1.5">
            <Label htmlFor="doc-title" className="text-xs font-medium text-muted-foreground">
              Document title
            </Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Document title"
            />
            <p className="text-[11px] text-muted-foreground">Used for the file name and your document list.</p>
          </div>

          <div className="h-px bg-border" />

          <TemplateForm
            schema={schema}
            values={values}
            errors={errors}
            onChange={handleChange}
            className="sm:grid-cols-2"
          />
        </motion.div>

        {/* Preview + summary */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live preview</p>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Wand2 className="h-3 w-3" /> updates instantly
              </span>
            </div>
            <DocumentPreview
              configuration={renderConfiguration}
              schema={schema}
              values={values}
              sensitive={sensitive}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Render cost</span>
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <Coins className="h-3.5 w-3.5 text-primary" /> {cost} pts
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Points balance</span>
              <span className="font-semibold tabular-nums text-foreground">{balance.toLocaleString()}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={onGenerate}
                disabled={generating || !affordable || !artwork.ready}
                className="flex-1 gap-1.5"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? stage || "Generating…" : artwork.ready ? "Generate document" : "Preparing artwork…"}
              </Button>
              {!affordable && (
                <Button variant="outline" asChild>
                  <Link to="/buy-points">Top up</Link>
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Generates a high-resolution PNG and a multi-page PDF, stored in your workspace and shareable by link.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[11px] text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            Drafts are free — points are only charged when a document is generated.
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[11px] text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            Exports live on the document page after generation.
          </div>
        </div>
      </div>
    </div>
  );
}
