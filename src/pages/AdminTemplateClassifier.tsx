import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Brain,
  Copy,
  Download,
  FileJson,
  FileText,
  Plane,
  ShieldCheck,
  CreditCard,
  Sparkles,
  Upload,
  Wand2,
  AlertTriangle,
  FileBadge,
  Layers,
  ArrowRight,
  Database,
  Eye,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router";
import {
  CLOUDIE_CATEGORIES,
  classifyAndExtract,
  type ClassifierInput,
  type CloudieTemplateJson,
  type CloudieFieldType,
} from "@/lib/cloudieClassifier";

const CAT_META: Record<string, { icon: typeof ShieldCheck; tone: string; dot: string }> = {
  "Identity & Personal Documents": {
    icon: ShieldCheck,
    tone: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  "General & Official Artifacts": {
    icon: FileBadge,
    tone: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  "Financial & Payment Artifacts": {
    icon: CreditCard,
    tone: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  "Logistics & Travel": {
    icon: Plane,
    tone: "bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-200",
    dot: "bg-sky-500",
  },
};

const TYPE_TINT: Record<CloudieFieldType, string> = {
  string: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  number:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-900",
  date: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  image_url:
    "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-900",
};

const SAMPLES: Array<{ label: string; input: ClassifierInput }> = [
  {
    label: "Passport — Identity",
    input: {
      template_title: "US Passport — Identity Page",
      description: "Personal identification, identity verification, membership status card for border control.",
      slug: "us-passport-identity",
      rawText:
        "PASSPORT USA {{fullName}} {{dateOfBirth}} {{passportNumber}} {{nationality}} {{expiryDate}} Photo: {{holderPhoto}} {{issuingAuthority}}",
      placeholders: ["fullName", "dateOfBirth", "passportNumber", "nationality", "expiryDate", "holderPhoto"],
      fields: [
        { id: "fullName", label: "Full Name", type: "text" },
        { id: "dateOfBirth", label: "Date of Birth", type: "date" },
        { id: "passportNumber", label: "Passport Number", type: "text" },
        { id: "expiryDate", label: "Expiry Date", type: "date" },
        { id: "holderPhoto", label: "Holder Photo", type: "image" },
      ],
    },
  },
  {
    label: "Nursing Certificate — Official",
    input: {
      template_title: "Nursing Completion Certificate",
      description: "Official certificate for nursing programme completion — proof of completion and formal record.",
      slug: "nursing-certificate",
      rawText:
        "Certificate of Completion {{recipientName}} {{courseTitle}} {{issueDate}} {{credentialId}} {{signatoryName}} awarded by {{issuerName}}",
      placeholders: ["recipientName", "courseTitle", "issueDate", "credentialId", "signatoryName"],
      fields: [
        { id: "recipientName", label: "Recipient Name", type: "text" },
        { id: "courseTitle", label: "Programme Title", type: "text" },
        { id: "issueDate", label: "Issued On", type: "date" },
        { id: "credentialId", label: "Credential ID", type: "text" },
      ],
    },
  },
  {
    label: "PayPal Screenshot — Financial",
    input: {
      template_title: "PayPal Payment Screenshot",
      description: "Payment screenshot proof of transaction for PayPal wire transfer receipt.",
      slug: "paypal-screenshot",
      rawText:
        "PayPal Transaction {{transactionId}} {{senderName}} paid {{amount}} to {{recipientName}} on {{paymentDate}} Status: {{paymentStatus}} Receipt screenshot {{screenshotUrl}}",
      placeholders: ["transactionId", "amount", "paymentDate", "senderName", "recipientName"],
      fields: [
        { id: "transactionId", label: "Transaction ID", type: "text" },
        { id: "amount", label: "Amount", type: "number" },
        { id: "paymentDate", label: "Payment Date", type: "date" },
        { id: "screenshotUrl", label: "Screenshot Image", type: "image" },
      ],
    },
  },
  {
    label: "Flight Itinerary — Logistics",
    input: {
      template_title: "Flight Itinerary — Return Trip",
      description: "Flight itinerary return booking with airline, airports and consignment tracking for transit logistics.",
      slug: "flight-itinerary-return",
      rawText:
        "{{airline}} Flight {{flightNumber}} Booking {{bookingRef}} Passenger {{passengerName}} From {{fromCode}} {{fromCity}} To {{toCode}} {{toCity}} Depart {{departDate}} {{departTime}} Arrive {{arriveDate}} QR {{qrValue}}",
      placeholders: ["passengerName", "flightNumber", "departDate", "arriveDate", "bookingRef"],
      fields: [
        { id: "passengerName", label: "Passenger Name", type: "text" },
        { id: "flightNumber", label: "Flight Number", type: "text" },
        { id: "departDate", label: "Departure Date", type: "date" },
        { id: "arriveDate", label: "Arrival Date", type: "date" },
        { id: "qrValue", label: "Boarding QR", type: "image" },
      ],
    },
  },
];

function FieldRow({
  f,
  onChange,
  onRemove,
}: {
  f: { id: string; label: string; type: string };
  onChange: (patch: Partial<{ id: string; label: string; type: string }>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1.2fr_1.2fr_110px_32px] gap-1.5">
      <Input
        value={f.id}
        onChange={(e) => onChange({ id: e.target.value })}
        placeholder="field_key camelCase"
        className="h-8 text-xs font-mono"
      />
      <Input value={f.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Human label" className="h-8 text-xs" />
      <Select value={f.type} onValueChange={(v) => onChange({ type: v })}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="text">string</SelectItem>
          <SelectItem value="number">number</SelectItem>
          <SelectItem value="date">date</SelectItem>
          <SelectItem value="image">image_url</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function AdminTemplateClassifier() {
  const classifyAi = useAction(api.cloudieClassifierAction.classifyWithAi);
  const ingest = useMutation(api.cloudieClassifier.ingestClassifiedTemplate);
  const recent = useQuery(api.cloudieClassifier.listClassifiedTemplates, { limit: 12 });

  const [title, setTitle] = useState("Flight Itinerary — Return Trip");
  const [description, setDescription] = useState("Flight itinerary return booking with airline, airports and tracking for transit logistics.");
  const [slug, setSlug] = useState("");
  const [documentType, setDocumentType] = useState<string>("auto");
  const [rawText, setRawText] = useState(
    "{{passengerName}} — {{flightNumber}} — {{departureDate}} {{departureTime}} → {{arrivalDate}} — Booking {{bookingRef}} — Amount {{amount}} — QR {{qrValue}}",
  );
  const [placeholders, setPlaceholders] = useState("passengerName, flightNumber, departureDate, arrivalDate, bookingRef, amount, qrValue");
  const [fields, setFields] = useState<Array<{ id: string; label: string; type: string }>>([
    { id: "passengerName", label: "Passenger Name", type: "text" },
    { id: "flightNumber", label: "Flight Number", type: "text" },
    { id: "departureDate", label: "Departure Date", type: "date" },
    { id: "arrivalDate", label: "Arrival Date", type: "date" },
    { id: "amount", label: "Fare Amount", type: "number" },
    { id: "qrValue", label: "Boarding QR", type: "image" },
  ]);

  const [result, setResult] = useState<CloudieTemplateJson | null>(null);
  const [source, setSource] = useState<"ai" | "deterministic" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [jsonEdited, setJsonEdited] = useState<string>("");
  const [reqCredits, setReqCredits] = useState("25");
  const [visibility, setVisibility] = useState("public");
  const fileRef = useRef<HTMLInputElement>(null);

  const parsedPlaceholders = useMemo(
    () =>
      placeholders
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30),
    [placeholders],
  );

  const input: ClassifierInput = useMemo(
    () => ({
      template_title: title,
      name: title,
      description,
      slug: slug || undefined,
      documentType: documentType === "auto" ? undefined : documentType,
      rawText,
      placeholders: parsedPlaceholders,
      fields,
    }),
    [title, description, slug, documentType, rawText, parsedPlaceholders, fields],
  );

  const deterministicPreview = useMemo(() => classifyAndExtract(input), [input]);
  const previewJson: CloudieTemplateJson = useMemo(() => result ?? deterministicPreview, [result, deterministicPreview]);
  const jsonString = useMemo(() => JSON.stringify(previewJson, null, 2), [previewJson]);

  const syncEdited = (j: CloudieTemplateJson) => setJsonEdited(JSON.stringify(j, null, 2));

  const onSample = (sample: (typeof SAMPLES)[number]) => {
    setTitle(sample.input.template_title ?? "");
    setDescription(sample.input.description ?? "");
    setSlug(sample.input.slug ?? "");
    setRawText(sample.input.rawText ?? "");
    setPlaceholders((sample.input.placeholders ?? []).join(", "));
    setFields((sample.input.fields ?? []).map((f) => ({ id: f.id ?? "", label: f.label ?? "", type: f.type ?? "text" })));
    setResult(null);
    setSource(null);
    setAiError(null);
    setJsonEdited("");
    toast.success(`Loaded: ${sample.label}`);
  };

  const onAiClassify = async (preferAi = true) => {
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await classifyAi({
        templateTitle: title || undefined,
        name: title || undefined,
        title: title || undefined,
        description: description || undefined,
        slug: slug || undefined,
        documentType: documentType === "auto" ? undefined : documentType,
        rawText: rawText || undefined,
        placeholders: parsedPlaceholders.length ? parsedPlaceholders : undefined,
        fields: fields.length ? fields.map((f) => ({ id: f.id || undefined, label: f.label || undefined, type: f.type || undefined })) : undefined,
        preferAi,
      });
      setResult(res.result as CloudieTemplateJson);
      setSource(res.source);
      setAiError(res.aiError ?? null);
      syncEdited(res.result as CloudieTemplateJson);
      if (res.source === "ai") toast.success("AI classified — ready to ingest");
      else toast.message(res.aiError ? `AI fallback: ${res.aiError}` : "Deterministic classification ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      const fb = classifyAndExtract(input);
      setResult(fb);
      setSource("deterministic");
      setAiError(msg);
      syncEdited(fb);
    } finally {
      setAiBusy(false);
    }
  };

  const onIngest = async () => {
    let parsed: CloudieTemplateJson;
    try {
      parsed = JSON.parse(jsonEdited || jsonString);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    if (!CLOUDIE_CATEGORIES.includes(parsed.category as never)) {
      toast.error("Category must be one of the 4 strict categories");
      return;
    }
    setIngestBusy(true);
    try {
      const res = await ingest({
        result: {
          template_title: parsed.template_title,
          category: parsed.category,
          subcategory: parsed.subcategory,
          description: parsed.description,
          required_fields: parsed.required_fields.map((f) => ({
            field_key: f.field_key,
            label: f.label,
            data_type: f.data_type,
            required: true,
          })),
          is_active: true,
        },
        slug: slug || undefined,
        requiredCredits: reqCredits ? Number(reqCredits) : undefined,
        visibility,
      });
      toast.success(`Ingested as ${res.slug} → ${res.documentType} · v1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setIngestBusy(false);
    }
  };

  const onDropFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    try {
      const j = JSON.parse(text);
      const obj = Array.isArray(j) ? j[0] : j;
      if (obj && typeof obj === "object") {
        const o = obj as Record<string, unknown>;
        const name = (o.name as string) ?? (o.template_title as string) ?? file.name.replace(/\.json$/i, "");
        const desc = (o.description as string) ?? "";
        const s = (o.slug as string) ?? "";
        const dt = (o.documentType as string) ?? (o.category as string) ?? "";
        const sch = o.schema as { fields?: Array<{ id?: string; label?: string; type?: string }> } | undefined;
        const conf = o.configuration as { pages?: Array<{ elements?: Array<{ bind?: string }> }> } | undefined;
        const extractedFields: Array<{ id: string; label: string; type: string }> =
          sch?.fields?.map((f) => ({ id: f.id ?? "", label: f.label ?? f.id ?? "", type: f.type ?? "text" })) ?? [];
        const binds: string[] = conf?.pages?.flatMap((p) => (p.elements ?? []).map((el) => el.bind).filter(Boolean) as string[]) ?? [];
        const allPlaceholders = Array.from(new Set([...extractedFields.map((f) => f.id), ...binds])).slice(0, 30);
        setTitle(name.slice(0, 80));
        if (desc) setDescription(String(desc).slice(0, 300));
        if (s) setSlug(String(s).slice(0, 60));
        if (dt && dt.length < 30) setDocumentType(dt);
        if (extractedFields.length) setFields(extractedFields.slice(0, 30));
        if (allPlaceholders.length) {
          setPlaceholders(allPlaceholders.join(", "));
          setRawText(allPlaceholders.map((k) => `{{${k}}}`).join(" · "));
        }
        setResult(null);
        setSource(null);
        setAiError(null);
        setJsonEdited("");
        toast.success(`Loaded ${file.name} — review then classify`);
        return;
      }
    } catch {
      // fall through
    }
    setRawText(text.slice(0, 6000));
    setTitle((prev) => prev || file.name.replace(/\.json$/i, "").slice(0, 80));
    toast.success(`Loaded ${file.name} as raw text`);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(jsonEdited || jsonString);
    toast.success("JSON copied");
  };

  const downloadJson = () => {
    const blob = new Blob([jsonEdited || jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(previewJson.template_title || "template").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.classifier.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const activeCat = previewJson.category;
  const ActiveIcon = CAT_META[activeCat]?.icon ?? Sparkles;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
              <Brain className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">AI Template Classification</h1>
            <Badge className="bg-violet-600 text-white border-0 ml-1">Cloudie Admin</Badge>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Drop a template JSON or describe its fields — the engine maps it to <span className="font-medium text-foreground">exactly one of 4 strict categories</span>,
            extracts <span className="font-mono text-xs">{"{{variables}}"}</span> into <span className="font-mono text-xs">required_fields</span>, and outputs ingestion-ready JSON.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {CLOUDIE_CATEGORIES.map((cat) => {
              const Icon = CAT_META[cat].icon;
              return (
                <span key={cat} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${CAT_META[cat].tone}`}>
                  <Icon className="h-3 w-3" /> {cat}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload JSON / text
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/admin/document-templates">
              <Layers className="h-3.5 w-3.5" /> Catalogue
            </Link>
          </Button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".json,.txt" className="hidden" onChange={(e) => void onDropFile(e.target.files?.[0] ?? null)} />

      <Card className="rounded-xl border-dashed bg-muted/20">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Try a sample — click to load
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => onSample(s)}
                className="text-left rounded-xl border border-border bg-card p-3 hover:border-violet-200 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors"
              >
                <p className="text-xs font-semibold text-foreground truncate">{s.label}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{s.input.template_title}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-xl border-border shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-violet-600" /> Intake — template parameters
            </CardTitle>
            <p className="text-xs text-muted-foreground">Everything here feeds the classifier. Placeholders can be written as {"{{fieldKey}}"} in raw text or listed below.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Template title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Flight Itinerary — Return" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Slug (optional)</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Legacy documentType (hint)</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-detect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect (recommended)</SelectItem>
                    <SelectItem value="banking_ui">banking_ui</SelectItem>
                    <SelectItem value="tracking">tracking</SelectItem>
                    <SelectItem value="flight_itinerary">flight_itinerary</SelectItem>
                    <SelectItem value="financial">financial</SelectItem>
                    <SelectItem value="certificates">certificates</SelectItem>
                    <SelectItem value="corporate">corporate</SelectItem>
                    <SelectItem value="general">general</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Raw text / layout dump (optional)</Label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="{{passenger_name}} boarded flight {{flight_number}} on {{departure_date}} — amount {{amount}}"
                className="min-h-[84px] font-mono text-xs"
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">Any {"{{brace}}"} tokens are extracted automatically.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Placeholders (comma or newline separated)</Label>
              <Textarea
                value={placeholders}
                onChange={(e) => setPlaceholders(e.target.value)}
                placeholder="passengerName, flightNumber, departureDate"
                className="min-h-[56px] font-mono text-xs"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Structured fields</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setFields((prev) => [...prev, { id: "", label: "", type: "text" }])}
                >
                  <Plus className="h-3 w-3" /> Add field
                </Button>
              </div>
              <div className="hidden sm:grid grid-cols-[1.2fr_1.2fr_110px_32px] gap-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>field_key (camelCase)</span>
                <span>label</span>
                <span>data_type</span>
                <span />
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No fields — add from schema or use placeholders above.</p>
                ) : (
                  fields.map((f, i) => (
                    <FieldRow
                      key={i}
                      f={f}
                      onChange={(patch) => setFields((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))}
                      onRemove={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => void onAiClassify(true)} disabled={aiBusy || !title.trim()} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
                {aiBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Wand2 className="h-4 w-4" />}
                {aiBusy ? "Classifying…" : "Classify with AI"}
              </Button>
              <Button variant="outline" onClick={() => void onAiClassify(false)} disabled={aiBusy || !title.trim()} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Deterministic only
              </Button>
              <Button
                variant="ghost"
                className="gap-1.5"
                onClick={() => {
                  const fb = classifyAndExtract(input);
                  setResult(fb);
                  setSource("deterministic");
                  setAiError(null);
                  syncEdited(fb);
                  toast.success("Preview refreshed");
                }}
              >
                <Sparkles className="h-4 w-4" /> Refresh preview
              </Button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              AI uses your Vly integration key server-side; if unavailable the deterministic fallback always produces valid ingestion JSON.
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-xl border-border shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileJson className="h-4 w-4 text-violet-600" /> Output — ingestion JSON
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Strict schema: title · category · subcategory · description · required_fields · is_active</p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={copyJson}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={downloadJson}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`rounded-xl border p-3 flex items-center gap-3 ${CAT_META[activeCat]?.tone ?? "bg-muted border-border"}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 dark:bg-white/10 border border-black/5">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${CAT_META[activeCat]?.dot}`} /> {activeCat}
                    <span className="text-muted-foreground font-normal">·</span>
                    <span className="truncate">{previewJson.subcategory}</span>
                  </p>
                  <p className="text-[11px] line-clamp-2 opacity-80">{previewJson.description}</p>
                </div>
                <Badge variant={source === "ai" ? "default" : "secondary"} className={`shrink-0 gap-1 ${source === "ai" ? "bg-violet-600 text-white border-0" : ""}`}>
                  {source === "ai" ? <Brain className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
                  {source ?? "preview"}
                </Badge>
              </div>
              {aiError && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
                  {aiError}
                </p>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Required fields · {previewJson.required_fields.length}</p>
                <div className="flex flex-wrap gap-1.5">
                  {previewJson.required_fields.map((f) => (
                    <span key={f.field_key} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TYPE_TINT[f.data_type]}`}>
                      <span className="font-mono text-[11px]">{f.field_key}</span>
                      <span className="h-3 w-px bg-border" />
                      <span className="text-[10px] uppercase tracking-wide">{f.data_type}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-3 hidden sm:block overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[1.1fr_1.1fr_92px] gap-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 px-3 py-2">
                    <span>field_key</span>
                    <span>label</span>
                    <span>data_type</span>
                  </div>
                  <div className="divide-y">
                    {previewJson.required_fields.slice(0, 12).map((f) => (
                      <div key={f.field_key} className="grid grid-cols-[1.1fr_1.1fr_92px] gap-2 px-3 py-2 text-xs">
                        <span className="font-mono truncate">{f.field_key}</span>
                        <span className="truncate text-muted-foreground">{f.label}</span>
                        <span>
                          <Badge variant="outline" className={`text-[10px] border ${TYPE_TINT[f.data_type]}`}>
                            {f.data_type}
                          </Badge>
                        </span>
                      </div>
                    ))}
                    {previewJson.required_fields.length > 12 && (
                      <div className="px-3 py-2 text-center text-xs text-muted-foreground">+{previewJson.required_fields.length - 12} more in JSON…</div>
                    )}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="json" className="w-full">
                <TabsList className="h-8">
                  <TabsTrigger value="json" className="text-xs gap-1">
                    <FileJson className="h-3 w-3" /> JSON
                  </TabsTrigger>
                  <TabsTrigger value="edit" className="text-xs gap-1">
                    <FileText className="h-3 w-3" /> Edit & ingest
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="json" className="space-y-2">
                  <div className="relative rounded-xl border bg-slate-950 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                      <span className="text-[11px] font-mono text-white/60">ingestion.json · DB-ready</span>
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${CAT_META[activeCat]?.dot ?? "bg-white/40"}`} />
                        <span className="text-[11px] text-white/60">{activeCat}</span>
                      </div>
                    </div>
                    <pre className="max-h-[360px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-emerald-200">
                      <code>{jsonString}</code>
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={copyJson}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={downloadJson}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="edit" className="space-y-3">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Editable JSON — correct before ingesting</Label>
                  <Textarea value={jsonEdited || jsonString} onChange={(e) => setJsonEdited(e.target.value)} className="min-h-[240px] font-mono text-xs" spellCheck={false} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Points price</Label>
                      <Input value={reqCredits} onChange={(e) => setReqCredits(e.target.value)} inputMode="numeric" placeholder="25" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Visibility</Label>
                      <Select value={visibility} onValueChange={setVisibility}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">public</SelectItem>
                          <SelectItem value="unlisted">unlisted</SelectItem>
                          <SelectItem value="private">private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={onIngest} disabled={ingestBusy || !(jsonEdited || jsonString).trim()} className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                        {ingestBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Database className="h-4 w-4" />}
                        {ingestBusy ? "Ingesting…" : "Ingest template"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Creates a <span className="font-medium text-foreground">documentTemplates</span> row + versioned layout. Review in{" "}
                    <Link to="/admin/document-templates" className="underline">
                      Document Templates
                    </Link>{" "}
                    after.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-violet-600" /> Recently ingested / catalogue head
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : recent.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No templates yet — ingest one above.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((t, i) => (
                <motion.div
                  key={t._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-border p-3 hover:bg-muted/40"
                >
                  <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{t.slug}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">{t.categoryLabel} · {t.sensitivity} · {t.fieldCount} fields</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge variant={t.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {t.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{new Date(t.updatedAt).toLocaleDateString()}</span>
                    <Link to={`/admin/document-templates/${t._id}/edit`} className="ml-auto text-xs text-violet-600 hover:underline inline-flex items-center gap-1">
                      Edit <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-dashed bg-muted/10">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Strict ingestion schema — guaranteed
          </p>
          <pre className="rounded-lg border bg-card p-3 font-mono text-[11px] leading-relaxed overflow-auto">
            {`{
  "template_title": "String — Title of the template",
  "category": "Identity & Personal Documents | General & Official Artifacts | Financial & Payment Artifacts | Logistics & Travel",
  "subcategory": "String — e.g. Driver's License, Invoice, Flight Itinerary (Return)",
  "description": "String — brief render description",
  "required_fields": [
    { "field_key": "camelCase", "label": "Human Label", "data_type": "string | number | date | image_url", "required": true }
  ],
  "is_active": true
}`}
          </pre>
          <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
            <p>
              • <span className="font-medium text-foreground">Category is strict</span> — exactly one of 4. No free text.
            </p>
            <p>
              • <span className="font-medium text-foreground">field_key is camelCase</span> — letters + digits only, starts with letter.
            </p>
            <p>
              • <span className="font-medium text-foreground">data_type is constrained</span> — string | number | date | image_url only.
            </p>
            <p>
              • <span className="font-medium text-foreground">DB ingestion</span> — creates documentTemplates row with versioned schema + auto layout.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
