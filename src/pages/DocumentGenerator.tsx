import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ClipboardCopy,
  FileWarning,
  Info,
  ListChecks,
  Send,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BRIEF_INTENTS,
  buildStructuredOutput,
  parseDocumentBrief,
  type BriefResult,
} from "@/lib/documentBrief";
import { PageHeader } from "@/components/documents/ui";

const EXAMPLES = [
  "Create a shipment tracking card for consignment CRL-88213-7Q from Rotterdam to Nairobi, 12.4 kg, sender Meridian Supply Co., recipient Riverside Hardware.",
  "Commercial invoice INV-2026-0774 from Northfold Trading to Lakeview Interiors, issued 2026-09-15, due Net 30, total 4824.00 USD.",
  "Operations brief titled Weekly logistics review, owner Amara Cole, audience Dispatch team, review date 2026-10-16.",
];

/**
 * Document brief generator.
 *
 * Reads a plain-language brief, identifies the matching Crestline business
 * document, extracts the fields it can and reports the ones still needed.
 * Everything runs locally against the platform's own templates — no model call
 * and no generated identity or payment artifacts.
 */
export default function DocumentGenerator() {
  const templates = useQuery(api.docTemplates.listTemplates, { limit: 100 });
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<BriefResult | null>(null);
  const [copied, setCopied] = useState(false);

  const matchedTemplate = useMemo(() => {
    if (!result || result.status !== "matched" || !templates) return null;
    return templates.find((template) => template.slug === result.intent.templateSlug) ?? null;
  }, [result, templates]);

  const output = useMemo(() => {
    if (!result || result.status !== "matched") return null;
    return buildStructuredOutput(result);
  }, [result]);

  const structuredJson = useMemo(() => {
    if (!output) return "";
    return JSON.stringify(output, null, 2);
  }, [output]);

  const onAnalyze = () => {
    const parsed = parseDocumentBrief(brief);
    setResult(parsed);
    setCopied(false);
    if (parsed.status === "matched") toast.success(`Matched ${parsed.intent.label}`);
    else if (parsed.status === "blocked") toast.error("Unsupported document type");
    else if (parsed.status === "unsupported") toast.message("No supported match yet");
  };

  const onCopy = async () => {
    if (!structuredJson) return;
    try {
      await navigator.clipboard.writeText(structuredJson);
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
        description="Describe the document you need. Crestline identifies the matching business template, extracts the fields it can and shows what is still missing."
        actions={
          <Button variant="outline" asChild>
            <Link to="/documents/templates" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Template library
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="lg:col-span-3 space-y-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <label htmlFor="brief" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Your brief
            </label>
            <Textarea
              id="brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Example: Commercial invoice INV-2026-0774 from Northfold Trading to Lakeview Interiors, issued 2026-09-15, Net 30, total 4824.00 USD."
              rows={7}
              className="mt-3 min-h-[160px] resize-y text-sm"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={onAnalyze} disabled={brief.trim().length === 0} className="min-h-11 gap-1.5 sm:min-h-9">
                <Wand2 className="h-4 w-4" /> Structure document
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setBrief("");
                  setResult(null);
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
                className="min-h-11 rounded-full border border-border px-4 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted sm:min-h-0 sm:max-w-[300px] sm:px-3 sm:py-1.5"
              >
                {example.slice(0, 74)}…
              </button>
            ))}
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Supported: {BRIEF_INTENTS.map((intent) => intent.label).join(" · ")}. Crestline declines identity documents,
            government credentials, payment confirmations, bank instruments and credential certificates.
          </p>
        </section>

        <section className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {!result && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center"
              >
                <Sparkles className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No brief analyzed yet</p>
                <p className="text-[11px] text-muted-foreground">Write a brief and structure it to see the matched template and required fields.</p>
              </motion.div>
            )}

            {result?.status === "empty" && (
              <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                Write a brief first.
              </motion.div>
            )}

            {result?.status === "blocked" && (
              <motion.div
                key="blocked"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
              >
                <div className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <p className="text-sm font-semibold">Not supported</p>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{result.reason}</p>
              </motion.div>
            )}

            {result?.status === "unsupported" && (
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
                    <span key={suggestion} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {suggestion}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {result?.status === "matched" && (
              <motion.div key="matched" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-5">
                  <div className="flex items-center gap-2 text-primary">
                    <BadgeCheck className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest">Matched template</p>
                  </div>
                  <p className="mt-1.5 text-base font-semibold text-foreground">{result.intent.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{result.intent.description}</p>
                  {matchedTemplate ? (
                    <Button size="sm" className="mt-3 min-h-11 w-full gap-1.5 sm:min-h-9" asChild>
                      <Link to={`/documents/new/${matchedTemplate._id}`}>
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
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recognized fields</p>
                  </div>
                  {result.recognized.length === 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">No fields could be extracted automatically.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {result.recognized.map((entry) => (
                        <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                          <span className="text-[11px] text-muted-foreground">{entry.label}</span>
                          <span className="max-w-[60%] truncate text-right text-[12px] font-medium text-foreground">{entry.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.missing.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Still required</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {result.missing.map((entry) => (
                          <span key={entry.id} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {entry.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Structured output</p>
                    <button
                      type="button"
                      onClick={onCopy}
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
