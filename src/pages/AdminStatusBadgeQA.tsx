import { AdminPageHeader } from "@/components/admin/shared";
import { STATUS_MATRIX, StatusBadge, type StatusDomain } from "@/components/admin/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DOMAINS = Object.keys(STATUS_MATRIX) as StatusDomain[];

export default function AdminStatusBadgeQA() {
  const total = DOMAINS.reduce((count, domain) => count + STATUS_MATRIX[domain].length, 0);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Status badge QA matrix"
        description="Every known status value across the seven supported domains. Check that each pill always includes a color dot and readable text, with an optional contextual icon."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-xl shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Domains</p><p className="mt-1 text-2xl font-semibold">{DOMAINS.length}</p></CardContent></Card>
        <Card className="rounded-xl shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Matrix cases</p><p className="mt-1 text-2xl font-semibold">{total}</p></CardContent></Card>
        <Card className="rounded-xl shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Accessibility rule</p><p className="mt-1 text-sm font-semibold">Dot + text, never color-only</p></CardContent></Card>
      </div>
      <div className="space-y-4">
        {DOMAINS.map((domain) => (
          <Card key={domain} className="rounded-xl shadow-none">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold capitalize">{domain}</h2>
                <Badge variant="outline">{STATUS_MATRIX[domain].length} values</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {STATUS_MATRIX[domain].map((value) => (
                  <div key={value} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <code className="min-w-0 break-all text-xs text-muted-foreground">{value}</code>
                    <StatusBadge domain={domain} value={value} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
