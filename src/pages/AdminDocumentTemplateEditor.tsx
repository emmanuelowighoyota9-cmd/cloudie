import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Barcode,
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
import { ElementCanvas } from "@/components/documents/ElementCanvas";
import { ElementInspector } from "@/components/documents/ElementInspector";
import { SchemaFieldEditor } from "@/components/documents/SchemaFieldEditor";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { PageHeader } from "@/components/documents/ui";

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
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary";

/**
 * Visual document-template editor.
 *
 * Arranges the exact `LayoutElement` structure the renderer consumes, so the
 * canvas, the live preview and the exported PNG/PDF are all the same document.
 */
export default function AdminDocumentTemplateEditor() {
  const { templateId } = useParams<{ templateId?: string }>();
  const editing = Boolean(templateId);
  const navigate = useNavigate();

  const existing = useQuery(
    api.docTemplates.adminGetTemplate,
    templateId ? { templateId: templateId as Id<"documentTemplates"> } : "skip",
  );
  const createTemplate = useMutation(api.docTemplates.adminCreateTemplate);
  const publishVersion = useMutation(api.docTemplates.adminPublishTemplateVersion);

  const blank = useMemo(() => blankTemplateDraft(), []);

  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [documentType, setDocumentType] = useState<string>("corporate");
  const [description, setDescription] = useState("");
  const [sensitivity, setSensitivity] = useState<"standard" | "sensitive">("standard");
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
    setSensitivity(existing.sensitivity === "sensitive" ? "sensitive" : "standard");
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
  const categoryIsSensitive = category.sensitive;
  const effectiveSensitivity = categoryIsSensitive ? "sensitive" : sensitivity;

  const schema = useMemo(() => ({ fields }), [fields]);
  const configuration = useMemo(() => ({ renderScale, pages }), [renderScale, pages]);
  // Samples rather than empty defaults: a layout can only be judged against
  // realistic content, and empty values render nothing at all.
  const values = useMemo(() => previewValues(schema), [schema]);

  const page = pages[activePage];
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

    setSaving(true);
    try {
      if (editing && templateId) {
        const result = await publishVersion({
          templateId: templateId as Id<"documentTemplates">,
          schema,
          configuration,
          requiredCredits,
          sensitivity: effectiveSensitivity,
        });
        toast.success(`Published version ${result.version}`);
        navigate("/admin/document-templates");
      } else {
        const result = await createTemplate({
          name: trimmedName,
          slug,
          documentType,
          description,
          sensitivity: effectiveSensitivity,
          requiredCredits,
          supportedFormats,
          schema,
          configuration,
        });
        toast.success("Template created");
        navigate("/admin/document-templates");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the template");
    } finally {
      setSaving(false);
    }
  };

  if (editing && existing === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Template editor" description="Loading…" />
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
        <PageHeader title="Template not found" description="It may have been deleted." />
        <Button asChild variant="outline">
          <Link to="/admin/document-templates" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to templates
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={editing ? `Edit — ${existing?.name ?? ""}` : "New document template"}
        description="Design the layout visually, define the dynamic form, then publish. Saving an existing template creates a new immutable version."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/document-templates" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Templates
              </Link>
            </Button>
            <Button onClick={onSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Publish version" : "Create template"}
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

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        {/* ── Left: settings + fields ── */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Template settings
            </p>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" placeholder="Invoice" />
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
                className="h-9 font-mono text-xs"
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
                {CATEGORIES.map((c) => (
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

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</Label>
                <Input
                  type="number"
                  min={0}
                  value={requiredCredits}
                  onChange={(e) => setRequiredCredits(Math.max(0, Number(e.target.value) || 0))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sensitivity</Label>
                <select
                  aria-label="Sensitivity"
                  value={effectiveSensitivity}
                  disabled={categoryIsSensitive}
                  onChange={(e) => setSensitivity(e.target.value as "standard" | "sensitive")}
                  className={cn(selectClass, categoryIsSensitive && "opacity-60")}
                >
                  <option value="standard">Standard</option>
                  <option value="sensitive">Sensitive (watermark)</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {categoryIsSensitive
                ? "This category always renders a non-removable DEMO watermark — sensitive categories cannot be downgraded."
                : "Sensitive templates get a non-removable DEMO watermark on every page."}
            </p>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={formats.png}
                  onChange={(e) => setFormats((f) => ({ ...f, png: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                PNG
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={formats.pdf}
                  onChange={(e) => setFormats((f) => ({ ...f, pdf: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2 shadow-sm">
            {ELEMENT_KINDS.map((kind) => {
              const Icon = ELEMENT_ICONS[kind];
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-2 text-[11px]"
                  onClick={() => addElement(kind)}
                  title={`Add ${ELEMENT_LABELS[kind].toLowerCase()}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {ELEMENT_LABELS[kind]}
                </Button>
              );
            })}

            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant={mode === "layout" ? "default" : "outline"}
                className="h-8 gap-1.5 px-2 text-[11px]"
                onClick={() => setMode("layout")}
              >
                <MousePointerSquareDashed className="h-3.5 w-3.5" /> Layout
              </Button>
              <Button
                size="sm"
                variant={mode === "preview" ? "default" : "outline"}
                className="h-8 gap-1.5 px-2 text-[11px]"
                onClick={() => setMode("preview")}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
              <Button
                size="icon"
                variant={showGrid ? "default" : "outline"}
                className="h-8 w-8"
                title="Toggle grid"
                onClick={() => setShowGrid((v) => !v)}
              >
                <Grid3x3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={snapToGrid ? "default" : "outline"}
                className="h-8 px-2 text-[11px]"
                onClick={() => setSnapToGrid((v) => !v)}
                title="Snap to a 4px grid"
              >
                <Wand2 className="h-3.5 w-3.5" /> Snap
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 shadow-sm">
            {page ? (
              mode === "layout" ? (
                <ElementCanvas
                  page={page}
                  schema={schema}
                  values={values}
                  sensitive={effectiveSensitivity === "sensitive"}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                  onChange={setElements}
                  showGrid={showGrid}
                  snapToGrid={snapToGrid}
                />
              ) : (
                <DocumentPreview
                  configuration={{ renderScale, pages: [page] }}
                  schema={schema}
                  values={values}
                  sensitive={effectiveSensitivity === "sensitive"}
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
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  i === activePage
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {i + 1} · {p.width}×{p.height}
              </button>
            ))}
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={addPage}>
              <Plus className="h-3 w-3" /> Page
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px] text-destructive"
              onClick={() => removePage(activePage)}
            >
              <Trash2 className="h-3 w-3" /> Remove
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                aria-label="Page size preset"
                value=""
                onChange={(e) => {
                  const preset = PAGE_PRESETS.find((p) => p.label === e.target.value);
                  if (preset) updatePage({ width: preset.width, height: preset.height });
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]"
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
                className="h-7 w-10 cursor-pointer p-0.5"
              />
              <select
                aria-label="Render scale"
                value={String(renderScale)}
                onChange={(e) => setRenderScale(Number(e.target.value))}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]"
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
        <div className="xl:sticky xl:top-6 xl:self-start">
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
