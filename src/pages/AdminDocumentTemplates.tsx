import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Archive, CheckCircle2, Coins, FileStack, Layers, PauseCircle, Pencil, Plus, Share2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/components/documents/ui";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "secondary",
  disabled: "outline",
  archived: "destructive",
};

/** Admin: manage the platform template catalogue and see document usage. */
export default function AdminDocumentTemplates() {
  const templates = useQuery(api.docTemplates.adminListTemplates);
  const stats = useQuery(api.docTemplates.adminDocumentStats);
  const setStatus = useMutation(api.docTemplates.adminSetTemplateStatus);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Document Templates</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Platform catalogue for SoftBaker document generation. Build layouts visually, publish immutable versions,
            and control what customers can generate.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link to="/admin/document-templates/new">
            <Plus className="h-4 w-4" /> New template
          </Link>
        </Button>
      </div>

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
              No templates yet — they install automatically when the first user opens Documents.
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
                    {template.sensitivity === "sensitive" && (
                      <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                        demo
                      </Badge>
                    )}
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
                  {doc.category} · {doc.status} · {doc.pointsCost} pts · {formatDateTime(doc.createdAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
