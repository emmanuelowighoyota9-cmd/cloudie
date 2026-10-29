import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CreditCard,
  Landmark,
  LayoutTemplate,
  Loader2,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatNgn } from "@/lib/pricing";
import { NeonApiError, neonApi } from "@/lib/neonApi";

// The contract module lives in `api/` so the preview and the delivery path
// import the exact same renderer and validator.
import {
  ASSETS,
  NOTICE_TYPES,
  TRANSACTION_MAIL_TEMPLATES,
  formatDateTimeUtc,
  renderTransactionMail,
  shortHash,
  validateTransactionMailPayload,
  type MailBrand,
  type NoticeType,
  type TransactionMailPayload,
  type TransactionMailTemplate,
} from "../../api/src/transactionMailer";
import {
  renderEmailTemplate,
  templateSurchargeNgn,
  transactionTemplateVariables,
  type EmailTemplateProduct,
} from "../../api/src/emailTemplates";

/* ── Pages of the studio ─────────────────────────────────────────────────── */

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  crypto_deposit: ArrowDownLeft,
  crypto_withdrawal: ArrowUpRight,
  wallet_credit: Wallet,
  card_debit: CreditCard,
  bank_transfer: Landmark,
  security_alert: ShieldAlert,
};

const BANNER_KEY = "cloudie.crypto-mails.upgrade-dismissed";

type Overview = Awaited<ReturnType<typeof neonApi.transactionMailerOverview>>;

/* ── Time helpers (the composer edits local time, mail prints UTC) ───────── */

function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSentAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--label)]"
      >
        {label}
        {hint ? (
          <span className="font-normal normal-case tracking-normal text-muted-foreground">{hint}</span>
        ) : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "SENT"
      ? "border-primary/30 bg-primary/10 text-primary"
      : status === "FAILED"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
        style,
      )}
    >
      {status === "SENT" ? <Check className="size-3" /> : null}
      {status}
    </span>
  );
}

/* ── Composer modal ──────────────────────────────────────────────────────── */

type FormState = {
  noticeType: NoticeType;
  amount: string;
  currency: string;
  walletAddress: string;
  txHash: string;
  occurredAt: string;
  note: string;
};

function Composer({
  template,
  brand,
  platformName,
  recipientEmail,
  priceNgn,
  balanceNgn,
  templates,
  onClose,
  onSent,
}: {
  template: TransactionMailTemplate;
  brand: MailBrand;
  platformName: string;
  recipientEmail: string;
  priceNgn: number;
  balanceNgn: number | null;
  templates: EmailTemplateProduct[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    noticeType: template.noticeType,
    amount: "",
    currency: "BTC",
    walletAddress: "",
    txHash: "",
    occurredAt: toLocalInput(Date.now()),
    note: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [topup, setTopup] = useState(false);
  const [templateId, setTemplateId] = useState("default");

  const Icon = TEMPLATE_ICONS[template.key] ?? Wallet;
  const catalogTemplate = templates.find((entry) => entry.id === templateId) ?? null;
  const layoutSurcharge = catalogTemplate ? templateSurchargeNgn(catalogTemplate.priceCredits) : 0;
  const totalPriceNgn = priceNgn + layoutSurcharge;
  const insufficient = balanceNgn !== null && balanceNgn < totalPriceNgn;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Best-effort payload for the live preview — never validated, always escaped. */
  const preview = useMemo<TransactionMailPayload>(() => {
    const amount = form.amount.trim().replace(/,/g, "");
    const walletAddress = form.walletAddress.trim();
    const note = form.note.trim();
    return {
      templateKey: template.key,
      noticeType: form.noticeType,
      amount: amount || "0",
      currency: form.currency,
      ...(walletAddress ? { walletAddress } : {}),
      txHash: form.txHash.trim() || "auto-generated",
      occurredAt: fromLocalInput(form.occurredAt) ?? Date.now(),
      ...(note ? { note } : {}),
    };
  }, [form, template.key]);

  const mail = useMemo(() => {
    const base = renderTransactionMail({ payload: preview, brand, platformName });
    if (!catalogTemplate) return base;
    return {
      ...base,
      html: renderEmailTemplate(
        catalogTemplate.htmlContent,
        transactionTemplateVariables({
          platformName,
          brandName: brand.name,
          recipientEmail,
          noticeType: preview.noticeType,
          amount: preview.amount,
          currency: preview.currency,
          transactionId: preview.txHash,
          status: "SENT",
          message: preview.note ?? "",
          occurredAt: preview.occurredAt,
        }),
      ),
    };
  }, [preview, brand, platformName, catalogTemplate, recipientEmail]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    if (insufficient) {
      setTopup(true);
      return;
    }

    const result = validateTransactionMailPayload({
      ...preview,
      occurredAt: fromLocalInput(form.occurredAt) ?? Number.NaN,
      walletAddress: form.walletAddress,
      txHash: form.txHash,
      note: form.note,
    });

    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Check the highlighted fields before sending.");
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    setErrors({});
    setSending(true);
    try {
      const sent = await neonApi.transactionMailerSend({
        ...result.value,
        ...(catalogTemplate ? { templateId: catalogTemplate.id } : {}),
      });
      toast.success("Mail delivered to your inbox", {
        description: `${template.name} · ${formatNgn(sent.chargedNgn)} charged · ${shortHash(
          sent.transactionId,
        )}`,
      });
      onSent();
      onClose();
    } catch (error) {
      if (error instanceof NeonApiError && error.status === 402) {
        setTopup(true);
        return;
      }
      toast.error(
        error instanceof NeonApiError
          ? error.message
          : "The send could not be completed. Failed sends are refunded automatically.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg tracking-tight">
            <span
              className="flex size-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${template.accent}1f`, color: template.accent }}
            >
              <Icon className="size-4" />
            </span>
            {template.name}
          </DialogTitle>
          <DialogDescription>
            Compose the notice, review the exact markup, then deliver it to{" "}
            <span className="font-semibold text-foreground">{recipientEmail}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Field
              label="Email layout"
              hint={
                catalogTemplate
                  ? catalogTemplate.priceCredits > 0
                    ? `+${catalogTemplate.priceCredits} credits`
                    : "free layout"
                  : "studio default"
              }
            >
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Studio default</SelectItem>
                  {templates.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.title}
                      {entry.priceCredits > 0 ? ` · +${entry.priceCredits} credits` : " · Free"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {catalogTemplate ? (
              <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-2.5">
                {catalogTemplate.thumbnailUrl ? (
                  <img
                    src={catalogTemplate.thumbnailUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <LayoutTemplate className="size-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {catalogTemplate.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {catalogTemplate.description || "Catalog layout"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Transaction type" error={errors.noticeType}>
                <Select
                  value={form.noticeType}
                  onValueChange={(value) => setField("noticeType", value as NoticeType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Asset" error={errors.currency}>
                <Select value={form.currency} onValueChange={(value) => setField("currency", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSETS.map((asset) => (
                      <SelectItem key={asset} value={asset}>
                        {asset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Amount" error={errors.amount} hint={`in ${form.currency}`}>
                <Input
                  inputMode="decimal"
                  placeholder="0.05"
                  value={form.amount}
                  maxLength={20}
                  aria-invalid={errors.amount ? true : undefined}
                  onChange={(event) => setField("amount", event.target.value)}
                />
              </Field>

              <Field label="Wallet address" hint="(optional)" error={errors.walletAddress}>
                <Input
                  placeholder="bc1q…"
                  value={form.walletAddress}
                  maxLength={120}
                  aria-invalid={errors.walletAddress ? true : undefined}
                  onChange={(event) => setField("walletAddress", event.target.value)}
                />
              </Field>

              <Field label="Transaction hash" hint="(blank = generate)" error={errors.txHash}>
                <Input
                  placeholder="Auto-generate a mock hash"
                  value={form.txHash}
                  maxLength={80}
                  aria-invalid={errors.txHash ? true : undefined}
                  onChange={(event) => setField("txHash", event.target.value)}
                />
              </Field>

              <Field label="Date & time" error={errors.occurredAt}>
                <Input
                  type="datetime-local"
                  value={form.occurredAt}
                  aria-invalid={errors.occurredAt ? true : undefined}
                  onChange={(event) => setField("occurredAt", event.target.value)}
                />
              </Field>
            </div>

            <Field label="Note" hint="(optional)" error={errors.note}>
              <Textarea
                rows={2}
                placeholder="Invoice settlement for October…"
                value={form.note}
                maxLength={200}
                aria-invalid={errors.note ? true : undefined}
                onChange={(event) => setField("note", event.target.value)}
              />
            </Field>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--label)]">
                  Recipient
                </span>
                <span className="text-xs font-medium text-foreground">{recipientEmail}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                This studio only ever delivers to the signed-in account's own address. There is no
                recipient field to change — every message is a test of your own template.
              </p>
            </div>

            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
                insufficient ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
              )}
            >
              <div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Cost: </span>
                  <span className="font-semibold text-foreground">{formatNgn(totalPriceNgn)}</span>
                  <span className="text-muted-foreground"> per mail</span>
                </p>
                {catalogTemplate && layoutSurcharge > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Includes +{formatNgn(layoutSurcharge)} for {catalogTemplate.title}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    insufficient ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                >
                  {balanceNgn === null
                    ? "Wallet balance unavailable"
                    : insufficient
                      ? `Insufficient balance — ${formatNgn(totalPriceNgn - balanceNgn)} short`
                      : `Balance ${formatNgn(balanceNgn)} after send ${formatNgn(
                          Math.max(0, balanceNgn - totalPriceNgn),
                        )}`}
                </p>
              </div>
              <Button
                type="submit"
                className="rounded-full px-6"
                disabled={sending || insufficient}
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send className="size-4" /> Send email
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Live preview — byte-identical to what is delivered. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--label)]">
                Live preview
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDateTimeUtc(preview.occurredAt)}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
              <iframe
                title={`${template.name} preview`}
                srcDoc={mail.html}
                sandbox=""
                className="h-[440px] w-full border-0 bg-white sm:h-[520px]"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Rendered in <span className="font-medium text-foreground">{brand.name}</span>. Every
              delivered message carries a test-delivery strip and a simulation footer.
            </p>
          </div>
        </div>
      </DialogContent>

      <Dialog open={topup} onOpenChange={setTopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Insufficient balance
            </DialogTitle>
            <DialogDescription>
              You need {formatNgn(totalPriceNgn)} to send this mail.
              {balanceNgn !== null ? ` Your wallet balance is ${formatNgn(balanceNgn)}.` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setTopup(false)}
            >
              Not now
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/wallet/fund">
                <Plus className="size-4" /> Top up wallet <ArrowRight className="size-4" />
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function CryptoMails() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TransactionMailTemplate | null>(null);
  const [templates, setTemplates] = useState<EmailTemplateProduct[]>([]);
  const [bannerOpen, setBannerOpen] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const load = useCallback(async () => {
    try {
      const data = await neonApi.transactionMailerOverview();
      setOverview(data);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof NeonApiError ? caught.message : "The mail studio could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Published notification layouts. A catalog outage must not block the studio:
  // the built-in template set is always available.
  useEffect(() => {
    let cancelled = false;
    neonApi
      .emailTemplates("notifications")
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

  function dismissBanner() {
    setBannerOpen(false);
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      // Storage may be unavailable; the banner simply returns next visit.
    }
  }

  const logs = overview?.logs ?? [];
  const priceNgn = overview?.pricing.priceNgn ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--label)]">
            Services · Mail studio
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Crypto Mails
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Pick a template to send a brand-styled deposit or transaction email — then check how it
            renders in a real inbox. Charged per mail, refunded automatically if delivery fails.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-border bg-card px-3.5 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--label)]">
              Wallet
            </span>
            <p className="text-sm font-semibold text-foreground">
              {overview?.balanceNgn === null || overview === null
                ? "—"
                : formatNgn(overview.balanceNgn)}
            </p>
          </div>
          <Link
            to="/wallet/fund"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="size-3.5 text-primary" /> Top up
          </Link>
        </div>
      </div>

      {/* Upgrade banner */}
      {bannerOpen ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3.5 pr-12 sm:px-5"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                Upgrade for lower per-mail pricing
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Subscribers pay less per mail and unlock the full template set.{" "}
                <Link
                  to="/billing"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  See plans
                </Link>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss upgrade notice"
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </motion.div>
      ) : null}

      {/* Template grid */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--label)]">
            Templates
          </h2>
          <span className="text-xs text-muted-foreground">{formatNgn(priceNgn)} per mail</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TRANSACTION_MAIL_TEMPLATES.map((template, index) => {
            const Icon = TEMPLATE_ICONS[template.key] ?? Wallet;
            return (
              <motion.button
                key={template.key}
                type="button"
                onClick={() => setActive(template)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
                className="group relative flex flex-col items-start rounded-2xl border border-border bg-card p-5 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-surface focus-visible:border-primary focus-visible:outline-none"
              >
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]"
                  style={{
                    borderColor: `${template.accent}55`,
                    backgroundColor: `${template.accent}1a`,
                    color: template.accent,
                  }}
                >
                  {template.tier}
                </span>

                <span
                  className="mt-1 flex size-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${template.accent}1a`, color: template.accent }}
                >
                  <Icon className="size-5" />
                </span>

                <h3 className="mt-3.5 text-sm font-semibold tracking-tight text-foreground">
                  {template.name}
                </h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {template.tagline}
                </p>

                <span className="mt-3.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  Compose
                  <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </motion.button>
            );
          })}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Templates render in{" "}
          <span className="font-medium text-foreground">{overview?.brand.name ?? "your brand"}</span>{" "}
          — set in your organization profile — and are delivered only to your own inbox.
        </p>
      </div>

      {/* Recently sent */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Recently sent Crypto Mails
          </h2>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--label)]">
            {logs.length} {logs.length === 1 ? "record" : "records"}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : error ? (
          <div className="p-5">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : overview && !overview.historyAvailable ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Delivery history is unavailable until the database migration is applied.
          </p>
        ) : logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No Crypto Mails yet. Pick a template above and send your first Crypto Mail.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Template</TableHead>
                  <TableHead>Recipient email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Sent at</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const template = TRANSACTION_MAIL_TEMPLATES.find(
                    (entry) => entry.key === log.templateKey,
                  );
                  const notice = NOTICE_TYPES.find((entry) => entry.id === log.noticeType);
                  return (
                    <TableRow key={log.id} className="border-border">
                      <TableCell className="text-xs font-semibold text-foreground">
                        {template?.name ?? log.templateKey}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.recipientEmail}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {notice?.label ?? log.noticeType}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-foreground">
                        {log.amount} {log.currency}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatSentAt(log.sentAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusPill status={log.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Card className="border-border bg-surface">
        <CardContent className="flex flex-wrap items-center gap-3 text-xs leading-relaxed text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Send className="size-4" />
          </span>
          <p className="min-w-0 flex-1">
            Every send is charged from your NGN wallet and recorded here. A failed delivery is
            refunded automatically, and each message states that it is a simulation of your own
            template.
          </p>
          <Link
            to="/wallet/fund"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            Wallet <ArrowRight className="size-3" />
          </Link>
        </CardContent>
      </Card>

      {active && overview ? (
        <Composer
          template={active}
          brand={overview.brand}
          platformName={overview.platformName}
          recipientEmail={overview.recipientEmail}
          priceNgn={overview.pricing.priceNgn}
          balanceNgn={overview.balanceNgn}
          templates={templates}
          onClose={() => setActive(null)}
          onSent={() => void load()}
        />
      ) : null}
    </motion.div>
  );
}
