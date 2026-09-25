import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ClipboardCopy,
  FileStack,
  FileWarning,
  FolderOpen,
  HelpCircle,
  Info,
  ListChecks,
  Send,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BRIEF_INTENTS,
  buildStructuredOutput,
  extractValuesForSchema,
  parseDocumentBrief,
  scoreOwnTemplates,
  type BriefCandidate,
  type BriefResult,
  type BriefConfidence,
} from "@/lib/documentBrief";
import { PageHeader } from "@/components/documents/ui";

const EXAMPLES = [
  "Purchase order PO-2026-4471 from Northfold Trading to supplier Meridian Supply Co., required by 2026-10-06, Net 30, 2 x Oak veneer panels 1920.00, 3 x Brushed brass handles 1440.00, total 4824.00 USD.",
  "Packing list ref CRL-88213-7Q for Meridian Supply Co. shipping Rotterdam to Nairobi, 3 packages, gross weight 12.4 kg, contents 24 x Oak veneer panels 6.2 kg.",
  "Remittance advice REM-2026-0338 issued 2026-09-24 by Lakeview Interiors settling beneficiary Northfold Trading, bank transfer, amount 4824.00 USD.",
  "Business letter dated 2026-09-24 from Northfold Trading addressed to Priya Ramanathan, subject: Delivery schedule for the remaining hardware, signed by Amara Cole.",
];

const CONFIDENCE_STYLE: Record<BriefConfidence, { label: string; className: string }> = {
  high: { label: "exact", className: "border-primary/40 bg-primary/10 text-primary" },
  medium: { label: "likely", className: "border-border bg-muted text-muted-foreground" },
  low: { label: "guess", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

/**
 * Document brief generator.
 *
 * Reads a plain-language brief, identifies the matching Crestline business
 * document, extracts the fields it can — including repeatable table rows — and
 * reports what is still needed. Everything runs locally against the platform's
 * own schema: no model call, and no identity or payment artifacts.
 */
export default function DocumentGenerator() {
  const templates = useQuery(api.docTemplates.listTemplates, { limit: 100 });
  const mine = useQuery(api.docTemplates.listMyTemplates, {});
  const ensureStarterTemplates = useMutation(api.docTemplates.ensureStarterTemplates);
  const seeded = useRef(false);
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<BriefResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [ownPick, setOwnPick] = useState<Id<"documentTemplates"> | null>(null);

  const matchedTemplate = useMemo(() => {
    if (!result || result.status !== "matched" || !templates) return null;
    return templates.find((template) => template.slug === result.intent.templateSlug) ?? null;
  }, [result, templates]);

  // The real schema lets the extracted values line up with the builder's field
  // ids, so the brief can be carried straight into the form.
  const templateDetail = useQuery(
    api.docTemplates.getTemplate,
    matchedTemplate ? { templateId: matchedTemplate._id } : "skip",
  );

  const ownDetail = useQuery(
    api.docTemplates.getMyTemplate,
    ownPick ? { templateId: ownPick } : "skip",
  );

  const output = useMemo(() => {
    if (!result || result.status !== "matched") return null;
    return buildStructuredOutput(result, templateDetail?.schema);
  }, [result, templateDetail?.schema]);

  const structuredJson = useMemo(() => {
    if (!output) return "";
    return JSON.stringify(output, null, 2);
  }, [output]);

  /** Owner-authored layouts whose name or description matches the brief. */
  const ownMatches = useMemo(() => {
    if (!mine || brief.trim().length < 4) return [];
    return scoreOwnTemplates(brief, mine);
  }, [mine, brief]);

  const ownExtraction = useMemo(() => {
    if (!ownDetail || !ownPick) return null;
    return extractValuesForSchema(brief, ownDetail.schema);
  }, [ownDetail, ownPick, brief]);

  // Install (or upgrade) the platform starter set so a brand-new deployment can
  // resolve a brief straight from this page. No-op once the set is current.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    ensureStarterTemplates({}).catch(() => undefined);
  }, [ensureStarterTemplates]);

  const ownJson = useMemo(() => {
    if (!ownDetail || !ownExtraction) return "";
    return JSON.stringify(
      {
        documentType: ownDetail.documentType,
        template: ownDetail.name,
        templateId: ownDetail._id,
        values: ownExtraction.values,
        missingFields: ownExtraction.missing.map((entry) => entry.label),
      },
      null,
      2,
    );
  }, [ownDetail, ownExtraction]);

  const runParse = (intentKey?: string) => {
    const parsed = parseDocumentBrief(brief, intentKey);
    setResult(parsed);
    setOwnPick(null);
    setCopied(false);
    if (parsed.status === "matched") toast.success(`Matched ${parsed.intent.label}`);
    else if (parsed.status === "ambiguous") toast.message("Which document do you need?");
    else if (parsed.status === "blocked") toast.error("Unsupported document type");
    else if (parsed.status === "unsupported") toast.message("No supported match yet");
  };

  const onCopy = async (payload: string) => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success("Structured output copied");
    } catch {
      toast.error("Could not copy — select the text manually");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brief generator"
        description="Describe the document you need. Crestline identifies the matching template, extracts the fields it can and shows what is still missing."
        actions={
          <Button variant="outline" asChild>
            <Link to="/documents/templates" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Template library
            </Link>
          </Button>
        }
      />

      <div className="grid min-w-0 gap-5 lg:grid-cols-5">
        <section className="min-w-0 space-y-3 lg:col-span-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <label htmlFor="brief" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Your brief
            </label>
            <Textarea
              id="brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Example: Purchase order PO-2026-4471 from Northfold Trading to supplier Meridian Supply Co., required by 2026-10-06, Net 30, 2 x Oak veneer panels 1920.00, total 4824.00 USD."
              rows={7}
              className="mt-3 min-h-[160px] resize-y text-sm"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => runParse()}
                disabled={brief.trim().length === 0}
                className="min-h-11 gap-1.5 sm:min-h-9"
              >
                <Wand2 className="h-4 w-4" /> Structure document
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setBrief("");
                  setResult(null);
                  setOwnPick(null);
                }}
                className="min-h-11 sm:min-h-9"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setBrief(example)}
                className="min-h-11 rounded-full border border-border px-4 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted sm:min-h-0 sm:max-w-[320px] sm:px-3 sm:py-1.5"
              >
                {example.slice(0, 82)}…
              </button>
            ))}
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Supported: {BRIEF_INTENTS.map((intent) => intent.label).join(" · ")}. Crestline declines identity documents,
            government credentials, payment confirmations, bank instruments and credential certificates.
          </p>

          {ownMatches.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    From your library
                  </p>
                </div>
                <Link to="/documents/own/new" className="text-[11px] font-medium text-primary hover:underline">
                  Design a template
                </Link>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Your own layouts that look relevant to this brief. Pick one to fill it from the same text.
              </p>
              <ul className="mt-3 space-y-2">
                {ownMatches.map((candidate) => (
                  <li
                    key={candidate._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-foreground">{candidate.name}</p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {candidate.categoryLabel ?? candidate.documentType ?? "custom layout"} · match {candidate.score}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOwnPick(candidate._id as Id<"documentTemplates">);
                        setResult(null);
                      }}
                      className="min-h-11 gap-1.5 sm:min-h-8"
                    >
                      Fill it
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="min-w-0 lg:col-span-2">
          <AnimatePresence mode="wait">
            {ownPick && (
              <motion.div
                key={`own-${ownPick}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-3"
              >
                <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-5">
                  <div className="flex items-center gap-2 text-primary">
                    <FileStack className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest">Your layout</p>
                  </div>
                  <p className="mt-1.5 text-base font-semibold text-foreground">
                    {ownDetail?.name ?? "Loading your template…"}
                  </p>
                  {ownDetail && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {ownExtraction?.recognized.length ?? 0} of {ownDetail.schema.fields.length} fields filled from
                      this brief.
                    </p>
                  )}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button size="sm" className="min-h-11 flex-1 gap-1.5 sm:min-h-9" asChild>
                      <Link to={`/documents/new/${ownPick}`} state={{ briefValues: ownExtraction?.values ?? {} }}>
                        <Send className="h-3.5 w-3.5" /> Open in builder
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOwnPick(null)}
                      className="min-h-11 gap-1.5 sm:min-h-9"
                    >
                      Back
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Filled fields</p>
                  {!ownExtraction || ownExtraction.recognized.length === 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Nothing matched yet — open it in the builder and fill it manually, or name the fields in the brief
                      (for example “Site: Lakeview Interiors”).
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {ownExtraction.recognized.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                        >
                          <span className="text-[11px] text-muted-foreground">{entry.label}</span>
                          <span className="max-w-[60%] truncate text-right text-[12px] font-medium text-foreground">
                            {entry.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {ownExtraction && ownExtraction.missing.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Still required</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {ownExtraction.missing.map((entry) => (
                          <span
                            key={entry.id}
                            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                          >
                            {entry.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Structured output
                    </p>
                    <button
                      type="button"
                      onClick={() => onCopy(ownJson)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors sm:min-h-0 sm:py-1",
                        copied ? "border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {copied ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy JSON"}
                    </button>
                  </div>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-[10.5px] leading-relaxed text-foreground">
                    {ownJson || "{}"}
                  </pre>
                </div>
              </motion.div>
            )}

            {!ownPick && !result && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center"
              >
                <Sparkles className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No brief analyzed yet</p>
                <p className="text-[11px] text-muted-foreground">
                  Write a brief and structure it to see the matched template, the extracted fields and their confidence.
                </p>
              </motion.div>
            )}

            {!ownPick && result?.status === "empty" && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"
              >
                Write a brief first.
              </motion.div>
            )}

            {!ownPick && result?.status === "ambiguous" && (
              <motion.div
                key="ambiguous"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Which document do you need?</p>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{result.reason}</p>
                <div className="mt-3 space-y-2">
                  {result.candidates.map((candidate: BriefCandidate) => (
                    <button
                      key={candidate.key}
                      type="button"
                      onClick={() => runParse(candidate.key)}
                      className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-medium text-foreground">{candidate.label}</span>
                        <span className="block truncate text-[10.5px] text-muted-foreground">
                          {candidate.description}
                        </span>
                      </span>
                      <Send className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {!ownPick && result?.status === "blocked" && (
              <motion.div
                key="blocked"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
              >
                <div className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <p className="text-sm font-semibold">Out of scope</p>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{result.reason}</p>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  What this tool can build
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BRIEF_INTENTS.map((intent) => (
                    <span
                      key={intent.key}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {intent.label}
                    </span>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-11 w-full gap-1.5 sm:min-h-9"
                  asChild
                >
                  <Link to="/documents/templates">
                    <ArrowLeft className="h-3.5 w-3.5" /> Browse the template library
                  </Link>
                </Button>
              </motion.div>
            )}

            {!ownPick && result?.status === "unsupported" && (
              <motion.div
                key="unsupported"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-semibold text-foreground">No match</p>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{result.reason}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.suggestions.map((suggestion) => (
                    <span
                      key={suggestion}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {suggestion}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {!ownPick && result?.status === "matched" && (
              <motion.div
                key="matched"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-5">
                  <div className="flex items-center gap-2 text-primary">
                    <BadgeCheck className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest">
                      {result.explicit ? "Matched template" : "Closest template"}
                    </p>
                  </div>
                  <p className="mt-1.5 text-base font-semibold text-foreground">{result.intent.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{result.intent.description}</p>
                  {matchedTemplate ? (
                    <Button size="sm" className="mt-3 min-h-11 w-full gap-1.5 sm:min-h-9" asChild>
                      <Link
                        to={`/documents/new/${matchedTemplate._id}`}
                        state={{ briefValues: output?.values ?? {} }}
                      >
                        <Send className="h-3.5 w-3.5" /> Open in builder
                      </Link>
                    </Button>
                  ) : templates === undefined ? (
                    <p className="mt-3 text-[11px] text-muted-foreground">Loading template…</p>
                  ) : (
                    <p className="mt-3 text-[11px] text-amber-600">
                      Template not installed yet. Open the library to install the starter set.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Recognized fields
                    </p>
                  </div>
                  {result.recognized.length === 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">No fields could be extracted automatically.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {result.recognized.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[11px] text-muted-foreground">{entry.label}</span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                                CONFIDENCE_STYLE[entry.confidence].className,
                              )}
                            >
                              {CONFIDENCE_STYLE[entry.confidence].label}
                            </span>
                          </span>
                          <span className="max-w-[58%] truncate text-right text-[12px] font-medium text-foreground">
                            {entry.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.missing.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Still required</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {result.missing.map((entry) => (
                          <span
                            key={entry.id}
                            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                          >
                            {entry.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Structured output
                    </p>
                    <button
                      type="button"
                      onClick={() => onCopy(structuredJson)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-colors sm:min-h-0 sm:py-1",
                        copied ? "border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {copied ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy JSON"}
                    </button>
                  </div>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-[10.5px] leading-relaxed text-foreground">
                    {structuredJson}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
