import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Archive,
  CheckCircle2,
  Coins,
  Download,
  FileJson,
  FileStack,
  Layers,
  PauseCircle,
  Pencil,
  Plus,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/components/documents/ui";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "secondary",
  disabled: "outline",
  archived: "destructive",
};

/** Admin: manage the platform template catalogue and see document usage. */
export default function AdminDocumentTemplates() {
  const templates = useQuery(api.docTemplateAdmin.adminListTemplates);
  const stats = useQuery(api.docTemplateAdmin.adminDocumentStats);
  const exportRows = useQuery(api.docTemplateAdmin.adminExportTemplates);
  const setStatus = useMutation(api.docTemplateAdmin.adminSetTemplateStatus);
  const bulkImport = useMutation(api.docTemplateAdmin.adminBulkImportTemplates);

  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<unknown[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const change = async (
    templateId: Id<"documentTemplates">,
    status: "active" | "draft" | "disabled" | "archived",
  ) => {
    try {
      await setStatus({ templateId, status });
      toast.success(`Template ${status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the template");
    }
  };

  const parseJson = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setParsed(null);
      setErrors(["Paste JSON or drop a .json file — an array of templates or a single template object."]);
      return;
    }
    try {
      const j = JSON.parse(trimmed);
      const arr = Array.isArray(j) ? j : [j];
      setParsed(arr);
      setErrors([]);
    } catch (e) {
      setParsed(null);
      setErrors([e instanceof Error ? e.message : "Invalid JSON"]);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setPaste(text);
    parseJson(text);
  };

  const onImport = async () => {
    if (!parsed || parsed.length === 0) {
      toast.error("Nothing to import — load a JSON file first");
      return;
    }
    if (parsed.length > 20) {
      toast.error("Import up to 20 templates at a time");
      return;
    }
    setImportBusy(true);
    try {
      const res = await bulkImport({ templates: parsed as never });
      toast.success(
        res.created > 0
          ? `Imported ${res.created} template${res.created === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} skipped` : ""}`
          : `No templates imported — ${res.errors.join("; ").slice(0, 200) || "check slugs and categories"}`,
      );
      if (res.errors.length > 0) setErrors(res.errors);
      if (res.created > 0) {
        setImportOpen(false);
        setPaste("");
        setFileName(null);
        setParsed(null);
        setErrors([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  const onExport = () => {
    if (!exportRows || exportRows.length === 0) {
      toast.error("No templates to export");
      return;
    }
    const blob = new Blob([JSON.stringify(exportRows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cloudie-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(`Exported ${exportRows.length} template${exportRows.length === 1 ? "" : "s"}`);
  };

  const downloadSample = () => {
    const sample = [
      {
        name: "Sample Invoice",
        slug: "sample-invoice",
        documentType: "corporate",
        description: "A minimal invoice template — replace with your layout.",
        requiredCredits: 20,
        supportedFormats: ["png", "pdf"],
        schema: {
          fields: [
            { id: "title", type: "text", label: "Title", default: "Invoice", required: true, maxLength: 60 },
            { id: "reference", type: "reference", label: "Reference", default: "INV-0001", required: true },
          ],
        },
        configuration: {
          renderScale: 2,
          pages: [{ width: 794, height: 1123, background: "#ffffff", elements: [] }],
        },
      },
    ];
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudie-template-sample.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Document Templates</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Platform catalogue for Cloudie document generation. Build layouts visually, publish immutable versions,
            and control what customers can generate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Import JSON
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport} disabled={!exportRows?.length}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button asChild className="gap-1.5">
            <Link to="/admin/document-templates/new">
              <Plus className="h-4 w-4" /> New template
            </Link>
          </Button>
        </div>
      </div>

      {/* Import / export affordance */}
      <Card className="rounded-xl border-dashed border-border bg-muted/20">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileJson className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Upload templates as JSON</p>
              <p className="text-xs text-muted-foreground">
                Import a JSON array (export format) to bulk-create templates. Validated server-side — bad rows are skipped and reported.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadSample}>
              Sample JSON
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Choose file
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Templates", value: templates?.length, icon: Layers },
          { label: "Documents", value: stats?.total, icon: FileStack },
          { label: "Generated", value: stats?.generated, icon: CheckCircle2 },
          { label: "Credits earned", value: stats?.credits, icon: Coins, hint: `${stats?.shared ?? 0} shared` },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
          >
            <Card className="rounded-xl border-border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {item.label}
                  </p>
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-xl font-bold tabular-nums text-foreground">
                  {item.value === undefined ? "—" : item.value.toLocaleString()}
                </p>
                {item.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" /> Template catalogue
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {templates === undefined ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : templates.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No templates yet — import a JSON bundle, create one in the studio, or wait for the starter library to install on first use.
            </p>
          ) : (
            <div>
              {templates.map((template) => (
                <div
                  key={template._id}
                  className="flex flex-col gap-3 border-b border-border p-4 last:border-0 hover:bg-muted/40 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{template.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{template.slug}</p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {template.categoryLabel} · v{template.currentVersion} ·{" "}
                      {template.fieldCount} field{template.fieldCount === 1 ? "" : "s"} ·{" "}
                      {template.pageCount} page{template.pageCount === 1 ? "" : "s"} ·{" "}
                      {template.requiredCredits} pts
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge variant={STATUS_VARIANT[template.status] ?? "secondary"} className="text-[10px]">
                      {template.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                    <Button size="sm" variant="ghost" className="h-10 gap-1 px-2.5 text-[11px] sm:h-7 sm:px-2" asChild>
                      <Link to={`/admin/document-templates/${template._id}/edit`}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    </Button>
                    {template.status !== "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10 gap-1 px-2.5 text-[11px] sm:h-7 sm:px-2"
                        onClick={() => change(template._id, "active")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10 gap-1 px-2.5 text-[11px] sm:h-7 sm:px-2"
                        onClick={() => change(template._id, "disabled")}
                      >
                        <PauseCircle className="h-3.5 w-3.5" /> Disable
                      </Button>
                    )}
                    {template.status !== "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10 gap-1 px-2.5 text-[11px] text-destructive sm:h-7 sm:px-2"
                        onClick={() => change(template._id, "archived")}
                      >
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {stats && stats.byCategory.length > 0 && (
        <Card className="rounded-xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-primary" /> Usage by category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.byCategory.map((row) => (
              <div
                key={row.key}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2"
              >
                <span className="text-xs font-medium text-foreground">{row.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {row.count} document{row.count === 1 ? "" : "s"} · {row.credits} pts
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {stats && stats.recent.length > 0 && (
        <Card className="rounded-xl border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileStack className="h-4 w-4 text-primary" /> Recent documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.recent.map((doc) => (
              <div
                key={doc._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted/50"
              >
                <span className="truncate font-medium text-foreground">{doc.title}</span>
                <span className="text-muted-foreground">
                  {doc.category} · {doc.status} · {doc.renderPrice ?? doc.pointsCost} pts · {formatDateTime(doc.createdAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* JSON import dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) {
            setErrors([]);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" /> Import templates from JSON
            </DialogTitle>
            <DialogDescription>
              Upload a JSON file (array of templates) — the same shape as Export — or paste JSON below. Up to 20 at a time. Server validates every layout and rejects unknown categories; duplicates by slug are skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">JSON file</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void onFile(f);
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Choose .json
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={downloadSample}>
                  <Download className="h-3.5 w-3.5" /> Sample file
                </Button>
                {fileName && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                    {fileName}
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setFileName(null);
                        setPaste("");
                        setParsed(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tplPaste" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Or paste JSON
              </Label>
              <Textarea
                id="tplPaste"
                value={paste}
                onChange={(e) => {
                  setPaste(e.target.value);
                  parseJson(e.target.value);
                }}
                placeholder='[{"name":"Invoice","documentType":"corporate","schema":{"fields":[]},"configuration":{"pages":[]}}]'
                className="min-h-[140px] font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: export once to get the correct shape, then duplicate and edit the JSON. Required: name, documentType, schema, configuration. Optional: slug, description, requiredCredits.
              </p>
            </div>

            {parsed !== null && (
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">
                  Ready to import {parsed.length} template{parsed.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                  {(parsed as Array<Record<string, unknown>>).slice(0, 6).map((t, i) => (
                    <li key={i} className="truncate">
                      {(t.name as string) ?? "Untitled"} · {(t.documentType as string) ?? "—"} · {(t.slug as string) ?? "auto slug"}
                    </li>
                  ))}
                  {parsed.length > 6 && <li className="text-muted-foreground">+{parsed.length - 6} more…</li>}
                </ul>
              </div>
            )}

            {errors.length > 0 && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                <p className="font-medium">Couldn’t import some rows:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {errors.slice(0, 6).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                  {errors.length > 6 && <li>+{errors.length - 6} more…</li>}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importBusy}>
              Cancel
            </Button>
            <Button onClick={onImport} disabled={importBusy || !parsed || parsed.length === 0} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {importBusy ? "Importing…" : parsed ? `Import ${parsed.length} template${parsed.length === 1 ? "" : "s"}` : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
