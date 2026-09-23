import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Coins,
  FileStack,
  HardDrive,
  LayoutGrid,
  Link2,
  Plus,
  Share2,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { categoryDef } from "@/lib/docTemplateEngine";
import { formatBytes } from "@/lib/renderClient";
import {
  EmptyBlock,
  PageHeader,
  SectionHeader,
  StatCard,
  StatusPill,
  formatDateTime,
} from "@/components/documents/ui";

/**
 * SoftBaker workspace overview.
 *
 * Everything here is a live Convex subscription — creating or generating a
 * document anywhere in the app updates these numbers without a refresh.
 */
export default function Documents() {
  const stats = useQuery(api.docTemplates.getStudioStats);
  const categories = useQuery(api.docTemplates.listCategories);
  const recent = useQuery(api.docTemplates.listMyDocuments, { limit: 8 });
  const ensureStarterTemplates = useMutation(api.docTemplates.ensureStarterTemplates);
  const seeded = useRef(false);

  // Install (or upgrade) the platform starter templates once per visit. The
  // mutation is a no-op when the deployment already has the current set.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    ensureStarterTemplates({}).catch(() => undefined);
  }, [ensureStarterTemplates]);

  if (stats === undefined || stats === null || categories === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Documents" description="Generate branded documents from dynamic templates." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Documents"
        description="SoftBaker turns dynamic templates into print-ready PNG and PDF documents — with live preview, storage and share links."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/documents/templates" className="gap-1.5">
                <LayoutGrid className="h-4 w-4" /> Template library
              </Link>
            </Button>
            <Button asChild>
              <Link to="/documents/templates" className="gap-1.5">
                <Plus className="h-4 w-4" /> New document
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Documents" value={stats.documents} icon={<FileStack className="h-4 w-4" />} index={0} />
        <StatCard label="Generated" value={stats.generated} icon={<Sparkles className="h-4 w-4" />} index={1} />
        <StatCard label="Shared" value={stats.shared} icon={<Share2 className="h-4 w-4" />} index={2} />
        <StatCard
          label="Credits used"
          value={stats.credits.toLocaleString()}
          hint="points spent rendering"
          icon={<Coins className="h-4 w-4" />}
          index={3}
        />
        <StatCard
          label="Storage"
          value={formatBytes(stats.storageBytes)}
          icon={<HardDrive className="h-4 w-4" />}
          index={4}
        />
        <StatCard
          label="Points balance"
          value={stats.balance.toLocaleString()}
          hint={stats.balance < 40 ? "Top up to keep generating" : undefined}
          icon={<Coins className="h-4 w-4" />}
          accent
          index={5}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Template categories"
          action={
            <Link to="/documents/templates" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => (
            <motion.div
              key={category.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
            >
              <Link
                to={`/documents/templates?category=${category.key}`}
                className="group flex h-full items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{category.label}</p>
                    {category.sensitive && (
                      <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive">
                        demo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-lg font-bold tabular-nums text-foreground">{category.count}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Recent documents" />
        {recent === undefined ? (
          <Skeleton className="h-40" />
        ) : recent.length === 0 ? (
          <EmptyBlock
            title="No documents yet"
            message="Pick a template and fill in the dynamic form — your generated PNG and PDF will appear here."
            action={
              <Button asChild size="sm">
                <Link to="/documents/templates">Browse templates</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {recent.map((doc, index) => (
              <motion.div
                key={doc._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3",
                  index > 0 && "border-t border-border",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileStack className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/documents/${doc._id}`}
                      className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {doc.title}
                    </Link>
                    <StatusPill status={doc.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {doc.category ? categoryDef(doc.category).label : "General"} · v{doc.templateVersion} ·{" "}
                    {formatDateTime(doc.createdAt)} · {doc.pointsCost} pts
                  </p>
                </div>
                {doc.isPublic && (
                  <span className="hidden items-center gap-1 text-[11px] text-primary sm:flex">
                    <Link2 className="h-3 w-3" /> shared
                  </span>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/documents/${doc._id}`}>Open</Link>
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
