import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Download, FileText, ImageIcon, Search, Trash2, Upload, Files, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, StatusBadge, fmtDate } from "@/components/admin/shared";
import DocumentUploadDialog from "@/components/documents/DocumentUploadDialog";
import { formatBytes } from "@/lib/renderClient";

export default function AdminDocuments() {
  const documents = useQuery(api.documents.adminList, { limit: 300 });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tab, setTab] = useState("generated");

  const [uploadsSearch, setUploadsSearch] = useState("");
  const uploads = useQuery(api.uploadedDocuments.adminListAll, {
    limit: 80,
    search: uploadsSearch.trim() || undefined,
  });
  const adminRemove = useMutation(api.uploadedDocuments.adminRemoveAny);
  const [deleting, setDeleting] = useState<Id<"uploadedDocuments"> | null>(null);
  const [confirmId, setConfirmId] = useState<Id<"uploadedDocuments"> | null>(null);

  const filtered = useMemo(() => {
    if (!documents) return undefined;
    let list = [...documents];
    if (typeFilter !== "all") list = list.filter((d) => d.type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(s) || d.type.includes(s));
    }
    return list;
  }, [documents, search, typeFilter]);

  const onAdminDelete = async (id: Id<"uploadedDocuments">) => {
    setDeleting(id);
    try {
      await adminRemove({ documentId: id });
      toast.success("File removed");
      setConfirmId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the file");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Document Administration"
        description="All generated documents plus every file customers have uploaded — with admin upload and removal."
        actions={
          <div className="flex items-center gap-2">
            <DocumentUploadDialog />
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-9 w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="generated" className="gap-1.5 text-xs sm:text-sm">
            <Sparkles className="h-3.5 w-3.5" /> Generated
          </TabsTrigger>
          <TabsTrigger value="uploads" className="gap-1.5 text-xs sm:text-sm">
            <Files className="h-3.5 w-3.5" /> Uploaded files
            {uploads ? <Badge variant="secondary" className="ml-1 text-[10px]">{uploads.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generated" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search title…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="flight">Flight</SelectItem>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="customs">Customs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered === undefined ? (
            <AdminSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <AdminEmpty message="No documents match." />
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => (
                <div
                  key={d._id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{d.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {d.type} · {d.pointsCost} pts · {fmtDate(d.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status="completed" />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="uploads" className="space-y-4">
          <Card className="rounded-xl border-border">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Customer uploads</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Every PDF and image customers have brought into their workspace. Admins can preview, download or remove any file. Use the Upload button above to add files as admin.
                </p>
              </div>
              <DocumentUploadDialog />
            </CardContent>
          </Card>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={uploadsSearch}
              onChange={(e) => setUploadsSearch(e.target.value)}
              placeholder="Search by title or file name…"
              className="pl-9"
            />
          </div>

          {uploads === undefined ? (
            <AdminSkeleton rows={4} />
          ) : uploads.length === 0 ? (
            <AdminEmpty message={uploadsSearch ? `No uploads match “${uploadsSearch}”.` : "No customer uploads yet — they appear here once someone uses Upload document."} />
          ) : (
            <div className="space-y-2">
              {uploads.map((f) => (
                <Card key={f._id} className="rounded-xl border-border shadow-sm">
                  <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
                      {f.kind === "image" && f.url ? (
                        <img src={f.url} alt={f.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : f.kind === "pdf" ? (
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{f.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {f.fileName} · {f.mimeType} · {formatBytes(f.sizeBytes)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Owner: {f.ownerName || f.ownerEmail || String(f.ownerId).slice(0, 8)} {f.ownerEmail ? `· ${f.ownerEmail}` : ""} · {fmtDate(f.createdAt)}
                      </p>
                      {f.notes ? <p className="truncate text-[11px] italic text-muted-foreground">“{f.notes}”</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {f.kind}
                      </Badge>
                      {f.url && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]" asChild>
                            <a href={f.url} target="_blank" rel="noopener noreferrer">
                              <ImageIcon className="h-3.5 w-3.5" /> Preview
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]" asChild>
                            <a href={f.url} download={f.fileName}>
                              <Download className="h-3.5 w-3.5" /> Download
                            </a>
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 px-2 text-[11px] text-destructive hover:text-destructive"
                        disabled={deleting === f._id}
                        onClick={() => setConfirmId(f._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleting === f._id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Admin upload hint + drop affordance */}
      <Card className="rounded-xl border-dashed border-border bg-muted/20">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Admin uploads</p>
              <p className="text-xs text-muted-foreground">Upload PDFs and images as the admin account — they live in the same library and respect the shared MIME + size policy.</p>
            </div>
          </div>
          <DocumentUploadDialog />
        </CardContent>
      </Card>

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this uploaded file?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the file and its bytes. The owner will lose access immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deleting}
              onClick={(e) => {
                e.preventDefault();
                if (confirmId) void onAdminDelete(confirmId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
