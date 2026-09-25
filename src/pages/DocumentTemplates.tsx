import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  FileStack,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATEGORIES, svgToDataUrl } from "@/lib/docTemplateEngine";
import { EmptyBlock, PageHeader } from "@/components/documents/ui";

/** Template library: browse, filter and open a template in the builder. */
export default function DocumentTemplates() {
  const [params, setParams] = useSearchParams();
  const activeCategory = params.get("category") ?? "";
  const [search, setSearch] = useState("");

  const templates = useQuery(api.docTemplates.listTemplates, {
    documentType: activeCategory || undefined,
    search: search.trim() || undefined,
    limit: 60,
  });
  const mine = useQuery(api.docTemplates.listMyTemplates, {});

  const categories = useMemo(() => CATEGORIES.filter((c) => c.enabledByDefault), []);

  const setCategory = (key: string) => {
    const next = new URLSearchParams(params);
    if (key) next.set("category", key);
    else next.delete("category");
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template library"
        description="Every template is schema-driven: fill the dynamic form, watch the preview update live, then generate a PNG and a PDF."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/documents" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Documents
              </Link>
            </Button>
            <Button asChild>
              <Link to="/documents/generate" className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Brief generator
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="h-11 pl-9 sm:h-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={cn(
              "min-h-11 rounded-full border px-4 text-xs font-medium transition-colors sm:min-h-0 sm:px-3 sm:py-1.5",
              activeCategory === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-xs font-medium transition-colors sm:min-h-0 sm:px-3 sm:py-1.5",
                activeCategory === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {activeCategory === "" && search.trim() === "" && mine !== undefined && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Your own documents</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                clean output
              </span>
            </div>
            <Link to="/documents/own/new" className="text-xs font-medium text-primary hover:underline">
              Design a document
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Link
              to="/documents/own/new"
              className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] p-4 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">New clean document</p>
                <p className="text-[11px] text-muted-foreground">
                  Your own layout, issued under your organization name.
                </p>
              </div>
            </Link>
            {mine.map((template) => (
              <div
                key={template._id}
                className="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {template.categoryLabel} · {template.fieldCount} fields · {template.requiredCredits} pts
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 sm:flex-none" asChild>
                  <Link to={`/documents/own/${template._id}`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Link>
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5 sm:flex-none" asChild>
                    <Link to={`/documents/new/${template._id}`}>
                      <Sparkles className="h-3.5 w-3.5" /> Use
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {templates === undefined ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyBlock
          title="No templates match"
          message="Try a different category or clear your search. Starter templates load automatically the first time you open Documents."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template, index) => (
            <motion.div
              key={template._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
            >
              <Link
                to={`/documents/new/${template._id}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-border bg-muted/40 p-3">
                  <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:12px_12px]" />
                  {template.previewSvg ? (
                    <img
                      src={svgToDataUrl(template.previewSvg)}
                      alt={`${template.name} preview`}
                      loading="lazy"
                      className="relative max-h-full w-auto max-w-full rounded-md shadow-sm transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <FileStack className="h-8 w-8 text-muted-foreground" />
                  )}

                </div>

                <div className="flex flex-1 flex-col p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {template.categoryLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{template.name}</p>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileStack className="h-3 w-3" /> {template.fieldCount} fields
                      </span>
                      <span className="flex items-center gap-1">
                        <Coins className="h-3 w-3" /> {template.requiredCredits} pts
                      </span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
