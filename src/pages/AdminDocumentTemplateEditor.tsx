import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Barcode,
  Coins,
  Eye,
  Grid3x3,
  Image as ImageIcon,
  Layers,
  Loader2,
  MousePointerSquareDashed,
  Plus,
  QrCode,
  Save,
  Square,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  categoryDef,
  validateTemplateDefinition,
  type FieldDef,
  type LayoutElement,
  type TemplatePage,
} from "@/lib/docTemplateEngine";
import {
  BOUND_KINDS,
  ELEMENT_KINDS,
  ELEMENT_LABELS,
  PAGE_PRESETS,
  blankTemplateDraft,
  clamp,
  defaultElement,
  duplicateElement,
  moveElement,
  previewValues,
  type ElementKind,
} from "@/lib/documentLayout";
import { useTemplateArtwork } from "@/hooks/use-template-artwork";
import { ElementCanvas } from "@/components/documents/ElementCanvas";
import { ElementInspector } from "@/components/documents/ElementInspector";
import { SchemaFieldEditor } from "@/components/documents/SchemaFieldEditor";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { PageHeader } from "@/components/documents/ui";
import { usePricing } from "@/lib/pricing";

const DESIGN_SERVICE = "custom_document_design";
const DEFAULT_DESIGN_COST = 25;

const ELEMENT_ICONS: Record<ElementKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  rect: Square,
  line: MinusLine,
  image: ImageIcon,
  qr: QrCode,
  barcode: Barcode,
  badge: BadgeCheck,
};

function MinusLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M4 12h16" />
    </svg>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const selectClass =
  "h-11 w-full min-w-0 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary sm:h-9";

export interface DocumentTemplateEditorProps {
  /**
   * "admin" edits platform templates; "own" authors a private document owned by
   * the signed-in user.
   */
  variant?: "admin" | "own";
  /** Organization name pre-filled on newly authored documents. */
  organizationName?: string;
}

/**
 * Visual document-template editor.
 *
 * Arranges the exact `LayoutElement` structure the renderer consumes, so the
 * canvas, the live preview and the exported PNG/PDF are all the same document.
 * The same editor powers the admin library and a customer's own clean
 * documents — only the persistence target and the allowed categories differ.
 */
export default function DocumentTemplateEditor({
  variant = "admin",
  organizationName = "",
}: DocumentTemplateEditorProps) {
  const isOwn = variant === "own";
  const pricing = usePricing();
  const designPrice = pricing.price(DESIGN_SERVICE, DEFAULT_DESIGN_COST);
  const [confirmDesignSave, setConfirmDesignSave] = useState(false);
  const confirmedDesignSave = useRef(false);
  const { templateId } = useParams<{ templateId?: string }>();
  const editing = Boolean(templateId);
  const navigate = useNavigate();

  const adminExisting = useQuery(
    api.docTemplateAdmin.adminGetTemplate,
    !isOwn && templateId ? { templateId: templateId as Id<"documentTemplates"> } : "skip",
  );
  const ownExisting = useQuery(
    api.docTemplates.getMyTemplate,
    isOwn && templateId ? { templateId: templateId as Id<"documentTemplates"> } : "skip",
  );
  const pointsBalance = useQuery(api.points.getBalance);
  const balanceLoading = pointsBalance === undefined;
  const canAffordDesign = typeof pointsBalance === "number" && pointsBalance >= designPrice.points;
  const existing = isOwn ? ownExisting : adminExisting;
  const createTemplate = useMutation(api.docTemplateAdmin.adminCreateTemplate);
  const publishVersion = useMutation(api.docTemplateAdmin.adminPublishTemplateVersion);
  const createOwnTemplate = useMutation(api.docTemplates.createMyTemplate);
  const updateOwnTemplate = useMutation(api.docTemplates.updateMyTemplate);
  const backTo = isOwn ? "/documents" : "/admin/document-templates";

  const blank = useMemo(
    () => (isOwn ? blankTemplateDraft({ organization: organizationName }) : blankTemplateDraft()),
    [isOwn, organizationName],
  );

  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [documentType, setDocumentType] = useState<string>("corporate");
  const [description, setDescription] = useState("");
  const [requiredCredits, setRequiredCredits] = useState(25);
  const [formats, setFormats] = useState<{ png: boolean; pdf: boolean }>({ png: true, pdf: true });
  const [fields, setFields] = useState<FieldDef[]>(blank.schema.fields);
  const [pages, setPages] = useState<TemplatePage[]>(blank.configuration.pages);
  const [renderScale, setRenderScale] = useState(2);

  const [activePage, setActivePage] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"layout" | "preview">("layout");
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);

  // Hydrate from the existing template exactly once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!editing || hydratedRef.current || !existing) return;
    hydratedRef.current = true;
    setName(existing.name);
    setSlug(existing.slug);
    setSlugTouched(true);
    setDocumentType(existing.documentType);
    setDescription(existing.description);
    setRequiredCredits(existing.requiredCredits);
    setFormats({
      png: existing.supportedFormats.includes("png"),
      pdf: existing.supportedFormats.includes("pdf"),
    });
    setFields(existing.schema.fields ?? []);
    setPages(existing.configuration.pages ?? []);
    setRenderScale(existing.configuration.renderScale ?? 2);
    setHydrated(true);
  }, [editing, existing]);

  useEffect(() => {
    if (!editing && !slugTouched) setSlug(slugify(name));
  }, [name, slugTouched, editing]);

  const category = categoryDef(documentType);

  const categoryOptions = useMemo(() => CATEGORIES, []);

  const schema = useMemo(() => ({ fields }), [fields]);
  const configuration = useMemo(() => ({ renderScale, pages }), [renderScale, pages]);
  // The stored layout never contains artwork — only the editing surfaces do.
  const artwork = useTemplateArtwork(pages, existing?.artworkUrl);
  const previewPages = artwork.pages;
  // Samples rather than empty defaults: a layout can only be judged against
  // realistic content, and empty values render nothing at all.
  const values = useMemo(() => previewValues(schema), [schema]);

  const page = pages[activePage];
  const canvasPage = previewPages[activePage] ?? page;
  const elements = page?.elements ?? [];

  const setElements = (next: LayoutElement[]) => {
    setPages((prev) => prev.map((p, i) => (i === activePage ? { ...p, elements: next } : p)));
  };

  const updateElement = (index: number, next: LayoutElement) => {
    const copy = elements.slice();
    copy[index] = next;
    setElements(copy);
  };

  const deleteSelected = () => {
    if (selectedIndex === null) return;
    setElements(elements.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
  };

  const duplicateSelected = () => {
    if (selectedIndex === null) return;
    const copy = elements.slice();
    copy.splice(selectedIndex + 1, 0, duplicateElement(elements[selectedIndex]));
    setElements(copy);
    setSelectedIndex(selectedIndex + 1);
  };

  const reorderSelected = (direction: -1 | 1) => {
    if (selectedIndex === null) return;
    const target = selectedIndex + direction;
    if (target < 0 || target >= elements.length) return;
    const copy = elements.slice();
    const [item] = copy.splice(selectedIndex, 1);
    copy.splice(target, 0, item);
    setElements(copy);
    setSelectedIndex(target);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    if (selectedIndex === null) return;
    updateElement(selectedIndex, moveElement(elements[selectedIndex], dx, dy));
  };

  const addElement = (kind: ElementKind) => {
    if (!page) return;
    const bind = pickBind(kind, fields);
    const offset = (elements.length % 6) * 16;
    const x = Math.max(24, Math.round(page.width / 2 - 130 + offset));
    const y = Math.max(24, Math.round(page.height / 3 + offset));
    const next = defaultElement(kind, x, y, bind);
    setElements([...elements, next]);
    setSelectedIndex(elements.length);
    if (BOUND_KINDS.includes(kind) && !bind) {
      toast.warning(`Add a ${kind === "badge" ? "status" : "reference"} field, then bind this element to it.`);
    }
  };

  // Editor shortcuts — ignored while typing in a form control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedIndex === null) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeSelected(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeSelected(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeSelected(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeSelected(0, step);
      } else if (e.key === "Escape") {
        setSelectedIndex(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, elements]);

  const addPage = () => {
    const base = page ?? { width: 794, height: 1123, background: "#ffffff", elements: [] };
    setPages([
      ...pages,
      { width: base.width, height: base.height, background: base.background, elements: [] },
    ]);
    setActivePage(pages.length);
    setSelectedIndex(null);
  };

  const removePage = (index: number) => {
    if (pages.length <= 1) {
      toast.error("A template needs at least one page");
      return;
    }
    setPages(pages.filter((_, i) => i !== index));
    setActivePage((current) => clamp(current > index ? current - 1 : current, 0, pages.length - 2));
    setSelectedIndex(null);
  };

  const updatePage = (patch: Partial<TemplatePage>) => {
    setPages((prev) => prev.map((p, i) => (i === activePage ? { ...p, ...patch } : p)));
  };

  const onSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Give the template a name");
      return;
    }
    if (!slug.trim()) {
      toast.error("The template needs a URL slug");
      return;
    }
    const found = validateTemplateDefinition(schema, configuration);
    if (found.length > 0) {
      setIssues(found);
      toast.error(`Fix ${found.length} layout issue${found.length === 1 ? "" : "s"} before saving`);
      return;
    }
    setIssues([]);

    const supportedFormats = [
      ...(formats.png ? ["png"] : []),
      ...(formats.pdf ? ["pdf"] : []),
    ];
    if (supportedFormats.length === 0) {
      toast.error("Enable at least one export format");
      return;
    }

    if (isOwn && !confirmedDesignSave.current) {
      setConfirmDesignSave(true);
      return;
    }

    setSaving(true);
    try {
      if (editing && templateId) {
        const id = templateId as Id<"documentTemplates">;
        if (isOwn) {
          const result = await updateOwnTemplate({
            templateId: id,
            name: trimmedName,
            documentType,
            description,
            requiredCredits,
            supportedFormats,
            schema,
            configuration,
          });
          toast.success(`Saved version ${result.version} · ${result.charged} points used for this design`);
          navigate(backTo);
        } else {
          const result = await publishVersion({
            templateId: id,
            schema,
            configuration,
            requiredCredits,
            sensitivity: "standard",
          });
          toast.success(`Published version ${result.version}`);
          navigate(backTo);
        }
      } else if (isOwn) {
        const result = await createOwnTemplate({
          name: trimmedName,
          slug,
          documentType,
          description,
          requiredCredits,
          supportedFormats,
          schema,
          configuration,
        });
        toast.success(`Your document is ready — ${result.charged} points used for this design`);
        navigate(`/documents/new/${result.templateId}`);
      } else {
        await createTemplate({
          name: trimmedName,
          slug,
          documentType,
          description,
          sensitivity: "standard",
          requiredCredits,
          supportedFormats,
          schema,
          configuration,
        });
        toast.success("Template created");
        navigate(backTo);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the template");
    } finally {
      confirmedDesignSave.current = false;
      setSaving(false);
    }
  };

  if (editing && existing === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title={isOwn ? "Document editor" : "Template editor"} description="Loading…" />
        <div className="grid gap-5 lg:grid-cols-[320px_1fr_320px]">
          <Skeleton className="h-[560px]" />
          <Skeleton className="h-[560px]" />
          <Skeleton className="h-[560px]" />
        </div>
      </div>
    );
  }

  if (editing && existing === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isOwn ? "Document not found" : "Template not found"}
          description="It may have been deleted, or it belongs to someone else."
        />
        <Button asChild variant="outline">
          <Link to={backTo} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </div>
    );
  }

  const headerTitle = editing
    ? `Edit — ${existing?.name ?? ""}`
    : isOwn
      ? "New document"
      : "New document template";
  const headerDescription = isOwn
    ? "Design your own document from scratch: arrange the layout, define the fields you want to fill in later, then save. Your documents are issued under your organization name."
    : "Design the layout visually, define the dynamic form, then publish. Saving an existing template creates a new immutable version.";

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={backTo} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {isOwn ? "Documents" : "Templates"}
              </Link>
            </Button>
            <Button onClick={onSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing
                ? isOwn
                  ? "Save version"
                  : "Publish version"
                : isOwn
                  ? "Create document"
                  : "Create template"}
            </Button>
          </>
        }
      />

      {issues.length > 0 && (
        <div className="space-y-1 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> {issues.length} layout issue
            {issues.length === 1 ? "" : "s"}
          </p>
          <ul className="ml-5 list-disc space-y-0.5 text-[11px] text-destructive/85">
            {issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                <span className="font-mono">{issue.field}</span> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwn && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3">
          <Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-relaxed text-primary">
              Designing or updating this document costs <strong>{designPrice.points.toLocaleString()} points</strong> per save. The amount is configured by an administrator under Pricing.
            </p>
            {typeof pointsBalance === "number" && (
              <p className="mt-1 text-[11px] text-primary/75">
                Your balance: <strong>{pointsBalance.toLocaleString()} points</strong>
              </p>
            )}
          </div>
          {typeof pointsBalance === "number" && pointsBalance < designPrice.points && (
            <Button asChild size="sm" variant="outline" className="h-9 shrink-0 border-primary/30 text-primary hover:bg-primary/10">
              <Link to="/buy-points">Buy points</Link>
            </Button>
          )}
        </div>
      )}

      {isOwn && existing?.artworkUrl && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3">
          <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-[11px] leading-relaxed text-primary">
            Your uploaded file is the page background and is never stored inside the layout. Add text, badges, QR
            codes or images from the toolbar and drag them onto the blanks.
          </p>
        </div>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        {/* ── Left: settings + fields ──
            On phones the canvas leads: it is the workspace, and the settings
            form is long enough that starting there buries it. */}
        <div className="order-3 min-w-0 space-y-4 lg:order-1">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Template settings
            </p>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-sm sm:h-9" placeholder="Invoice" />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug</Label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                disabled={editing}
                className="h-11 font-mono text-xs sm:h-9"
                placeholder="invoice"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</Label>
              <select
                aria-label="Category"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className={selectClass}
              >
                {categoryOptions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">{category.description}</p>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs"
                placeholder="What this template produces"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</Label>
                <Input
                  type="number"
                  min={0}
                  value={requiredCredits}
                  onChange={(e) => setRequiredCredits(Math.max(0, Number(e.target.value) || 0))}
                  className="h-11 text-xs sm:h-9"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sensitivity</Label>
                <div className="flex h-11 items-center rounded-md border border-border bg-muted/40 px-2.5 text-[11px] font-medium text-muted-foreground sm:h-9">
                  Standard
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4">
              <label className="flex min-h-11 items-center gap-2 text-[11px] text-muted-foreground sm:min-h-0">
                <input
                  type="checkbox"
                  checked={formats.png}
                  onChange={(e) => setFormats((f) => ({ ...f, png: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                PNG
              </label>
              <label className="flex min-h-11 items-center gap-2 text-[11px] text-muted-foreground sm:min-h-0">
                <input
                  type="checkbox"
                  checked={formats.pdf}
                  onChange={(e) => setFormats((f) => ({ ...f, pdf: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                PDF
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <SchemaFieldEditor schema={schema} onChange={(next) => setFields(next.fields)} />
          </div>
        </div>

        {/* ── Centre: canvas ── */}
        <div className="order-1 min-w-0 space-y-3 lg:order-2">
          <div className="grid min-w-0 grid-cols-4 gap-2 rounded-xl border border-border bg-card p-2 shadow-sm sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
            {ELEMENT_KINDS.map((kind) => {
              const Icon = ELEMENT_ICONS[kind];
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  className="h-11 min-w-0 gap-1.5 px-1 text-[9px] sm:h-8 sm:px-2 sm:text-[11px]"
                  onClick={() => addElement(kind)}
                  title={`Add ${ELEMENT_LABELS[kind].toLowerCase()}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{ELEMENT_LABELS[kind]}</span>
                </Button>
              );
            })}

            <div className="col-span-4 grid min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:items-center sm:gap-1">
              <Button
                size="sm"
                variant={mode === "layout" ? "default" : "outline"}
                className="h-11 min-w-0 gap-1.5 px-2 text-[11px] sm:h-8 sm:flex-none sm:px-2"
                onClick={() => setMode("layout")}
              >
                <MousePointerSquareDashed className="h-3.5 w-3.5" /> Layout
              </Button>
              <Button
                size="sm"
                variant={mode === "preview" ? "default" : "outline"}
                className="h-11 min-w-0 gap-1.5 px-2 text-[11px] sm:h-8 sm:flex-none sm:px-2"
                onClick={() => setMode("preview")}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
              <Button
                size="icon"
                variant={showGrid ? "default" : "outline"}
                className="h-11 w-full min-w-0 sm:h-8 sm:w-8"
                title="Toggle grid"
                onClick={() => setShowGrid((v) => !v)}
              >
                <Grid3x3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={snapToGrid ? "default" : "outline"}
                className="h-11 min-w-0 px-2 text-[11px] sm:h-8 sm:flex-none"
                onClick={() => setSnapToGrid((v) => !v)}
                title="Snap to a 4px grid"
              >
                <Wand2 className="h-3.5 w-3.5" /> Snap
              </Button>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted/30 p-2 shadow-sm sm:p-4">
            {page ? (
              mode === "layout" ? (
                <ElementCanvas
                  page={canvasPage ?? page}
                  schema={schema}
                  values={values}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                  onChange={setElements}
                  showGrid={showGrid}
                  snapToGrid={snapToGrid}
                />
              ) : (
                <DocumentPreview
                  configuration={{ renderScale, pages: [canvasPage ?? page] }}
                  schema={schema}
                  values={values}
                />
              )
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No page to show.</p>
            )}
          </div>

          {/* Page controls */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</span>
            {pages.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setActivePage(i);
                  setSelectedIndex(null);
                }}
                className={cn(
                  "min-h-11 rounded-md border px-3 py-2 text-[11px] font-medium transition-colors sm:min-h-0 sm:px-2 sm:py-1",
                  i === activePage
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {i + 1} · {p.width}×{p.height}
              </button>
            ))}
            <Button size="sm" variant="outline" className="h-11 gap-1 px-3 text-xs sm:h-7 sm:px-2 sm:text-[11px]" onClick={addPage}>
              <Plus className="h-3 w-3" /> Page
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-11 gap-1 px-3 text-xs text-destructive sm:h-7 sm:px-2 sm:text-[11px]"
              onClick={() => removePage(activePage)}
            >
              <Trash2 className="h-3 w-3" /> Remove
            </Button>

            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <select
                aria-label="Page size preset"
                value=""
                onChange={(e) => {
                  const preset = PAGE_PRESETS.find((p) => p.label === e.target.value);
                  if (preset) updatePage({ width: preset.width, height: preset.height });
                }}
                className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px] sm:h-7 sm:flex-none sm:px-1.5"
              >
                <option value="">Preset…</option>
                {PAGE_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label} ({p.width}×{p.height})
                  </option>
                ))}
              </select>
              <Input
                type="color"
                aria-label="Page background"
                value={page?.background ?? "#ffffff"}
                onChange={(e) => updatePage({ background: e.target.value })}
                className="h-11 w-12 cursor-pointer p-0.5 sm:h-7 sm:w-10"
              />
              <select
                aria-label="Render scale"
                value={String(renderScale)}
                onChange={(e) => setRenderScale(Number(e.target.value))}
                className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px] sm:h-7 sm:flex-none sm:px-1.5"
              >
                {[1, 2, 3].map((s) => (
                  <option key={s} value={s}>
                    {s}× export
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Right: inspector ── */}
        <div className="order-2 min-w-0 xl:order-3 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Inspector
            </p>
            {selectedIndex !== null && elements[selectedIndex] ? (
              <ElementInspector
                element={elements[selectedIndex]}
                index={selectedIndex}
                total={elements.length}
                schema={schema}
                onChange={(next) => updateElement(selectedIndex, next)}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
                onReorder={reorderSelected}
              />
            ) : (
              <div className="space-y-3 py-4 text-center">
                <Layers className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Select an element on the canvas to edit its geometry, styling and binding — or add one from the
                  toolbar above.
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                  Shortcuts: arrows nudge · shift+arrows ×10 · ⌘D duplicate · ⌫ delete
                </p>
              </div>
            )}
          </div>

          {selectedIndex === null && elements.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Layers ({elements.length})
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {[...elements].reverse().map((el, reverseIndex) => {
                  const actualIndex = elements.length - 1 - reverseIndex;
                  return (
                    <button
                      key={actualIndex}
                      type="button"
                      onClick={() => setSelectedIndex(actualIndex)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                    >
                      <span className="truncate capitalize text-foreground">
                        {actualIndex + 1}. {el.kind}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {"bind" in el && el.bind ? el.bind : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDesignSave} onOpenChange={(open) => {
        if (!open) {
          confirmedDesignSave.current = false;
          setConfirmDesignSave(false);
        }
      }}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {editing ? "save" : "design"}</AlertDialogTitle>
            <AlertDialogDescription>
              {editing
                ? "This will save a new version of your document."
                : "This will create your document and make it available in Documents."}{" "}
              Your balance will be charged when the save succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {designPrice.points.toLocaleString()} points
              </p>
              <p className="text-xs text-muted-foreground">
                Design fee for this save · charged once
              </p>
            </div>
          </div>

          {balanceLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your balance before saving…
            </div>
          )}

          {pointsBalance === null && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-xs text-destructive">
              We couldn’t load your points balance. Refresh the page or sign in again before saving.
            </div>
          )}

          {typeof pointsBalance === "number" && !canAffordDesign && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-xs text-destructive">
              You need {designPrice.points.toLocaleString()} points to save this design. Your current balance is {pointsBalance.toLocaleString()} points.
              <Button
                asChild
                size="sm"
                variant="outline"
                className="mt-2 h-9 w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDesignSave(false)}
              >
                <Link to="/buy-points">Buy points</Link>
              </Button>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || typeof pointsBalance !== "number" || !canAffordDesign}
              onClick={() => {
                confirmedDesignSave.current = true;
                setConfirmDesignSave(false);
                void onSave();
              }}
            >
              {saving
                ? "Saving…"
                : balanceLoading
                  ? "Checking balance…"
                  : pointsBalance === null
                    ? "Balance unavailable"
                    : `Confirm · use ${designPrice.points.toLocaleString()} pts`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Choose the most sensible field to bind a freshly added element to. */
function pickBind(kind: ElementKind, fields: FieldDef[]): string {
  if (fields.length === 0) return "";
  if (kind === "image") {
    const image = fields.find((f) => f.type === "image");
    if (image) return image.id;
  }
  if (kind === "badge") {
    const status = fields.find((f) => f.type === "status") ?? fields.find((f) => f.type === "select");
    if (status) return status.id;
  }
  if (kind === "qr" || kind === "barcode") {
    const ref = fields.find((f) => f.type === "reference");
    if (ref) return ref.id;
  }
  if (kind === "text") {
    return fields[0].id;
  }
  return fields[0].id;
}
