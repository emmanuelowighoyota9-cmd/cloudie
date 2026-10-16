import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { FolderOpen, Upload, File, Image, Download, Trash2, LoaderCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function Assets() {
  const files = useQuery(api.storage.listMyFiles, { limit: 100 });
  const uploadUrl = useMutation(api.storage.generateUploadUrl);
  const registerFile = useMutation(api.storage.registerFile);
  const getFileUrl = useMutation(api.storage.getFileUrl);
  const deleteFile = useMutation(api.storage.deleteFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const totalBytes = (files ?? []).reduce((sum, file) => sum + file.sizeBytes, 0);

  const handleUpload = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of Array.from(selected)) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name}: maximum file size is 25 MB.`);
          continue;
        }
        const kind = file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf_document" : "generic";
        const allowed = kind === "image"
          ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
          : kind === "pdf_document"
            ? ["application/pdf"]
            : ["text/csv", "text/plain", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        if (!allowed.includes(file.type)) {
          toast.error(`${file.name}: this file type is not supported.`);
          continue;
        }
        const url = await uploadUrl({});
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}.`);
        const body = await response.json() as { storageId?: string };
        if (!body.storageId) throw new Error("Storage did not return a file ID.");
        await registerFile({
          storageId: body.storageId as Id<"_storage">,
          kind,
          originalName: file.name,
        });
        uploaded += 1;
      }
      if (uploaded) toast.success(`${uploaded} file${uploaded === 1 ? "" : "s"} uploaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = async (fileId: Id<"storageFiles">) => {
    setBusyFile(fileId);
    try {
      const url = await getFileUrl({ fileId });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open file.");
    } finally {
      setBusyFile(null);
    }
  };

  const handleDelete = async (fileId: Id<"storageFiles">, name: string) => {
    if (!window.confirm(`Delete “${name}”? This permanently removes the stored file.`)) return;
    setBusyFile(fileId);
    try {
      await deleteFile({ fileId });
      toast.success("File deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete file.");
    } finally {
      setBusyFile(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/services"><Button variant="ghost" size="icon" aria-label="Back to services"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Asset Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">Upload, organize, and retrieve files with owner-checked access.</p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2">
          {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="hidden sm:inline">{uploading ? "Uploading…" : "Upload files"}</span><span className="sm:hidden">Upload</span>
        </Button>
        <Input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => void handleUpload(e.target.files)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Stored files</p><p className="mt-2 text-2xl font-bold text-foreground">{files?.length ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Storage used</p><p className="mt-2 text-2xl font-bold text-foreground">{formatBytes(totalBytes)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Per-file limit</p><p className="mt-2 text-2xl font-bold text-foreground">25 MB</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold text-foreground">Your files</h2><p className="text-sm text-muted-foreground">Files are private to your account unless explicitly shared by a supported feature.</p></div>
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2"><Upload className="h-4 w-4" /> Add files</Button>
      </div>

      {files === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((i) => <Card key={i}><CardContent className="p-4"><div className="h-24 animate-pulse rounded bg-muted" /><div className="mt-3 h-4 animate-pulse rounded bg-muted" /></CardContent></Card>)}</div>
      ) : files.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><FolderOpen /></EmptyMedia>
          <EmptyHeader><EmptyTitle>No files yet</EmptyTitle><EmptyDescription>Upload images, PDFs, spreadsheets, documents or text files to keep them in one place.</EmptyDescription></EmptyHeader>
          <Button onClick={() => inputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Upload your first file</Button>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((file) => {
            const isImage = file.mimeType.startsWith("image/");
            const busy = busyFile === file.fileId;
            return (
              <Card key={file.fileId} className="group overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex h-28 items-center justify-center rounded-xl border border-border bg-muted/40">
                    {isImage ? <Image className="h-9 w-9 text-primary" /> : <File className="h-9 w-9 text-muted-foreground" />}
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-foreground" title={file.name}>{file.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{file.mimeType}</p>
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={busy} onClick={() => void handleDownload(file.fileId)}><Download className="h-3.5 w-3.5" /> Open</Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${file.name}`} disabled={busy} onClick={() => void handleDelete(file.fileId, file.name)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
