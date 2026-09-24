import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/documents/ui";
import DocumentTemplateEditor from "@/pages/AdminDocumentTemplateEditor";

/**
 * "Add your own document".
 *
 * The customer-facing designer: build a document from scratch, always clean
 * (no demo watermark). The organization name is read before mounting so the
 * letterhead field starts from the right value.
 */
export default function OwnDocumentTemplate() {
  const org = useQuery(api.organization.getMyOrganization, {});

  if (org === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="New document" description="Loading…" />
        <div className="grid gap-5 lg:grid-cols-[320px_1fr_320px]">
          <Skeleton className="h-[560px]" />
          <Skeleton className="h-[560px]" />
          <Skeleton className="h-[560px]" />
        </div>
      </div>
    );
  }

  return <DocumentTemplateEditor variant="own" organizationName={org.organizationName} />;
}
