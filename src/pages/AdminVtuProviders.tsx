import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminPageHeader, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Admin management for VTU providers.
 *
 * The load-bearing rule of this screen: the API key and webhook secret are
 * WRITE-ONLY. Once saved they are never fetched, never rendered, and never
 * held in component state. The list query returns `hasApiKey` /
 * `hasWebhookSecret` booleans and nothing else.
 *
 * This is not a display preference. Convex subscriptions stream query results
 * to every subscribed browser, so a credential in a query result is a
 * credential in every admin's page source and in the browser devtools of
 * anyone who ever opens this page.
 */

type Status = "active" | "sandbox" | "disabled";

/**
 * The closed auth-scheme enum, mirrored from the schema.
 *
 * A dropdown rather than a free-text field on purpose: a typo in an auth
 * scheme produces a well-formed request carrying a nonsense header, which the
 * provider answers with a 401 that reads like a bad key. Making the bad value
 * unselectable removes that whole class of incident.
 */
type AuthScheme = "" | "bearer" | "basic";

/**
 * `Select.Item` forbids an empty-string value, so the raw-token option is
 * carried in the DOM as `raw` and mapped back to `""` on the way in and out.
 * The value that reaches the server is always the real enum member.
 */
const AUTH_SCHEME_OPTIONS: { value: string; label: string; scheme: AuthScheme }[] = [
  { value: "raw", label: "Raw token", scheme: "" },
  { value: "bearer", label: "Bearer", scheme: "bearer" },
  { value: "basic", label: "Basic", scheme: "basic" },
];

const authSchemeToSelect = (scheme: AuthScheme) =>
  AUTH_SCHEME_OPTIONS.find((o) => o.scheme === scheme)?.value ?? "raw";
const selectToAuthScheme = (value: string): AuthScheme =>
  AUTH_SCHEME_OPTIONS.find((o) => o.value === value)?.scheme ?? "";

const AUTH_SCHEME_HINT: Record<AuthScheme, string> = {
  "": "Sends the token as-is, e.g. x-api-key: <token>.",
  bearer: "Sends Authorization: Bearer <token>.",
  basic: "Sends Authorization: Basic <token>. The token must already be base64.",
};

type ProviderRow = {
  _id: string;
  name: string;
  displayName: string;
  status: Status;
  active: boolean;
  baseUrl: string;
  healthPath: string | null;
  authHeader: string | null;
  authScheme: AuthScheme;
  callbackSignatureHeader: string | null;
  timeoutMs: number | null;
  priority: number;
  lastTestedAt: number | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  hasAccountPin: boolean;
  updatedAt: number;
};

const STATUS_BADGE: Record<Status, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  sandbox: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  disabled: "bg-muted text-muted-foreground border-border",
};

const STATUS_HINT: Record<Status, string> = {
  active: "Live. New purchases route here.",
  sandbox: "Test keys. New purchases are refused; webhooks still verify.",
  disabled: "Off. New purchases route away — in-flight transactions still complete.",
};

type Draft = {
  name: string;
  displayName: string;
  baseUrl: string;
  healthPath: string;
  authHeader: string;
  authScheme: AuthScheme;
  callbackSignatureHeader: string;
  priority: string;
  status: Status;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  displayName: "",
  baseUrl: "",
  healthPath: "",
  authHeader: "x-api-key",
  authScheme: "",
  callbackSignatureHeader: "x-pairgate-signature",
  priority: "100",
  status: "disabled",
};

export default function AdminVtuProviders() {
  const providers = useQuery(api.vtuProviderAdmin.listProviders, {});
  const createProvider = useMutation(api.vtuProviderAdmin.createProvider);
  const updateProvider = useMutation(api.vtuProviderAdmin.updateProvider);
  const setStatus = useMutation(api.vtuProviderAdmin.setProviderStatus);
  const deleteProvider = useMutation(api.vtuProviderAdmin.deleteProvider);
  const migrate = useMutation(api.vtuProviderAdmin.migratePairgateFromEnv);
  const testConnection = useAction(api.vtuProviderCall.testProviderConnection);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  // Transient per-row test result. Holds NO credential, only ok/latency/error.
  const [testing, setTesting] = useState<Record<string, "busy">>({});
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; latencyMs?: number; error?: string }>
  >({});

  // Secrets live ONLY in these transient fields, only while the form is
  // open, and are cleared on close. They are never read back from the server.
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [accountPin, setAccountPin] = useState("");
  // "Replace key" is an explicit opt-in, so saving an unrelated edit never
  // re-writes the credential.
  const [replaceApiKey, setReplaceApiKey] = useState(false);
  const [replaceWebhookSecret, setReplaceWebhookSecret] = useState(false);
  const [replaceAccountPin, setReplaceAccountPin] = useState(false);

  const target = useMemo(
    () => (providers ?? []).find((p) => p.name === editing) ?? null,
    [providers, editing],
  );

  function openCreate() {
    setEditing("__new__");
    setDraft(EMPTY_DRAFT);
    setApiKey("");
    setWebhookSecret("");
    setAccountPin("");
    setReplaceApiKey(false);
    setReplaceWebhookSecret(false);
    setReplaceAccountPin(false);
  }

  function openEdit(row: ProviderRow) {
    setEditing(row.name);
    setDraft({
      name: row.name,
      displayName: row.displayName,
      baseUrl: row.baseUrl,
      healthPath: row.healthPath ?? "",
      authHeader: row.authHeader ?? "",
      authScheme: row.authScheme,
      callbackSignatureHeader: row.callbackSignatureHeader ?? "",
      priority: String(row.priority),
      status: row.status,
    });
    setApiKey("");
    setWebhookSecret("");
    setAccountPin("");
    setReplaceApiKey(false);
    setReplaceWebhookSecret(false);
    setReplaceAccountPin(false);
  }

  function closeForm() {
    setEditing(null);
    // Clear the transient plaintext on the way out.
    setApiKey("");
    setWebhookSecret("");
    setAccountPin("");
    setReplaceApiKey(false);
    setReplaceWebhookSecret(false);
    setReplaceAccountPin(false);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing === "__new__") {
        await createProvider({
          name: draft.name.trim().toLowerCase(),
          displayName: draft.displayName.trim() || draft.name,
          baseUrl: draft.baseUrl.trim(),
          apiKey: apiKey.trim(),
          webhookSecret: webhookSecret.trim() || undefined,
          status: draft.status,
          healthPath: draft.healthPath.trim() || undefined,
          authHeader: draft.authHeader.trim() || undefined,
          authScheme: draft.authScheme,
          callbackSignatureHeader: draft.callbackSignatureHeader.trim() || undefined,
          accountPin: accountPin.trim() || undefined,
          priority: Number(draft.priority) || 100,
        });
        toast.success("Provider created");
      } else if (target) {
        await updateProvider({
          name: target.name,
          displayName: draft.displayName,
          baseUrl: draft.baseUrl,
          status: draft.status,
          healthPath: draft.healthPath || undefined,
          authHeader: draft.authHeader || undefined,
          authScheme: draft.authScheme,
          callbackSignatureHeader: draft.callbackSignatureHeader || undefined,
          accountPin:
            replaceAccountPin && accountPin.trim() ? accountPin.trim() : undefined,
          priority: Number(draft.priority) || 100,
          // Omitted unless the operator explicitly chose to replace, so an
          // unrelated edit never re-writes the credential.
          apiKey: replaceApiKey && apiKey.trim() ? apiKey.trim() : undefined,
          webhookSecret:
            replaceWebhookSecret && webhookSecret.trim()
              ? webhookSecret.trim()
              : undefined,
        });
        toast.success("Provider updated");
      }
      closeForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(row: ProviderRow, status: Status) {
    const reason =
      status === "disabled"
        ? "Disabled from admin"
        : status === "active"
          ? "Enabled for live routing"
          : "Moved to sandbox";
    try {
      await setStatus({ name: row.name, status, reason });
      toast.success(`${row.displayName} is now ${status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change status");
    }
  }

  async function runTest(name: string) {
    setTesting((prev) => ({ ...prev, [name]: "busy" }));
    try {
      const result = await testConnection({ name });
      // The result carries only a boolean, a latency and a short code.
      setTestResults((prev) => ({ ...prev, [name]: result }));
      if (result.ok) toast.success(`${name} responded in ${result.latencyMs}ms`);
      else toast.error(result.error ?? "Connection test failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test failed";
      setTestResults((prev) => ({ ...prev, [name]: { ok: false, error: message } }));
      toast.error(message);
    } finally {
      setTesting((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function runMigration() {
    setMigrating(true);
    try {
      const result = await migrate({});
      if (result.action === "inserted") {
        toast.success("Pairgate provider seeded from environment");
      } else if (result.action === "upgraded_legacy") {
        toast.success("Existing Pairgate row upgraded in place");
      } else {
        toast.info("Pairgate already configured — nothing changed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  }

  async function remove(row: ProviderRow) {
    const reason = window.prompt(
      `Delete ${row.displayName}? Enter a reason — this is audited.`,
    );
    if (!reason) return;
    try {
      await deleteProvider({ name: row.name, reason });
      toast.success("Provider deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  const isNew = editing === "__new__";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="VTU Providers"
        description="Aggregators are runtime data. Credentials are sealed with the platform master key and never displayed after save."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add provider
          </Button>
        }
      />

      <Reveal>
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">One-time Pairgate migration</p>
              <p className="text-sm text-muted-foreground">
                Seeds the Pairgate row from{" "}
                <code className="text-xs">PAIRGATE_API_KEY</code> and seals it.
                Re-running is a no-op and never overwrites an admin-set key. After
                it runs, those env vars are no longer read at runtime.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={runMigration}
              disabled={migrating}
              className="min-h-11 shrink-0 gap-2"
            >
              {migrating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Run migration
            </Button>
          </CardContent>
        </Card>
      </Reveal>

      {editing && (
        <Reveal>
          <Card className="border-primary/40">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">
                  {isNew ? "Add provider" : `Edit ${target?.displayName ?? ""}`}
                </h2>
                <Button variant="ghost" size="icon" onClick={closeForm} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Name</Label>
                  <Input
                    id="p-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    disabled={!isNew}
                    placeholder="pairgate"
                    className="min-h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must match the adapter's name. Lowercase, 2–32 characters.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-display">Display name</Label>
                  <Input
                    id="p-display"
                    value={draft.displayName}
                    onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                    placeholder="Pairgate"
                    className="min-h-11"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="p-base">Base URL</Label>
                  <Input
                    id="p-base"
                    value={draft.baseUrl}
                    onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                    placeholder="https://api.pairgate.com"
                    className="min-h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-health">Health path</Label>
                  <Input
                    id="p-health"
                    value={draft.healthPath}
                    onChange={(e) => setDraft({ ...draft, healthPath: e.target.value })}
                    placeholder="/api/v1/balance"
                    className="min-h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    The read-only endpoint "Test connection" GETs. Never a
                    purchase endpoint.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-auth">Auth header</Label>
                  <Input
                    id="p-auth"
                    value={draft.authHeader}
                    onChange={(e) => setDraft({ ...draft, authHeader: e.target.value })}
                    placeholder="x-api-key"
                    className="min-h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Auth scheme</Label>
                  <Select
                    value={authSchemeToSelect(draft.authScheme)}
                    onValueChange={(v) =>
                      setDraft({ ...draft, authScheme: selectToAuthScheme(v) })
                    }
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTH_SCHEME_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {AUTH_SCHEME_HINT[draft.authScheme]}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-sig">Webhook signature header</Label>
                  <Input
                    id="p-sig"
                    value={draft.callbackSignatureHeader}
                    onChange={(e) =>
                      setDraft({ ...draft, callbackSignatureHeader: e.target.value })
                    }
                    placeholder="x-pairgate-signature"
                    className="min-h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-priority">Priority</Label>
                  <Input
                    id="p-priority"
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                    className="min-h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower runs first. Used by per-product routing.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) => setDraft({ ...draft, status: v as Status })}
                  >
                    <SelectTrigger className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active — live</SelectItem>
                      <SelectItem value="sandbox">Sandbox — test keys</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{STATUS_HINT[draft.status]}</p>
                </div>
              </div>

              {/* ── Write-only credentials ─────────────────────────── */}
              <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-2">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Credentials are sealed before they are stored and are never
                    displayed again. Leave blank to keep the existing value.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-key">API key</Label>
                  {target?.hasApiKey && !replaceApiKey ? (
                    <div className="flex items-center gap-3">
                      <Input
                        value="••••••••••••"
                        readOnly
                        aria-label="API key stored"
                        className="min-h-11 font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReplaceApiKey(true)}
                        className="min-h-11 shrink-0 gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Replace key
                      </Button>
                    </div>
                  ) : (
                    <Input
                      id="p-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={target?.hasApiKey ? "Enter the new key" : "Required"}
                      autoComplete="off"
                      className="min-h-11 font-mono"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-secret">Webhook secret</Label>
                  {target?.hasWebhookSecret && !replaceWebhookSecret ? (
                    <div className="flex items-center gap-3">
                      <Input
                        value="••••••••••••"
                        readOnly
                        aria-label="Webhook secret stored"
                        className="min-h-11 font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReplaceWebhookSecret(true)}
                        className="min-h-11 shrink-0 gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Replace secret
                      </Button>
                    </div>
                  ) : (
                    <Input
                      id="p-secret"
                      type="password"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="Optional — required to verify webhooks"
                      autoComplete="off"
                      className="min-h-11 font-mono"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="p-pin">Account PIN</Label>
                  {target?.hasAccountPin && !replaceAccountPin ? (
                    <div className="flex items-center gap-3">
                      <Input
                        value="••••••••••••"
                        readOnly
                        aria-label="Account PIN stored"
                        className="min-h-11 font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReplaceAccountPin(true)}
                        className="min-h-11 shrink-0 gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Replace PIN
                      </Button>
                    </div>
                  ) : (
                    <Input
                      id="p-pin"
                      type="password"
                      inputMode="numeric"
                      value={accountPin}
                      onChange={(e) => setAccountPin(e.target.value)}
                      placeholder="Optional — only for aggregators that require one"
                      autoComplete="off"
                      className="min-h-11 font-mono"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    A provider-level transaction PIN, sent on every purchase.
                    Sealed separately from the API key so either can be rotated
                    on its own. Leave blank for providers that have no
                    equivalent.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={save} disabled={saving} className="min-h-11 gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isNew ? "Create provider" : "Save changes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeForm}
                  className="min-h-11"
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {providers === undefined ? (
        <AdminSkeleton />
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Activity className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">No providers configured</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Run the Pairgate migration above to seed your first provider, or
              add one manually. Airtime purchases fail with a typed error until
              a provider is active.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {providers.map((row) => {
            const result = testResults[row.name];
            return (
              <Card key={row._id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{row.displayName}</h3>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.name}
                        </code>
                        <Badge variant="outline" className={cn(STATUS_BADGE[row.status])}>
                          {row.status}
                        </Badge>
                        {!row.hasApiKey && (
                          <Badge variant="outline" className="border-destructive/30 text-destructive">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            no key
                          </Badge>
                        )}
                        {row.authScheme !== "" && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            {row.authScheme}
                          </Badge>
                        )}
                        {row.hasAccountPin && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            <KeyRound className="mr-1 h-3 w-3" />
                            PIN
                          </Badge>
                        )}
                      </div>
                      <p className="break-anywhere text-xs text-muted-foreground">
                        {row.baseUrl || "No base URL"}
                        {row.healthPath ? ` · health ${row.healthPath}` : " · no health path"}
                        {` · auth ${row.authHeader ?? "x-api-key"}${
                          row.authScheme ? ` (${row.authScheme})` : ""
                        }`}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runTest(row.name)}
                        disabled={testing[row.name] === "busy"}
                        className="min-h-11 gap-2"
                      >
                        {testing[row.name] === "busy" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Activity className="h-4 w-4" />
                        )}
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(row)}
                        className="min-h-11 gap-2"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove(row)}
                        className="min-h-11 gap-2 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Test result: ok / fail and latency only. No credential. */}
                  {result && (
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-2.5 text-xs",
                        result.ok
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-destructive/25 bg-destructive/10 text-destructive",
                      )}
                      role="status"
                    >
                      {result.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {result.ok
                          ? `Reachable in ${result.latencyMs}ms`
                          : (result.error ?? "Failed")}
                      </span>
                    </div>
                  )}

                  {/* Disable semantics, stated where the decision is made. */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      Routing:
                    </span>
                    {(["active", "sandbox", "disabled"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => changeStatus(row, status)}
                        disabled={row.status === status}
                        className={cn(
                          "min-h-11 rounded-md border px-3 text-xs font-medium transition-colors",
                          row.status === status
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        {status}
                      </button>
                    ))}
                    <span className="text-xs text-muted-foreground">
                      {STATUS_HINT[row.status]}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Last test{" "}
                    {row.lastTestedAt ? fmtDate(row.lastTestedAt) : "never"}
                    {row.lastTestOk === false && row.lastTestError
                      ? ` — ${row.lastTestError}`
                      : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Reveal>
        <Card className="border-muted">
          <CardContent className="flex items-start gap-3 p-5">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Stored keys are sealed with AES-256-GCM under{" "}
              <code className="text-xs">APP_MASTER_KEY</code> and are opened only
              inside the action that makes the provider call. No query ever
              returns them — the list above reports booleans, not values.
            </p>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}
