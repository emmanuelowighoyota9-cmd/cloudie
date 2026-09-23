import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Coins, FileStack, Search, ShieldAlert } from "lucide-react";
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
          <Button variant="outline" asChild>
            <Link to="/documents" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Documents
            </Link>
          </Button>
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
                  {template.isSensitive && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      <ShieldAlert className="h-2.5 w-2.5" /> demo
                    </span>
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
