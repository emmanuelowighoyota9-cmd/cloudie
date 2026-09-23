import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Server,
  Trash2,
} from "lucide-react";
import { AdminEmpty, AdminPageHeader, AdminSkeleton, StatusBadge, fmtDate } from "@/components/admin/shared";

/**
 * Admin → Email Settings.
 *
 * The Elastic Email connection is configured here, not in env files. The API key
 * is submitted once, sealed server-side, and never returned to this page again —
 * reopening the page only ever shows bullets.
 */

type FormValues = {
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  testRecipient: string;
};

type SmtpValues = { host: string; port: string; secure: boolean; username: string };

type StatusKey =
  | "not_configured"
  | "disabled"
  | "unverified"
  | "connected"
  | "invalid_key"
  | "sender_error"
  | "provider_error";

const STATUS_META: Record<StatusKey, { label: string; dot: string; text: string; tone: string }> = {
  not_configured: {
    label: "Not configured",
    dot: "bg-slate-400",
    text: "text-slate-500 dark:text-slate-400",
    tone: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  disabled: {
    label: "Disabled",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  unverified: {
    label: "Configured · not verified",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    tone: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  },
  connected: {
    label: "Connected",
    dot: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    tone: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300",
  },
  invalid_key: {
    label: "Invalid API key",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  },
  sender_error: {
    label: "Sender / domain problem",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  },
  provider_error: {
    label: "Provider error",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  },
};

export default function AdminEmailSettings() {
  const settings = useQuery(api.emailAdmin.getEmailSettings);
  const stats = useQuery(api.emailAdmin.getEmailDeliveryStats);
  const logs = useQuery(api.emailAdmin.listEmailLogs, { limit: 25 });

  const saveConfig = useMutation(api.emailAdmin.saveConfig);
  const saveApiKey = useAction(api.email.saveApiKey);
  const clearApiKey = useAction(api.email.clearApiKey);
  const saveTransportConfig = useAction(api.email.saveTransportConfig);
  const saveSmtpPassword = useAction(api.email.saveSmtpPassword);
  const clearSmtpPassword = useAction(api.email.clearSmtpPassword);
  const refreshStatus = useAction(api.email.refreshEmailStatus);
  const sendTestEmail = useAction(api.email.sendTestEmail);

  /**
   * Local edits layer on top of the reactive server snapshot instead of copying
   * it into state: the form always reflects the latest server values until the
   * administrator types something, and clearing the draft (on save) hands
   * control back to the server.
   */
  const [draft, setDraft] = useState<FormValues | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [smtpDraft, setSmtpDraft] = useState<SmtpValues | null>(null);
  const [transportDraft, setTransportDraft] = useState<"api" | "smtp" | null>(null);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [replacingSmtp, setReplacingSmtp] = useState(false);
  const [busy, setBusy] = useState<
    "save" | "key" | "test" | "status" | "clear" | "transport" | "smtp" | "clearSmtp" | null
  >(null);

  const form = useMemo<FormValues>(
    () => ({
      enabled: draft?.enabled ?? settings?.enabled ?? false,
      fromEmail: draft?.fromEmail ?? settings?.fromEmail ?? "",
      fromName: draft?.fromName ?? settings?.fromName ?? "",
      replyToEmail: draft?.replyToEmail ?? settings?.replyToEmail ?? "",
      testRecipient: draft?.testRecipient ?? settings?.testRecipient ?? "",
    }),
    [draft, settings],
  );

  const update = (patch: Partial<FormValues>) => setDraft({ ...form, ...patch });

  const smtp = useMemo<SmtpValues>(
    () => ({
      host: smtpDraft?.host ?? settings?.smtpHost ?? "smtp.elasticemail.com",
      port: smtpDraft?.port ?? String(settings?.smtpPort ?? 2525),
      secure: smtpDraft?.secure ?? settings?.smtpSecure ?? false,
      username: smtpDraft?.username ?? settings?.smtpUsername ?? "",
    }),
    [smtpDraft, settings],
  );
  const updateSmtp = (patch: Partial<SmtpValues>) => setSmtpDraft({ ...smtp, ...patch });
  const transport: "api" | "smtp" = transportDraft ?? (settings?.transport === "smtp" ? "smtp" : "api");

  if (settings === undefined || stats === undefined) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Email Settings" description="Loading transactional email configuration…" />
        <AdminSkeleton rows={5} />
      </div>
    );
  }

  const meta = STATUS_META[(settings.status as StatusKey) ?? "not_configured"] ?? STATUS_META.not_configured;
  const keyConfigured = settings.apiKeyConfigured;
  const needsFirstTimeSetup = !keyConfigured || !settings.fromEmail || !settings.fromName;

  const handleSaveConfig = async () => {
    setBusy("save");
    try {
      await saveConfig({
        enabled: form.enabled,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        replyToEmail: form.replyToEmail.trim() || undefined,
        testRecipient: form.testRecipient.trim() || undefined,
      });
      toast.success("Email configuration saved");
      setDraft(null);
      void refreshStatus({}).catch(() => undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save configuration");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      toast.error("Paste your Elastic Email API key first");
      return;
    }
    setBusy("key");
    try {
      const result = await saveApiKey({ apiKey: apiKey.trim() });
      setApiKey("");
      setShowKey(false);
      setReplacing(false);
      if (result.status === "connected") toast.success(result.message);
      else toast.warning(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the API key");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveTransport = async () => {
    setBusy("transport");
    try {
      const result = await saveTransportConfig({
        transport,
        smtpHost: smtp.host.trim() || undefined,
        smtpPort: Number(smtp.port) || undefined,
        smtpSecure: smtp.secure,
        smtpUsername: smtp.username.trim() || undefined,
      });
      setTransportDraft(null);
      setSmtpDraft(null);
      if (result.success) toast.success(result.message);
      else toast.warning(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the transport settings");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveSmtpPassword = async () => {
    if (!smtpPassword.trim()) {
      toast.error("Paste the SMTP password issued by your provider first");
      return;
    }
    setBusy("smtp");
    try {
      const result = await saveSmtpPassword({
        password: smtpPassword.trim(),
        username: smtp.username.trim(),
        smtpHost: smtp.host.trim(),
        smtpPort: Number(smtp.port) || undefined,
        smtpSecure: smtp.secure,
      });
      setSmtpPassword("");
      setShowSmtpPassword(false);
      setReplacingSmtp(false);
      setSmtpDraft(null);
      if (result.success) toast.success(result.message);
      else toast.warning(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the SMTP credentials");
    } finally {
      setBusy(null);
    }
  };

  const handleClearSmtpPassword = async () => {
    setBusy("clearSmtp");
    try {
      await clearSmtpPassword({});
      toast.success("SMTP password removed");
      setReplacingSmtp(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the SMTP password");
    } finally {
      setBusy(null);
    }
  };

  const handleClearKey = async () => {
    setBusy("clear");
    try {
      await clearApiKey({});
      toast.success("API key removed");
      setReplacing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the API key");
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setBusy("status");
    try {
      const result = await refreshStatus({});
      if (result.status === "connected") toast.success(result.message);
      else toast.warning(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status check failed");
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    const recipient = form.testRecipient.trim();
    if (!recipient) {
      toast.error("Enter a test recipient email address");
      return;
    }
    setBusy("test");
    try {
      const result = await sendTestEmail({ recipient });
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test email failed");
    } finally {
      setBusy(null);
    }
  };

  const showKeyForm = replacing || !keyConfigured;
  const smtpConfigured = settings.smtpPasswordConfigured;
  const showSmtpPasswordForm = replacingSmtp || !smtpConfigured;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Email Settings"
        description="Elastic Email powers every transactional message, over its HTTP API or its SMTP relay. Credentials are encrypted at rest and never returned to the browser."
        actions={
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={busy !== null} className="gap-1.5">
            {busy === "status" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh status
          </Button>
        }
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
        {/* ── Provider status ───────────────────────────────────────────── */}
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{settings.providerLabel}</p>
                  <p className={`flex items-center gap-1.5 text-xs ${meta.text}`}>
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={meta.tone}>
                  Provider: {meta.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    settings.enabled
                      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }
                >
                  Transactional email: {settings.enabled ? "ON" : "OFF"}
                </Badge>
              </div>
            </div>

            {settings.statusMessage && <p className="text-xs text-slate-500 dark:text-slate-400">{settings.statusMessage}</p>}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusTile label="Last successful test" value={settings.lastTestStatus === "success" ? fmtDate(settings.lastTestAt) : "—"} />
              <StatusTile
                label="Last failure"
                value={settings.lastError ? fmtDate(settings.lastErrorAt) : "—"}
                tone={settings.lastError ? "danger" : undefined}
                hint={settings.lastError ?? undefined}
              />
              <StatusTile label="Last verified" value={fmtDate(settings.lastVerifiedAt)} />
              <StatusTile
                label="Active transport"
                value={transport === "smtp" ? `SMTP · ${settings.smtpHost}:${settings.smtpPort}` : "HTTP API"}
                hint={transport === "smtp" ? (settings.smtpSecure ? "Implicit TLS" : "STARTTLS") : "Elastic Email v4 API"}
              />
              <StatusTile
                label="Deliveries (last 500)"
                value={`${stats.sent} sent · ${stats.failed} failed`}
                hint={`${stats.queued} queued · ${stats.bounced} bounced`}
              />
            </div>

            <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
              Status is determined server-side. "Connected" is only reported after a real verification against Elastic Email — a stored key on
              its own never counts as connected.
            </p>
          </CardContent>
        </Card>

        {/* ── API key ───────────────────────────────────────────────────── */}
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Elastic Email API key
              {transport === "smtp" && (
                <Badge variant="outline" className="border-slate-200 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Not in use — SMTP relay is active
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stored encrypted (AES-256-GCM) on the server only. It is never sent back to the browser, never logged, and never placed in a URL.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {keyConfigured && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {settings.apiKeyMasked}
                    </code>
                    <Badge
                      variant="outline"
                      className="border-green-200 bg-green-50 text-[10px] text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
                    </Badge>
                    {settings.apiKeySource === "environment" && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                      >
                        Project environment ({settings.apiKeyEnvVar})
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {settings.apiKeySource === "environment"
                      ? "The live key comes from the deployment environment, which the runtime reads first. Saving a key here will not take effect while that variable is set."
                      : "The full key is not retrievable. Replace it to rotate credentials."}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReplacing(true)} disabled={busy !== null || replacing}>
                  <RotateCcw className="h-3.5 w-3.5" /> Replace API key
                </Button>
              </div>
            )}

            {replacing && keyConfigured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                Replacing the key overwrites the stored credential. The previous value cannot be recovered — this action is recorded in the audit
                log.
              </div>
            )}

            {showKeyForm ? (
              <div className="space-y-2">
                <Label htmlFor="elastic-key" className="text-xs text-slate-600 dark:text-slate-400">
                  {keyConfigured ? "New API key" : "Elastic Email API key"}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Input
                      id="elastic-key"
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste the API key from Elastic Email → Settings → API keys"
                      autoComplete="off"
                      spellCheck={false}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button className="gap-1.5" onClick={handleSaveKey} disabled={busy !== null || !apiKey.trim()}>
                      {busy === "key" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Save &amp; verify
                    </Button>
                    {replacing && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReplacing(false);
                          setApiKey("");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  The key is verified against Elastic Email immediately after saving. Visibility is limited to the moment you paste it — the saved
                  value is never displayed again.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={handleClearKey}
                  disabled={busy !== null}
                >
                  {busy === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Remove stored key
                </Button>
                {settings.encryptionKeySource === "auto" && (
                  <span className="text-[11px] text-slate-400">
                    Credential encryption uses a deployment key generated on first use. Set EMAIL_CREDENTIAL_ENCRYPTION_KEY to control it.
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Delivery transport ────────────────────────────────────────── */}
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
              <Server className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Delivery transport
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Elastic Email accepts either its HTTP API (an API key) or its SMTP relay (a server-issued username and password). Choose which one
              carries platform mail — only the active transport is used for sending and verification.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={transport}
              onValueChange={(v) => setTransportDraft(v === "smtp" ? "smtp" : "api")}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label
                htmlFor="transport-api"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  transport === "api"
                    ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                }`}
              >
                <RadioGroupItem value="api" id="transport-api" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">HTTP API</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Send with an Elastic Email API key. Verified against the account endpoint.
                  </p>
                </div>
              </label>
              <label
                htmlFor="transport-smtp"
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  transport === "smtp"
                    ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                }`}
              >
                <RadioGroupItem value="smtp" id="transport-smtp" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">SMTP relay</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Send through the relay with a username and password. Verified by opening a real session.
                  </p>
                </div>
              </label>
            </RadioGroup>

            {transport === "smtp" && (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-host" className="text-xs text-slate-600 dark:text-slate-400">
                      SMTP server
                    </Label>
                    <Input
                      id="smtp-host"
                      value={smtp.host}
                      onChange={(e) => updateSmtp({ host: e.target.value })}
                      placeholder="smtp.elasticemail.com"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port" className="text-xs text-slate-600 dark:text-slate-400">
                      Port
                    </Label>
                    <Input
                      id="smtp-port"
                      inputMode="numeric"
                      value={smtp.port}
                      onChange={(e) => updateSmtp({ port: e.target.value.replace(/[^0-9]/g, "") })}
                      placeholder="2525"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-username" className="text-xs text-slate-600 dark:text-slate-400">
                      SMTP username
                    </Label>
                    <Input
                      id="smtp-username"
                      value={smtp.username}
                      onChange={(e) => updateSmtp({ username: e.target.value })}
                      placeholder="account@yourdomain.com"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex items-end gap-3 pb-1">
                    <Switch checked={smtp.secure} onCheckedChange={(v) => updateSmtp({ secure: v })} id="smtp-secure" />
                    <div>
                      <Label htmlFor="smtp-secure" className="text-xs text-slate-600 dark:text-slate-400">
                        Implicit TLS (port 465)
                      </Label>
                      <p className="text-[11px] text-slate-400">Leave off for 2525 / 587 — those upgrade with STARTTLS.</p>
                    </div>
                  </div>
                </div>

                {smtpConfigured && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {settings.smtpPasswordMasked}
                        </code>
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-[10px] text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Password saved
                        </Badge>
                        {settings.smtpPasswordSource === "environment" && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                          >
                            Project environment ({settings.smtpPasswordEnvVar})
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Sealed with AES-256-GCM on the server. The full password is not retrievable — replace it to rotate.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReplacingSmtp(true)} disabled={busy !== null || replacingSmtp}>
                      <RotateCcw className="h-3.5 w-3.5" /> Replace password
                    </Button>
                  </div>
                )}

                {showSmtpPasswordForm ? (
                  <div className="space-y-2">
                    <Label htmlFor="smtp-password" className="text-xs text-slate-600 dark:text-slate-400">
                      {smtpConfigured ? "New SMTP password" : "SMTP password"}
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <Input
                          id="smtp-password"
                          type={showSmtpPassword ? "text" : "password"}
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                          placeholder="Paste the password shown when the SMTP credential was created"
                          autoComplete="off"
                          spellCheck={false}
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          aria-label={showSmtpPassword ? "Hide SMTP password" : "Show SMTP password"}
                        >
                          {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <Button className="gap-1.5" onClick={handleSaveSmtpPassword} disabled={busy !== null || !smtpPassword.trim()}>
                          {busy === "smtp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Save &amp; verify
                        </Button>
                        {replacingSmtp && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setReplacingSmtp(false);
                              setSmtpPassword("");
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Provider-issued SMTP passwords are shown only once. Saving seals it, switches the transport to SMTP, and verifies the relay
                      immediately — the value is never displayed again.
                    </p>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400"
                    onClick={handleClearSmtpPassword}
                    disabled={busy !== null}
                  >
                    {busy === "clearSmtp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Remove stored password
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleSaveTransport} disabled={busy !== null} className="gap-1.5">
                {busy === "transport" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save transport &amp; verify
              </Button>
              <span className="text-[11px] text-slate-400">
                Active transport: <strong className="font-medium text-slate-600 dark:text-slate-300">{transport === "smtp" ? "SMTP relay" : "HTTP API"}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Sender configuration ──────────────────────────────────────── */}
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base text-slate-900 dark:text-white">
              <span>Sender &amp; delivery</span>
              <span className="flex items-center gap-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                Enable transactional email
                <Switch checked={form.enabled} onCheckedChange={(v) => update({ enabled: v })} aria-label="Enable transactional email" />
              </span>
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {form.enabled
                ? `Transactional email is ON. Platform flows (campaigns, notifications) dispatch through ${transport === "smtp" ? "the SMTP relay" : "the Elastic Email API"}.`
                : "While OFF, no sending is attempted and admin tests are blocked. Queued messages are refused with a logged reason rather than discarded silently."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {needsFirstTimeSetup && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                <p className="font-medium">Elastic Email is not configured.</p>
                <p className="mt-0.5">
                  Add credentials for the transport you selected above, fill in the sender details below, then save. Transactional email stays off until
                you enable it.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from-email" className="text-xs text-slate-600 dark:text-slate-400">
                  From email
                </Label>
                <Input
                  id="from-email"
                  type="email"
                  value={form.fromEmail}
                  onChange={(e) => update({ fromEmail: e.target.value })}
                  placeholder="no-reply@yourdomain.com"
                />
                <p className="text-[11px] text-slate-400">The sender must be a verified address or domain in Elastic Email.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-name" className="text-xs text-slate-600 dark:text-slate-400">
                  From name
                </Label>
                <Input id="from-name" value={form.fromName} onChange={(e) => update({ fromName: e.target.value })} placeholder="Cloudie" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reply-to" className="text-xs text-slate-600 dark:text-slate-400">
                  Reply-to email
                </Label>
                <Input
                  id="reply-to"
                  type="email"
                  value={form.replyToEmail}
                  onChange={(e) => update({ replyToEmail: e.target.value })}
                  placeholder="support@yourdomain.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-recipient" className="text-xs text-slate-600 dark:text-slate-400">
                  Test email recipient
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="test-recipient"
                    type="email"
                    value={form.testRecipient}
                    onChange={(e) => update({ testRecipient: e.target.value })}
                    placeholder="you@yourdomain.com"
                  />
                  <Button variant="outline" className="shrink-0 gap-1.5" onClick={handleTest} disabled={busy !== null}>
                    {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send test
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400">Sends a real message through Elastic Email and records the result.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSaveConfig} disabled={busy !== null} className="gap-1.5">
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save configuration
              </Button>
              <Button variant="outline" onClick={handleRefresh} disabled={busy !== null} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Re-verify connection
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Templates ─────────────────────────────────────────────────── */}
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Templates are controlled by application code</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Transactional templates (test, welcome, points, shipment updates) ship with the platform so no administrator can inject executable
                markup into platform mail. Campaign bodies authored by users are sanitized before delivery.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Delivery logs ─────────────────────────────────────────────── */}
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900 dark:text-white">Recent email deliveries</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Recipients are partially masked. Message bodies, tokens, and credentials are never displayed.
            </p>
          </CardHeader>
          <CardContent>
            {logs === undefined ? (
              <AdminSkeleton rows={3} />
            ) : logs.length === 0 ? (
              <AdminEmpty message="No email has been sent yet" hint="Send a test email to confirm your configuration." />
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-2 py-2 font-medium">Recipient</th>
                      <th className="px-2 py-2 font-medium">Type</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Provider</th>
                      <th className="px-2 py-2 font-medium">Sent</th>
                      <th className="px-2 py-2 font-medium">Provider message id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log._id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{log.recipient}</td>
                        <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">{log.emailType.replace(/_/g, " ")}</td>
                        <td className="px-2 py-2">
                          <StatusBadge status={log.status === "sent" ? "delivered" : log.status} />
                          {log.failureReason && <p className="mt-1 max-w-[240px] text-[11px] text-red-500">{log.failureReason}</p>}
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">{log.providerLabel}</td>
                        <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">{fmtDate(log.sentAt ?? log.createdAt)}</td>
                        <td className="max-w-[180px] truncate px-2 py-2 font-mono text-[11px] text-slate-400">{log.providerMessageId ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function StatusTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone === "danger" ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
