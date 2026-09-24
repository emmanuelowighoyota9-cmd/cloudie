import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { CloudUpload, FileText, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { formatBytes, uploadArtifact } from "@/lib/renderClient";

/** Policy mirrors the server: PDFs up to 25 MB, images up to 8 MB. */
const PDF_LIMIT = 25 * 1024 * 1024;
const IMAGE_LIMIT = 8 * 1024 * 1024;
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

function isAccepted(file: File): boolean {
  return ACCEPT.split(",").includes(file.type);
}

function limitFor(file: File): number {
  return file.type === "application/pdf" ? PDF_LIMIT : IMAGE_LIMIT;
}

function titleFromFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "Document";
  const pretty = base.replace(/\.[a-z0-9]{1,6}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (pretty || "Document").slice(0, 120);
}

interface PendingFile {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  message?: string;
}

/**
 * "Add your own document" — bring files you already have into the workspace.
 *
 * Bytes go straight to storage, then the server records the document through
 * the shared storage policy. Uploaded files are always clean output.
 */
export default function DocumentUploadDialog({ className }: { className?: string }) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const createDocument = useMutation(api.uploadedDocuments.create);

  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      if (!isAccepted(file)) {
        toast.error(`${file.name} is not a supported type — upload a PDF or an image`);
        continue;
      }
      if (file.size > limitFor(file)) {
        toast.error(`${file.name} is larger than ${Math.round(limitFor(file) / 1024 / 1024)} MB`);
        continue;
      }
      next.push({ file, status: "queued" });
    }
    if (next.length === 0) return;
    setQueue((prev) => {
      const merged = [...prev, ...next];
      if (merged.length === 1) setTitle(titleFromFileName(merged[0].file.name));
      return merged;
    });
  };

  const reset = () => {
    setQueue([]);
    setTitle("");
    setBusy(false);
    setDragging(false);
  };

  const onUpload = async () => {
    if (queue.length === 0) return;
    setBusy(true);
    let uploaded = 0;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === "done") {
        uploaded += 1;
        continue;
      }
      setQueue((prev) => prev.map((row, index) => (index === i ? { ...row, status: "uploading" } : row)));
      try {
        const uploadUrl = await generateUploadUrl({});
        const storageId = await uploadArtifact(uploadUrl, item.file);
        await createDocument({
          storageId: storageId as Id<"_storage">,
          fileName: item.file.name,
          title: queue.length === 1 ? title.trim() || undefined : undefined,
        });
        uploaded += 1;
        setQueue((prev) => prev.map((row, index) => (index === i ? { ...row, status: "done" } : row)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        setQueue((prev) => prev.map((row, index) => (index === i ? { ...row, status: "error", message } : row)));
      }
    }
    setBusy(false);
    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "Document added to your workspace" : `${uploaded} documents added`);
      setOpen(false);
      reset();
    }
  };

  return (
    <>
      <Button variant="outline" className={cn("gap-1.5", className)} onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Upload document
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add your own document</DialogTitle>
            <DialogDescription>
              Upload a PDF or an image you already have — a contract, an invoice, a scan. It lands in your workspace
              exactly as-is, with no watermark.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <CloudUpload className={cn("h-7 w-7", dragging ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-medium text-foreground">Drop files here or browse</span>
              <span className="text-[11px] text-muted-foreground">
                PDF (25 MB) · PNG, JPEG, WebP, GIF (8 MB) · up to 10 at a time
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {queue.length > 0 && (
              <div className="space-y-2">
                {queue.length === 1 && (
                  <div className="space-y-1">
                    <Label htmlFor="upload-title" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id="upload-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={120}
                      className="h-11 sm:h-9"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  {queue.map((row, index) => (
                    <div
                      key={`${row.file.name}-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      {row.file.type === "application/pdf" ? (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{row.file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatBytes(row.file.size)}
                          {row.message ? ` · ${row.message}` : ""}
                        </p>
                      </div>
                      {row.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                      {row.status === "done" && <span className="text-[10px] font-semibold text-primary">added</span>}
                      {row.status === "error" && <span className="text-[10px] font-semibold text-destructive">failed</span>}
                      {row.status === "queued" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setQueue((prev) => prev.filter((_, i) => i !== index))}
                          className="text-[10px] font-medium text-muted-foreground hover:text-destructive"
                        >
                          remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onUpload} disabled={busy || queue.length === 0} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "Uploading…" : queue.length > 1 ? `Add ${queue.length} documents` : "Add document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
