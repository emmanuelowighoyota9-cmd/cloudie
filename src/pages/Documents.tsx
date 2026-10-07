import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Search,
  FilePlus2,
  Coins,
  FileStack,
  HardDrive,
  LayoutGrid,
  Link2,
  Pencil,
  Plus,
  Share2,
  ShieldCheck,
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
 * Cloudie workspace overview.
 *
 * Everything here is a live Convex subscription — creating or generating a
 * document anywhere in the app updates these numbers without a refresh.
 */
export default function Documents() {
  const stats = useQuery(api.docTemplates.getStudioStats);
  const categories = useQuery(api.docTemplates.listCategories);
  const recent = useQuery(api.docTemplates.listMyDocuments, { limit: 8 });
  const mine = useQuery(api.docTemplates.listMyTemplates, {});
  const ensureStarterTemplates = useMutation(api.docTemplates.ensureStarterTemplates);
  const seeded = useRef(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "completed" | "shared">("all");

  const filteredRecent = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (recent ?? []).filter((doc) => {
      const statusOk = statusFilter === "all" || doc.status === statusFilter;
      const searchOk = !q || doc.title.toLowerCase().includes(q) || (doc.category ?? "").toLowerCase().includes(q);
      return statusOk && searchOk;
    });
  }, [recent, search, statusFilter]);

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
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Documents"
        description="Cloudie turns dynamic templates into print-ready PNG and PDF documents — with live preview, storage and share links."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/documents/generate" className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Brief generator
              </Link>
            </Button>
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

      <section className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-[#1e6091] via-[#2563eb] to-[#3b82f6] p-5 text-white shadow-[0_28px_60px_-38px_rgba(37,99,235,.55)] sm:rounded-3xl sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-100"><Sparkles className="size-4" /> Cloudie document studio</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Create, manage and share documents</h2>
            <p className="mt-2 text-sm leading-6 text-blue-50 sm:text-base">Start from a professional template, build your own layout, or turn a short brief into a ready-to-edit document.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-white text-[#1e6091] hover:bg-blue-50" asChild><Link to="/documents/templates"><FilePlus2 className="mr-2 size-4" /> Create document</Link></Button>
            <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" asChild><Link to="/documents/generate"><Sparkles className="mr-2 size-4" /> Generate from brief</Link></Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Documents" value={stats.documents} icon={<FileStack className="h-4 w-4" />} index={0} />
        <StatCard label="Generated" value={stats.generated} icon={<Sparkles className="h-4 w-4" />} index={1} />
        <StatCard label="Drafts" value={stats.drafts} icon={<Pencil className="h-4 w-4" />} index={3} />
        <StatCard label="Templates" value={stats.templates} icon={<LayoutGrid className="h-4 w-4" />} index={4} />
        <StatCard label="Shared" value={stats.shared} icon={<Share2 className="h-4 w-4" />} index={5} />
        <StatCard
          label="Credits used"
          value={stats.credits.toLocaleString()}
          hint="points spent rendering"
          icon={<Coins className="h-4 w-4" />}
          index={6}
        />
        <StatCard
          label="Storage"
          value={formatBytes(stats.storageBytes)}
          icon={<HardDrive className="h-4 w-4" />}
          index={7}
        />
        <StatCard
          label="Points balance"
          value={stats.balance.toLocaleString()}
          hint={stats.balance < 40 ? "Top up to keep generating" : undefined}
          icon={<Coins className="h-4 w-4" />}
          accent
          index={8}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Your own documents"
          action={
            <Link to="/documents/own/new" className="text-xs font-medium text-primary hover:underline">
              Design a document
            </Link>
          }
        />
        {mine === undefined ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              to="/documents/own/new"
              className="interactive-card group flex h-full flex-col justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-foreground">New clean document</p>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Design your own layout from scratch. It is issued under your organization
                name.
              </p>
              <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> Clean output
              </span>
            </Link>

            {mine.map((template, index) => (
              <motion.div
                key={template._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04 }}
                className="flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      clean
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {template.categoryLabel} · {template.fieldCount} fields · {template.pageCount} page
                    {template.pageCount === 1 ? "" : "s"} · {template.requiredCredits} pts
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 gap-1.5" asChild>
                    <Link to={`/documents/new/${template._id}`}>
                      <Sparkles className="h-3.5 w-3.5" /> Generate
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" asChild>
                    <Link to={`/documents/own/${template._id}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

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
                className="interactive-card group flex h-full items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{category.label}</p>

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
        <SectionHeader title="Recent documents" action={<Link to="/documents/templates" className="text-xs font-medium text-primary hover:underline">Browse templates</Link>} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your documents…" className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {([["all","All"],["draft","Drafts"],["completed","Generated"],["shared","Shared"]] as const).map(([key,label]) => <button key={key} type="button" onClick={() => setStatusFilter(key)} className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition-colors", statusFilter === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}>{label}</button>)}
          </div>
        </div>
        {recent === undefined ? (
          <Skeleton className="h-40" />
        ) : filteredRecent.length === 0 ? (
          <EmptyBlock
            title="No documents yet"
            message={search || statusFilter !== "all" ? "No documents match your current search or filter." : "Pick a template and fill in the dynamic form — your generated PNG and PDF will appear here."}
            action={
              <Button asChild size="sm">
                <Link to="/documents/templates">Browse templates</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {filteredRecent.map((doc, index) => (
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
                    {formatDateTime(doc.createdAt)} · {doc.renderPrice ?? doc.pointsCost} pts
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
