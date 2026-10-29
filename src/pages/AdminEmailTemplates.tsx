import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Eye,
  ImagePlus,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminEmpty, AdminPageHeader, AdminSkeleton, ConfirmDialog } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatNgn } from "@/lib/pricing";
import { NeonApiError, neonApi } from "@/lib/neonApi";

// The catalog contract is shared with the API: the same allow-list, sanitiser
// and renderer drive this form and the server-side save.
import {
  TEMPLATE_SERVICE_TYPES,
  TEMPLATE_VARIABLES,
  renderTemplateSample,
  sanitizeEmailHtml,
  templateSurchargeNgn,
  validateEmailTemplate,
  type EmailTemplateProduct,
  type TemplateServiceType,
} from "../../api/src/emailTemplates";

const SERVICE_BADGE: Record<TemplateServiceType, "info" | "danger" | "success" | "warning"> = {
  billing: "info",
  security_alerts: "danger",
  user_onboarding: "success",
  notifications: "warning",
};

type Draft = {
  id?: string;
  title: string;
  serviceType: TemplateServiceType;
  description: string;
  thumbnailUrl: string;
  htmlContent: string;
  priceCredits: string;
  isActive: boolean;
};

function emptyDraft(): Draft {
  return {
    title: "",
    serviceType: "billing",
    description: "",
    thumbnailUrl: "",
    htmlContent: "",
    priceCredits: "0",
    isActive: true,
  };
}

function draftFrom(template: EmailTemplateProduct): Draft {
  return {
    id: template.id,
    title: template.title,
    serviceType: template.serviceType,
    description: template.description,
    thumbnailUrl: template.thumbnailUrl,
    htmlContent: template.htmlContent,
    priceCredits: String(template.priceCredits),
    isActive: template.isActive,
  };
}

/** Downscale an uploaded image to a preview card thumbnail (JPEG data URL). */
async function fileToThumbnail(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose an image under 8 MB.");

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(1, bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot resize images.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    // SVG and some exotic formats cannot be rasterised; a small original is
    // still a valid thumbnail.
    if (file.size > 700 * 1024) throw new Error("That image could not be resized — use a PNG or JPG under 700 KB.");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("The image could not be read."));
      reader.readAsDataURL(file);
    });
  }
}

/* ── Editor dialog ───────────────────────────────────────────────────────── */

function TemplateEditor({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: (template: EmailTemplateProduct, removed: string[]) => void;
}) {
  const [form, setForm] = useState<Draft>(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const htmlFileRef = useRef<HTMLInputElement>(null);

  const variables = TEMPLATE_VARIABLES[form.serviceType];
  const previewHtml = useMemo(
    () => renderTemplateSample(sanitizeEmailHtml(form.htmlContent).html, form.serviceType),
    [form.htmlContent, form.serviceType],
  );

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const element = htmlRef.current;
    const start = element?.selectionStart ?? form.htmlContent.length;
    const end = element?.selectionEnd ?? start;
    const next = form.htmlContent.slice(0, start) + token + form.htmlContent.slice(end);
    setForm((prev) => ({ ...prev, htmlContent: next }));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleThumbnail(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      setField("thumbnailUrl", await fileToThumbnail(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The image could not be read.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleHtmlFile(file: File | null) {
    if (!file) return;
    if (file.size > 200_000) {
      toast.error("That HTML file is over 200 KB.");
      return;
    }
    try {
      setField("htmlContent", await file.text());
    } catch {
      toast.error("The HTML file could not be read.");
    } finally {
      if (htmlFileRef.current) htmlFileRef.current.value = "";
    }
  }

  async function save() {
    if (saving) return;
    const validated = validateEmailTemplate({
      title: form.title,
      serviceType: form.serviceType,
      description: form.description,
      thumbnailUrl: form.thumbnailUrl,
      htmlContent: form.htmlContent,
      priceCredits: form.priceCredits.trim() === "" ? 0 : Number(form.priceCredits),
      isActive: form.isActive,
    });

    if (!validated.ok) {
      setErrors(validated.errors);
      toast.error("Check the highlighted fields before saving.");
      return;
    }
    setErrors({});

    const payload = {
      title: validated.value.title,
      serviceType: validated.value.serviceType,
      description: validated.value.description,
      thumbnailUrl: validated.value.thumbnailUrl,
      htmlContent: validated.value.htmlContent,
      priceCredits: validated.value.priceCredits,
      isActive: validated.value.isActive,
    };

    setSaving(true);
    try {
      const saved = form.id
        ? await neonApi.updateEmailTemplate(form.id, payload)
        : await neonApi.createEmailTemplate(payload);
      onSaved(saved.template, saved.sanitization?.removed ?? []);
    } catch (error) {
      toast.error(
        error instanceof NeonApiError ? error.message : "The template could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-2xl lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            {form.id ? "Edit template" : "New email template"}
          </DialogTitle>
          <DialogDescription>
            Paste an HTML layout, choose its mailing service and set the credits a customer
            pays to use it. Scripts and event handlers are stripped on save.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tpl-title">Title</Label>
                <Input
                  id="tpl-title"
                  placeholder="Modern Invoice Layout v1"
                  value={form.title}
                  maxLength={120}
                  aria-invalid={errors.title ? true : undefined}
                  onChange={(event) => setField("title", event.target.value)}
                />
                {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label>Service type</Label>
                <Select
                  value={form.serviceType}
                  onValueChange={(value) => setField("serviceType", value as TemplateServiceType)}
                >
                  <SelectTrigger className="w-full" aria-invalid={errors.serviceType ? true : undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_SERVICE_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.serviceType ? (
                  <p className="text-xs text-destructive">{errors.serviceType}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-price">Price (credits)</Label>
                <Input
                  id="tpl-price"
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  value={form.priceCredits}
                  aria-invalid={errors.priceCredits ? true : undefined}
                  onChange={(event) => setField("priceCredits", event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  {formatNgn(templateSurchargeNgn(Number(form.priceCredits) || 0))} added per send ·
                  0 = free
                </p>
                {errors.priceCredits ? (
                  <p className="text-xs text-destructive">{errors.priceCredits}</p>
                ) : null}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tpl-description">Description</Label>
                <Textarea
                  id="tpl-description"
                  rows={2}
                  placeholder="Clean tabular invoice with an emerald accent and a payment summary."
                  value={form.description}
                  maxLength={400}
                  onChange={(event) => setField("description", event.target.value)}
                />
                {errors.description ? (
                  <p className="text-xs text-destructive">{errors.description}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Thumbnail</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="https://cdn.example.com/preview.png"
                  value={form.thumbnailUrl.startsWith("data:") ? "" : form.thumbnailUrl}
                  onChange={(event) => setField("thumbnailUrl", event.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  Upload
                </Button>
                {form.thumbnailUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove thumbnail"
                    onClick={() => setField("thumbnailUrl", "")}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleThumbnail(event.target.files?.[0] ?? null)}
              />
              {form.thumbnailUrl ? (
                <img
                  src={form.thumbnailUrl}
                  alt="Template thumbnail preview"
                  className="h-24 w-40 rounded-lg border border-border object-cover"
                />
              ) : null}
              {errors.thumbnailUrl ? (
                <p className="text-xs text-destructive">{errors.thumbnailUrl}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="tpl-html">HTML layout</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {form.htmlContent.length.toLocaleString()} / 200,000 characters
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => htmlFileRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Upload .html
                  </Button>
                </div>
              </div>
              <input
                ref={htmlFileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(event) => void handleHtmlFile(event.target.files?.[0] ?? null)}
              />
              <Textarea
                id="tpl-html"
                ref={htmlRef}
                rows={10}
                spellCheck={false}
                placeholder={'<table role="presentation">… {{customer_name}} …</table>'}
                value={form.htmlContent}
                aria-invalid={errors.htmlContent ? true : undefined}
                onChange={(event) => setField("htmlContent", event.target.value)}
                className="min-h-56 font-mono text-xs leading-relaxed"
              />
              {errors.htmlContent ? (
                <p className="text-xs text-destructive">{errors.htmlContent}</p>
              ) : null}

              <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--label)]">
                  Approved variables
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {variables.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      title={variable.label}
                      onClick={() => insertVariable(variable.key)}
                      className="rounded-full border border-border bg-card px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      {`{{${variable.key}}}`}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Only these tags are allowed for{" "}
                  <span className="font-medium text-foreground">
                    {TEMPLATE_SERVICE_TYPES.find((type) => type.id === form.serviceType)?.label}
                  </span>
                  . Click one to insert it at the cursor.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Available to customers</p>
                  <p className="text-[11px] text-muted-foreground">
                    Inactive templates stay saved but disappear from the mailing modules.
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setField("isActive", checked)}
                  aria-label="Template is active"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--label)]">
                Live preview
              </span>
              <span className="text-[11px] text-muted-foreground">sample data</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
              {form.htmlContent.trim() ? (
                <iframe
                  title="Template preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  className="h-[420px] w-full border-0 bg-white sm:h-[520px]"
                />
              ) : (
                <div className="flex h-[420px] flex-col items-center justify-center gap-2 px-8 text-center sm:h-[520px]">
                  <Eye className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Paste HTML on the left — the rendered email appears here with sample values.
                  </p>
                </div>
              )}
            </div>
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              The saved copy is sanitised: script tags, inline event handlers and script URLs are
              removed before storage and dispatch.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {form.id ? "Save changes" : "Publish template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TemplateServiceType | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<EmailTemplateProduct | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await neonApi.adminEmailTemplates();
      setTemplates(data.templates);
      setError(null);
    } catch (caught) {
      setTemplates(null);
      setError(
        caught instanceof NeonApiError ? caught.message : "The template catalog could not be loaded.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () => (templates ?? []).filter((template) => filter === "all" || template.serviceType === filter),
    [templates, filter],
  );

  async function toggleActive(template: EmailTemplateProduct) {
    setBusyId(template.id);
    try {
      const result = await neonApi.updateEmailTemplate(template.id, { isActive: !template.isActive });
      setTemplates((prev) =>
        (prev ?? []).map((row) => (row.id === template.id ? result.template : row)),
      );
      toast.success(
        result.template.isActive
          ? `“${template.title}” is now available to customers`
          : `“${template.title}” was deactivated`,
      );
    } catch (caught) {
      toast.error(caught instanceof NeonApiError ? caught.message : "The template could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    const target = deleting;
    try {
      await neonApi.deleteEmailTemplate(target.id);
      setTemplates((prev) => (prev ?? []).filter((row) => row.id !== target.id));
      toast.success(`“${target.title}” was deleted`);
    } catch (caught) {
      toast.error(caught instanceof NeonApiError ? caught.message : "The template could not be deleted.");
    }
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Email Template Catalog"
        description="Upload, price and publish HTML layouts for every mailing service. Customers pick an active layout in their composer; the price is added to the send."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" />
              New template
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...TEMPLATE_SERVICE_TYPES.map((type) => type.id)] as const).map((value) => {
          const label =
            value === "all"
              ? "All layouts"
              : TEMPLATE_SERVICE_TYPES.find((type) => type.id === value)?.label ?? value;
          const count =
            value === "all"
              ? templates?.length ?? 0
              : (templates ?? []).filter((template) => template.serviceType === value).length;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : templates === null ? (
        <AdminSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <AdminEmpty
          message="No templates in this service type yet"
          hint="Upload a layout and it appears here, ready to price and publish."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.24) }}
            >
              <Card
                className={cn(
                  "flex h-full flex-col overflow-hidden",
                  !template.isActive && "opacity-75",
                )}
              >
                <div className="relative aspect-[16/9] overflow-hidden border-b border-border bg-surface-2">
                  {template.thumbnailUrl ? (
                    <img
                      src={template.thumbnailUrl}
                      alt={`${template.title} thumbnail`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                      <Mail className="size-7" />
                      <span className="text-[11px] uppercase tracking-[0.14em]">No thumbnail</span>
                    </div>
                  )}
                  <span className="absolute left-2.5 top-2.5">
                    <Badge variant={SERVICE_BADGE[template.serviceType]}>
                      {TEMPLATE_SERVICE_TYPES.find((type) => type.id === template.serviceType)?.label ??
                        template.serviceType}
                    </Badge>
                  </span>
                  <span className="absolute right-2.5 top-2.5">
                    <Badge variant={template.isActive ? "success" : "outline"}>
                      {template.isActive ? "Active" : "Paused"}
                    </Badge>
                  </span>
                </div>

                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {template.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                      {template.description || "No description."}
                    </p>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {template.priceCredits > 0
                        ? `${template.priceCredits} credits`
                        : "Free layout"}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {template.priceCredits > 0
                        ? `+${formatNgn(templateSurchargeNgn(template.priceCredits))}`
                        : "Included"}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={template.isActive}
                        disabled={busyId === template.id}
                        onCheckedChange={() => void toggleActive(template)}
                        aria-label={`Toggle ${template.title}`}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {template.isActive ? "Published" : "Hidden"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${template.title}`}
                        onClick={() => setDraft(draftFrom(template))}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${template.title}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(template)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {draft ? (
        <TemplateEditor
          key={draft.id ?? "new"}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={(template, removed) => {
            setTemplates((prev) => {
              const rows = prev ?? [];
              const exists = rows.some((row) => row.id === template.id);
              return exists
                ? rows.map((row) => (row.id === template.id ? template : row))
                : [template, ...rows];
            });
            setDraft(null);
            toast.success(`“${template.title}” saved`);
            if (removed.length > 0) {
              toast.warning("Executable markup was stripped", {
                description: `Removed: ${removed.join(", ")}`,
              });
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove()}
        title="Delete this template?"
        description="It disappears from every mailing module immediately. Past sends are unaffected."
        resource={deleting?.title}
        actionLabel="Delete template"
        requireReason={false}
      />
    </div>
  );
}
