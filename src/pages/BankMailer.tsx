import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Landmark,
  LayoutTemplate,
  Loader2,
  Plus,
  Receipt,
  Send,
  Settings2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNgn } from "@/lib/pricing";
import { NeonApiError, neonApi } from "@/lib/neonApi";

// The contract module lives in `api/` so the server and this preview import
// the exact same validator and templates — what you review is what is sent.
import {
  BANK_MAILER_CREDITS,
  BANK_MAILER_PRICE_NGN,
  NOTICE_LANGUAGES,
  NOTICE_STATUSES,
  renderBankNotice,
  validateBankMailerPayload,
  type BankMailerPayload,
  type BankParty,
  type NoticeKind,
  type NoticeLanguage,
  type NoticeStatus,
} from "../../api/src/bankMailer";
import {
  bankTemplateVariables,
  renderEmailTemplate,
  templateSurchargeNgn,
  type EmailTemplateProduct,
} from "../../api/src/emailTemplates";

/* ── Form state ──────────────────────────────────────────────────────────── */

type PartyForm = {
  fullName: string;
  email: string;
  accountNumber: string;
  bankName: string;
  bankCountry: string;
  bankAddress: string;
  bankPhone: string;
  bankLogo: string;
};

type FormState = {
  amount: string;
  currency: string;
  status: NoticeStatus;
  language: NoticeLanguage;
  sender: PartyForm;
  receiver: PartyForm;
  referenceCode: string;
  transactionId: string;
  remarks: string;
  supportLink: string;
  warningBanner: string;
};

const EMPTY_PARTY: PartyForm = {
  fullName: "",
  email: "",
  accountNumber: "",
  bankName: "",
  bankCountry: "",
  bankAddress: "",
  bankPhone: "",
  bankLogo: "",
};

function emptyForm(): FormState {
  return {
    amount: "",
    currency: "USD",
    status: "success",
    language: "en",
    sender: { ...EMPTY_PARTY },
    receiver: { ...EMPTY_PARTY },
    referenceCode: "",
    transactionId: "",
    remarks: "",
    supportLink: "",
    warningBanner: "",
  };
}

function previewParty(party: PartyForm): BankParty {
  const phone = party.bankPhone.trim();
  const logo = party.bankLogo.trim();
  return {
    fullName: party.fullName.trim(),
    email: party.email.trim(),
    accountNumber: party.accountNumber.trim(),
    bankName: party.bankName.trim(),
    bankCountry: party.bankCountry.trim(),
    bankAddress: party.bankAddress.trim(),
    ...(phone ? { bankPhone: phone } : {}),
    ...(logo ? { bankLogo: logo } : {}),
  };
}

/** Best-effort payload for the live preview — never validated, always escaped. */
function toPreviewPayload(form: FormState): BankMailerPayload {
  const referenceCode = form.referenceCode.trim();
  const remarks = form.remarks.trim();
  const supportLink = form.supportLink.trim();
  const warningBanner = form.warningBanner.trim();
  const amount = Number(form.amount);
  return {
    transaction: {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      currency: form.currency.trim().toUpperCase() || "USD",
      status: form.status,
      language: form.language,
    },
    sender: previewParty(form.sender),
    receiver: previewParty(form.receiver),
    transactionId: form.transactionId.trim() || "auto-generated",
    ...(referenceCode ? { referenceCode } : {}),
    ...(remarks ? { remarks } : {}),
    ...(supportLink ? { supportLink } : {}),
    ...(warningBanner ? { warningBanner } : {}),
  };
}

/* ── Small building blocks ──────────────────────────────────────────────── */

function TextField({
  label,
  required,
  error,
  className,
  ...input
}: ComponentProps<typeof Input> & { label: string; required?: boolean; error?: string }) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input id={id} aria-invalid={error ? true : undefined} className={error && "border-destructive/60"} {...input} />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function SectionCard({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm tracking-tight">{title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function LogoField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file for the bank logo.");
      return;
    }
    if (file.size > 1_000_000) {
      toast.error("Keep the logo under 1 MB so it renders in email clients.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ""));
    reader.onerror = () => toast.error("That file could not be read.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Bank logo <span className="font-normal normal-case tracking-normal">(optional — URL or upload)</span>
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://example.com/bank-logo.png"
          maxLength={2000}
          aria-invalid={error ? true : undefined}
          className={error && "border-destructive/60"}
        />
        <Button type="button" variant="outline" className="shrink-0" onClick={() => fileRef.current?.click()}>
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {value ? (
        <div className="flex items-center gap-2">
          <img src={value} alt="Bank logo preview" className="size-8 rounded-md border bg-white object-contain" />
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => onChange("")}
          >
            Remove logo
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function LayoutOption({
  selected,
  title,
  description,
  price,
  thumbnail,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  price: string;
  thumbnail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors duration-200",
        selected
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-border bg-card hover:border-primary/30 hover:bg-surface",
      )}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded-lg border border-border object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            selected ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground",
          )}
        >
          <LayoutTemplate className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-foreground">{title}</span>
          {selected ? <Check className="size-3 shrink-0 text-primary" /> : null}
        </span>
        <span className="mt-0.5 line-clamp-1 block text-[11px] text-muted-foreground">
          {description}
        </span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--label)]">
          {price}
        </span>
      </span>
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function BankMailer() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewKind, setPreviewKind] = useState<NoticeKind>("debit");
  const [sending, setSending] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplateProduct[]>([]);
  const [templateId, setTemplateId] = useState("");

  const balance = useQuery(api.wallet.getBalance);
  const config = useQuery(api.platform.getPublicConfig);
  const platformName: string = config?.brand?.name ?? "Cloudie";

  // Catalog layouts for this module. A missing catalog must not block the form:
  // the built-in notice pair is always available as the default.
  useEffect(() => {
    let cancelled = false;
    neonApi
      .emailTemplates("billing")
      .then((result) => {
        if (!cancelled) setTemplates(result.templates);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const surchargeNgn = selectedTemplate ? templateSurchargeNgn(selectedTemplate.priceCredits) : 0;
  const totalPriceNgn = BANK_MAILER_PRICE_NGN + surchargeNgn;

  const balanceNgn = typeof balance === "number" && Number.isFinite(balance) ? balance : null;
  const insufficient = balanceNgn !== null && balanceNgn < totalPriceNgn;

  const payload = useMemo(() => toPreviewPayload(form), [form]);
  const notice = useMemo(() => {
    const base = renderBankNotice({ kind: previewKind, payload, platformName });
    if (!selectedTemplate) return base;
    return {
      ...base,
      html: renderEmailTemplate(
        selectedTemplate.htmlContent,
        bankTemplateVariables({ platformName, kind: previewKind, payload }),
      ),
    };
  }, [previewKind, payload, platformName, selectedTemplate]);
  const pristine = !form.amount && !form.sender.fullName && !form.receiver.fullName;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setParty(side: "sender" | "receiver", key: keyof PartyForm, value: string) {
    setForm((prev) => ({ ...prev, [side]: { ...prev[side], [key]: value } }));
  }

  function err(key: string): string | undefined {
    return errors[key];
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;

    // Insufficient balance intercepts the action and opens the top-up modal.
    if (insufficient) {
      setShowTopup(true);
      return;
    }

    const result = validateBankMailerPayload({
      transaction: {
        amount: form.amount,
        currency: form.currency,
        status: form.status,
        language: form.language,
      },
      sender: form.sender,
      receiver: form.receiver,
      referenceCode: form.referenceCode,
      transactionId: form.transactionId,
      remarks: form.remarks,
      supportLink: form.supportLink,
      warningBanner: form.warningBanner,
    });

    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Check the highlighted fields before sending.");
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setErrors({});
    setSending(true);

    try {
      const sent = await neonApi.bankMailerSend({
        ...result.value,
        ...(selectedTemplate ? { templateId: selectedTemplate.id } : {}),
      });
      toast.success(
        `Notices sent — debit to ${result.value.sender.email}, credit to ${result.value.receiver.email}`,
        { description: `Transaction ${sent.transactionId} · ${formatNgn(sent.chargedNgn)} charged` },
      );
      setForm(emptyForm());
      setPreviewKind("debit");
    } catch (error) {
      if (error instanceof NeonApiError && error.status === 402) {
        setShowTopup(true);
        return;
      }
      if (error instanceof NeonApiError) {
        toast.error(error.message);
      } else {
        toast.error("The send could not be completed. Failed sends are refunded to your wallet automatically.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bank Mailer</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compose a simulated bank transfer and dispatch matching debit and credit notices to both parties — charged
            per send from your wallet, refunded automatically if delivery fails.
          </p>
        </div>
        <Link
          to="/wallet/fund"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <Plus className="size-3.5 text-primary" />
          Top up wallet
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* ── Compose ─────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <SectionCard
            title="Email layout"
            hint="The built-in notice pair, or a published catalog layout."
            icon={<LayoutTemplate className="size-4" />}
          >
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <LayoutOption
                selected={!selectedTemplate}
                title="Default notice pair"
                description="Cloudie's built-in debit + credit layout"
                price="Included"
                onClick={() => setTemplateId("")}
              />
              {templates.map((template) => (
                <LayoutOption
                  key={template.id}
                  selected={templateId === template.id}
                  title={template.title}
                  description={template.description || "Catalog layout"}
                  thumbnail={template.thumbnailUrl}
                  price={
                    template.priceCredits > 0
                      ? `+${template.priceCredits} credits`
                      : "Free layout"
                  }
                  onClick={() => setTemplateId(template.id)}
                />
              ))}
            </div>
            {templates.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                No catalog layouts are published for billing yet — the default notice pair is used.
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                A catalog layout replaces the email body; recipients, subjects and the automatic
                refund guarantee stay the same.
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Transaction details"
            hint="What the notice says happened."
            icon={<Receipt className="size-4" />}
          >
            <TextField
              label="Amount"
              required
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="2500.00"
              value={form.amount}
              maxLength={16}
              onChange={(event) => setField("amount", event.target.value)}
              error={err("transaction.amount")}
            />
            <TextField
              label="Currency (SWIFT)"
              required
              placeholder="USD"
              value={form.currency}
              maxLength={3}
              onChange={(event) => setField("currency", event.target.value.toUpperCase())}
              error={err("transaction.currency")}
            />
            <SelectField
              label="Status"
              value={form.status}
              onValueChange={(value) => setField("status", value as NoticeStatus)}
            >
              {NOTICE_STATUSES.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectField>
            <SelectField
              label="Language"
              value={form.language}
              onValueChange={(value) => setField("language", value as NoticeLanguage)}
            >
              {NOTICE_LANGUAGES.map((language) => (
                <SelectItem key={language.id} value={language.id}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectField>
          </SectionCard>

          <SectionCard
            title="Sender — debited party"
            hint="Receives the debit notice."
            icon={<UserRound className="size-4" />}
          >
            <TextField
              label="Full name"
              required
              placeholder="Ada Obi"
              value={form.sender.fullName}
              maxLength={80}
              onChange={(event) => setParty("sender", "fullName", event.target.value)}
              error={err("sender.fullName")}
            />
            <TextField
              label="Email"
              required
              type="email"
              placeholder="ada@example.com"
              value={form.sender.email}
              maxLength={160}
              onChange={(event) => setParty("sender", "email", event.target.value)}
              error={err("sender.email")}
            />
            <TextField
              label="Account number"
              required
              placeholder="0123456789"
              value={form.sender.accountNumber}
              maxLength={34}
              onChange={(event) => setParty("sender", "accountNumber", event.target.value)}
              error={err("sender.accountNumber")}
            />
            <TextField
              label="Bank name"
              required
              placeholder="First Meridian Bank"
              value={form.sender.bankName}
              maxLength={90}
              onChange={(event) => setParty("sender", "bankName", event.target.value)}
              error={err("sender.bankName")}
            />
            <TextField
              label="Bank country"
              required
              placeholder="Nigeria"
              value={form.sender.bankCountry}
              maxLength={60}
              onChange={(event) => setParty("sender", "bankCountry", event.target.value)}
              error={err("sender.bankCountry")}
            />
            <TextField
              label="Bank phone"
              placeholder="+234 800 000 0000"
              value={form.sender.bankPhone}
              maxLength={32}
              onChange={(event) => setParty("sender", "bankPhone", event.target.value)}
              error={err("sender.bankPhone")}
            />
            <TextField
              label="Bank address"
              required
              placeholder="12 Marina Road, Lagos"
              value={form.sender.bankAddress}
              maxLength={160}
              onChange={(event) => setParty("sender", "bankAddress", event.target.value)}
              error={err("sender.bankAddress")}
              className="sm:col-span-2"
            />
            <LogoField
              value={form.sender.bankLogo}
              onChange={(next) => setParty("sender", "bankLogo", next)}
              error={err("sender.bankLogo")}
            />
          </SectionCard>

          <SectionCard
            title="Receiver — credited party"
            hint="Receives the credit notice."
            icon={<Landmark className="size-4" />}
          >
            <TextField
              label="Full name"
              required
              placeholder="Bayo Cole"
              value={form.receiver.fullName}
              maxLength={80}
              onChange={(event) => setParty("receiver", "fullName", event.target.value)}
              error={err("receiver.fullName")}
            />
            <TextField
              label="Email"
              required
              type="email"
              placeholder="bayo@example.com"
              value={form.receiver.email}
              maxLength={160}
              onChange={(event) => setParty("receiver", "email", event.target.value)}
              error={err("receiver.email")}
            />
            <TextField
              label="Account number"
              required
              placeholder="9988776655"
              value={form.receiver.accountNumber}
              maxLength={34}
              onChange={(event) => setParty("receiver", "accountNumber", event.target.value)}
              error={err("receiver.accountNumber")}
            />
            <TextField
              label="Bank name"
              required
              placeholder="Northgate Trust"
              value={form.receiver.bankName}
              maxLength={90}
              onChange={(event) => setParty("receiver", "bankName", event.target.value)}
              error={err("receiver.bankName")}
            />
            <TextField
              label="Bank country"
              required
              placeholder="United States"
              value={form.receiver.bankCountry}
              maxLength={60}
              onChange={(event) => setParty("receiver", "bankCountry", event.target.value)}
              error={err("receiver.bankCountry")}
            />
            <TextField
              label="Bank phone"
              placeholder="+1 555 000 0000"
              value={form.receiver.bankPhone}
              maxLength={32}
              onChange={(event) => setParty("receiver", "bankPhone", event.target.value)}
              error={err("receiver.bankPhone")}
            />
            <TextField
              label="Bank address"
              required
              placeholder="5 Wall Street, New York"
              value={form.receiver.bankAddress}
              maxLength={160}
              onChange={(event) => setParty("receiver", "bankAddress", event.target.value)}
              error={err("receiver.bankAddress")}
              className="sm:col-span-2"
            />
            <LogoField
              value={form.receiver.bankLogo}
              onChange={(next) => setParty("receiver", "bankLogo", next)}
              error={err("receiver.bankLogo")}
            />
          </SectionCard>

          <SectionCard
            title="Optional & customization"
            hint="References, narration and alert extras."
            icon={<Settings2 className="size-4" />}
          >
            <TextField
              label="Reference code"
              placeholder="REF-2026-001"
              value={form.referenceCode}
              maxLength={40}
              onChange={(event) => setField("referenceCode", event.target.value)}
              error={err("referenceCode")}
            />
            <TextField
              label="Transaction ID"
              placeholder="Leave blank to auto-generate"
              value={form.transactionId}
              maxLength={32}
              onChange={(event) => setField("transactionId", event.target.value)}
              error={err("transactionId")}
            />
            <TextField
              label="Support link"
              placeholder="https://cloudie.wuaze.com/support"
              value={form.supportLink}
              maxLength={400}
              onChange={(event) => setField("supportLink", event.target.value)}
              error={err("supportLink")}
              className="sm:col-span-2"
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label
                htmlFor="bm-remarks"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Remarks / narration <span className="font-normal normal-case tracking-normal">(optional)</span>
              </Label>
              <Textarea
                id="bm-remarks"
                placeholder="Invoice settlement for October…"
                value={form.remarks}
                maxLength={300}
                rows={2}
                onChange={(event) => setField("remarks", event.target.value)}
                aria-invalid={err("remarks") ? true : undefined}
              />
              {err("remarks") ? <p className="text-xs text-destructive">{err("remarks")}</p> : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label
                htmlFor="bm-warning"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Red warning banner text <span className="font-normal normal-case tracking-normal">(optional)</span>
              </Label>
              <Textarea
                id="bm-warning"
                placeholder="Verify the beneficiary before sending funds…"
                value={form.warningBanner}
                maxLength={200}
                rows={2}
                onChange={(event) => setField("warningBanner", event.target.value)}
                aria-invalid={err("warningBanner") ? true : undefined}
              />
              {err("warningBanner") ? <p className="text-xs text-destructive">{err("warningBanner")}</p> : null}
            </div>
          </SectionCard>

          {/* ── Cost + submit ──────────────────────────────────────────── */}
          <Card className={cn(insufficient && "border-destructive/50")}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Cost: </span>
                  <span className="font-semibold text-foreground">
                    {BANK_MAILER_CREDITS + (selectedTemplate?.priceCredits ?? 0)} credits /{" "}
                    {formatNgn(totalPriceNgn)} per email pair
                  </span>
                </p>
                {selectedTemplate ? (
                  <p className="text-xs text-muted-foreground">
                    Includes {selectedTemplate.title}
                    {surchargeNgn > 0 ? ` (+${formatNgn(surchargeNgn)} layout)` : " (free layout)"}
                  </p>
                ) : null}
                <p className={cn("text-xs", insufficient ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {balanceNgn === null
                    ? "Checking wallet balance…"
                    : insufficient
                      ? `Insufficient balance — ${formatNgn(totalPriceNgn - balanceNgn)} short`
                      : `Wallet balance: ${formatNgn(balanceNgn)}`}
                </p>
              </div>
              <Button type="submit" size="lg" className="rounded-full px-7" disabled={sending}>
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Send notices
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </form>

        {/* ── Live preview ───────────────────────────────────────────── */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Live preview
            </span>
            <div className="flex gap-1 rounded-full border border-border bg-card p-1">
              {(["debit", "credit"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPreviewKind(kind)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200",
                    previewKind === kind
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {kind === "debit" ? "Debit (sender)" : "Credit (receiver)"}
                </button>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/30">
            {pristine ? (
              <div className="flex h-[640px] flex-col items-center justify-center gap-3 px-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Send className="size-5" />
                </span>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Start typing — the {previewKind === "debit" ? "debit" : "credit"} notice updates as you fill in the
                  form, exactly as it will be delivered.
                </p>
              </div>
            ) : (
              <iframe
                title={`${previewKind} notice preview`}
                srcDoc={notice.html}
                sandbox=""
                className="h-[640px] w-full border-0 bg-white"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedTemplate
              ? `Rendered from “${selectedTemplate.title}” with your form values — the delivered body matches this preview.`
              : "The delivered email is byte-identical to this preview — including the masked account line on the debit notice."}
          </p>
        </aside>
      </div>

      {/* ── Insufficient balance modal ─────────────────────────────────── */}
      <Dialog open={showTopup} onOpenChange={setShowTopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Insufficient Balance
            </DialogTitle>
            <DialogDescription>
              Insufficient Balance — you need {formatNgn(totalPriceNgn)} to send this notice.{" "}
              {balanceNgn !== null ? `Your wallet balance is ${formatNgn(balanceNgn)}.` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowTopup(false)}>
              Not now
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/wallet/fund" onClick={() => setShowTopup(false)}>
                <Plus className="size-4" />
                Top up wallet
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
