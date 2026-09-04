import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function AdminDocuments() {
  const docs = useQuery(api.documents.adminList, {});
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Document Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">View all generated documents.</p>
        </div>
      </div>
      <div className="space-y-3">
        {!docs ? <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Loading...</p> : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No documents.</p>
        ) : docs.map((d) => (
          <Card key={d._id} className="notebook-card"><CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm font-medium text-[var(--nb-ink)]">{d.title}</p><p className="text-xs text-muted-foreground capitalize">{d.type} • {d.pointsCost} pts</p></div>
            <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</span>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
