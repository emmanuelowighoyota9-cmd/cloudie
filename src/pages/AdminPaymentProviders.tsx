import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Webhook,
  CreditCard,
  Shield,
  Trash2,
  RefreshCw,
  Info,
} from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, AdminSkeleton } from "@/components/admin/shared";
import { motion } from "framer-motion";

/**
 * Convex serves HTTP endpoints — including the Paystack webhook — from the
 * deployment's `.site` domain, not the website origin. Deriving it from the
 * Convex URL keeps the copied webhook correct in preview and production.
 */
function convexSiteOrigin(): string {
  const cloud = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
  if (cloud) {
    return cloud.replace(/\/+$/, "").replace(/\.convex\.cloud$/, ".convex.site");
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

const PAYSTACK_KEYS = [
  {
    key: "paystack_secret_key",
    label: "Secret Key",
    description: "Used for server-side API calls (initialize payments, verify transactions). Never share this.",
    isSecret: true,
    required: true,
  },
  {
    key: "paystack_public_key",
    label: "Public Key",
    description: "Used for client-side Paystack.js initialization. Safe to expose.",
    isSecret: false,
    required: true,
  },
  {
    key: "paystack_test_secret",
    label: "Test Secret Key",
    description: "For testing mode. Use sk_test_... keys from Paystack test dashboard.",
    isSecret: true,
    required: false,
  },
  {
    key: "paystack_test_public",
    label: "Test Public Key",
    description: "For testing mode. Use pk_test_... keys from Paystack test dashboard.",
    isSecret: false,
    required: false,
  },
  {
    key: "paystack_webhook_secret",
    label: "Webhook Signing Secret",
    description: "Used to verify incoming webhook signatures from Paystack.",
    isSecret: true,
    required: false,
  },
];

function KeyInput({
  config,
  stored,
  onSave,
  onDelete,
  saving,
}: {
  config: typeof PAYSTACK_KEYS[0];
  stored: {
    key: string;
    isSet: boolean;
    masked: string;
    updatedAt: number | null;
    /** Which value is actually live — dashboard-saved or project environment. */
    source?: string;
  } | undefined;
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  saving: string | null;
}) {
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{config.label}</p>
            {config.required && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Required</Badge>
            )}
            {stored?.isSet ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-0 text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-500">
                Not set
              </Badge>
            )}
            {stored?.source === "environment" && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
              >
                Project environment
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{config.description}</p>
          {stored?.source === "environment" && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              Supplied through the project environment, which the payment runtime reads first — a
              value saved here would not take effect while it is set.
            </p>
          )}
          {stored?.isSet && (
            <div className="mt-2 flex items-center gap-2">
              <code className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                {stored.masked}
              </code>
              {stored.updatedAt && (
                <span className="text-[10px] text-slate-400">
                  Updated {new Date(stored.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-slate-500">
            {stored?.isSet ? "Enter new value to update" : "Enter value"}
          </Label>
          <div className="relative">
            <Input
              type={showValue ? "text" : (config.isSecret ? "password" : "text")}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={stored?.isSet ? "••••••••••••••••" : `Enter ${config.label.toLowerCase()}`}
              className="pr-9"
            />
            {config.isSecret && (
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!value.trim() || saving === config.key}
            onClick={async () => {
              await onSave(config.key, value.trim());
              setValue("");
            }}
          >
            {saving === config.key ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            {stored?.isSet ? "Update" : "Save"}
          </Button>
          {stored?.isSet && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              disabled={saving === config.key}
              onClick={async () => {
                await onDelete(config.key);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminPaymentProviders() {
  const keys = useQuery(api.admin.getPaymentProviderKeys);
  const saveKey = useMutation(api.admin.savePaymentProviderKey);
  const deleteKey = useMutation(api.admin.deletePaymentProviderKey);
  const [saving, setSaving] = useState<string | null>(null);

  const keysByType = PAYSTACK_KEYS.map((config) => ({
    config,
    stored: keys?.find((k) => k.key === config.key),
  }));

  const allRequiredSet = PAYSTACK_KEYS.filter((k) => k.required).every(
    (k) => keys?.find((s) => s.key === k.key)?.isSet
  );

  const handleSave = async (key: string, value: string) => {
    setSaving(key);
    try {
      await saveKey({ key, value });
      toast.success(`${key.replace("paystack_", "")} saved successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (key: string) => {
    setSaving(key);
    try {
      await deleteKey({ key });
      toast.success(`${key.replace("paystack_", "")} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(null);
    }
  };

  // The webhook is hosted by Convex, while the checkout callback returns the
  // buyer to the app. Paystack needs each of these separately.
  const webhookUrl = `${convexSiteOrigin()}/api/webhooks/paystack`;
  const callbackUrl = `${
    typeof window !== "undefined" ? window.location.origin : ""
  }/buy-points`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payment Providers"
        description="Configure Paystack API keys for processing payments. Keys are stored securely and never exposed in responses."
        actions={
          <Badge variant={allRequiredSet ? "default" : "destructive"} className="gap-1">
            {allRequiredSet ? (
              <><CheckCircle2 className="h-3 w-3" /> Ready</>
            ) : (
              <><AlertTriangle className="h-3 w-3" /> Setup Required</>
            )}
          </Badge>
        }
      />

      {/* Status Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30">
                <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Paystack</p>
                <p className="text-xs text-slate-500">Payment Gateway</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Security</p>
                <p className="text-xs text-slate-500">Keys encrypted at rest</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${allRequiredSet ? "bg-green-50 dark:bg-green-900/30" : "bg-amber-50 dark:bg-amber-900/30"}`}>
                <KeyRound className={`h-5 w-5 ${allRequiredSet ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {keys?.filter((k) => k.isSet).length ?? 0} / {PAYSTACK_KEYS.length}
                </p>
                <p className="text-xs text-slate-500">Keys configured</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Setup */}
      {!allRequiredSet && (
        <Card className="rounded-xl border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Quick Setup Guide</p>
                <ol className="mt-2 space-y-1 text-xs text-blue-700 dark:text-blue-400 list-decimal list-inside">
                  <li>Create a Paystack account at <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer" className="underline">dashboard.paystack.com</a></li>
                  <li>Navigate to Settings &rarr; API Keys & Webhooks</li>
                  <li>Copy your <strong>Secret Key</strong> and <strong>Public Key</strong></li>
                  <li>Paste them above and click Save</li>
                  <li>Configure the webhook URL below in your Paystack dashboard</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Configuration */}
      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <KeyRound className="h-4 w-4 text-slate-500" /> API Keys
          </CardTitle>
          <p className="text-xs text-slate-500">
            Enter your Paystack API keys. These are stored encrypted and used for payment processing.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {keys === undefined ? (
            <AdminSkeleton rows={4} />
          ) : (
            keysByType.map(({ config, stored }) => (
              <KeyInput
                key={config.key}
                config={config}
                stored={stored}
                onSave={handleSave}
                onDelete={handleDelete}
                saving={saving}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <Webhook className="h-4 w-4 text-slate-500" /> Live URLs
          </CardTitle>
          <p className="text-xs text-slate-500">
            Paste these exact values into Paystack — both are required for live payments to settle
            and be credited automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="text-xs text-slate-500">
              Webhook URL — Paystack → Settings → API Keys &amp; Webhooks → Webhook URL
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {webhookUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(webhookUrl)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Served by your Convex deployment, not the website domain. Pointing this at the app URL
              means live payments are never confirmed or credited.
            </p>
          </div>

          <div>
            <Label className="text-xs text-slate-500">
              Checkout callback URL — where Paystack returns the buyer
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {callbackUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(callbackUrl)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Sent automatically with every checkout, so no dashboard change is required — if
              Paystack asks for a callback URL, use this value.
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950/20 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <p className="font-medium">Important</p>
                <p className="mt-1">
                  You must configure this webhook URL in your Paystack dashboard under
                  Settings &rarr; API Keys &rarr; Webhook URL. The webhook verifies payment
                  signatures and auto-credits points to users.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open("https://dashboard.paystack.com/#/settings/developer", "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Paystack Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
