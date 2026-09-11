import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { KeyRound, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader, AdminSkeleton, fmtDate } from "@/components/admin/shared";

type SettingRow = { _id: string; key: string; value: unknown; category: string; updatedAt: number };

const CATEGORY_SECTIONS: { key: string; title: string; description: string; suggested: { key: string; type: "string" | "boolean" | "number"; placeholder?: string }[] }[] = [
  {
    key: "general",
    title: "General",
    description: "Platform name and public-facing basics.",
    suggested: [{ key: "platform_name", type: "string", placeholder: "Cloudie" }],
  },
  {
    key: "marketplace",
    title: "Marketplace",
    description: "Escrow hold behavior and marketplace toggles.",
    suggested: [
      { key: "marketplace_escrow_enabled", type: "boolean" },
      { key: "marketplace_auto_release_hours", type: "number", placeholder: "72" },
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    description: "In-app delivery controls.",
    suggested: [{ key: "notifications_inapp_enabled", type: "boolean" }],
  },
  {
    key: "security",
    title: "Security",
    description: "Session and throttling policies.",
    suggested: [
      { key: "admin_session_ttl_minutes", type: "number", placeholder: "120" },
      { key: "login_throttle_max_attempts", type: "number", placeholder: "10" },
    ],
  },
  {
    key: "payments",
    title: "Payments & Crypto",
    description: "Provider toggles. Secret keys are managed exclusively via environment configuration and are never stored here.",
    suggested: [
      { key: "payments_fiat_enabled", type: "boolean" },
      { key: "payments_crypto_enabled", type: "boolean" },
    ],
  },
  {
    key: "feature_flags",
    title: "Feature flags",
    description: "Incremental rollout switches.",
    suggested: [{ key: "flag_public_tracking", type: "boolean" }],
  },
];

export default function AdminSettings() {
  const settings = useQuery(api.adminApi.getSettings) as SettingRow[] | undefined;
  const upsert = useMutation(api.adminApi.upsertSetting);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const byKey = useMemo(() => new Map((settings ?? []).map((s) => [s.key, s])), [settings]);

  const saveValue = async (key: string, category: string, value: unknown) => {
    setSaving(key);
    try {
      await upsert({ key, value, category });
      toast.success(`Saved ${key}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const createSetting = async () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || !newVal.trim()) {
      toast.error("Provide a key and a value");
      return;
    }
    if (key.includes("secret") || key.includes("key") || key.includes("password") || key.includes("token")) {
      toast.error("Secret-looking keys are not allowed — manage credentials in the environment");
      return;
    }
    await saveValue(key, "custom", newVal.trim());
    setNewKey("");
    setNewVal("");
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform Settings"
        description="Non-secret runtime configuration. Every change is audited (SETTING_CHANGED). Credentials live in environment configuration only."
      />

      {settings === undefined ? (
        <AdminSkeleton rows={6} />
      ) : (
        <>
          {CATEGORY_SECTIONS.map((section) => {
            const saved = (settings ?? []).filter((s) => s.category === section.key);
            const suggestedKeys = section.suggested.map((s) => s.key);
            const extras = saved.filter((s) => !suggestedKeys.includes(s.key));
            return (
              <Card key={section.key} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-slate-900 dark:text-white">{section.title}</CardTitle>
                  <p className="text-xs text-slate-500">{section.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.suggested.map((s) => {
                    const row = byKey.get(s.key);
                    const isSecretMasked = typeof row?.value === "string" && row.value.includes("••••");
                    return (
                      <div key={s.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium text-slate-900 dark:text-white">{s.key}</p>
                          {row && <p className="text-[11px] text-slate-400">Updated {fmtDate(row.updatedAt)}</p>}
                          {!row && <p className="text-[11px] text-slate-400">Not set — using defaults</p>}
                        </div>
                        {s.type === "boolean" ? (
                          <Switch
                            checked={row ? Boolean(row.value) : false}
                            disabled={saving === s.key}
                            onCheckedChange={(v) => saveValue(s.key, section.key, v)}
                            aria-label={`Toggle ${s.key}`}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8 w-40"
                              type={s.type === "number" ? "number" : "text"}
                              value={edits[s.key] ?? (row && !isSecretMasked ? String(row.value) : "")}
                              placeholder={isSecretMasked ? "managed via env" : s.placeholder}
                              disabled={isSecretMasked}
                              onChange={(e) => setEdits((m) => ({ ...m, [s.key]: e.target.value }))}
                              aria-label={`Value for ${s.key}`}
                            />
                            <Button size="sm" variant="outline" disabled={saving === s.key || (edits[s.key] ?? "") === ""} onClick={() => saveValue(s.key, section.key, s.type === "number" ? Number(edits[s.key]) : edits[s.key])}>
                              Save
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {extras.map((row) => {
                    const isSecretMasked = typeof row.value === "string" && row.value.includes("••••");
                    return (
                      <div key={row._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium text-slate-900 dark:text-white">{row.key}</p>
                          <p className="text-[11px] text-slate-400">Updated {fmtDate(row.updatedAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-40"
                            value={edits[row.key] ?? (isSecretMasked ? "" : String(row.value))}
                            placeholder={isSecretMasked ? "managed via env" : undefined}
                            disabled={isSecretMasked}
                            onChange={(e) => setEdits((m) => ({ ...m, [row.key]: e.target.value }))}
                            aria-label={`Value for ${row.key}`}
                          />
                          <Button size="sm" variant="outline" disabled={saving === row.key || (edits[row.key] ?? "") === ""} onClick={() => saveValue(row.key, section.key, edits[row.key])}>
                            Save
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
                <Plus className="h-4 w-4 text-blue-600" /> Custom setting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="set-key" className="text-xs text-slate-600 dark:text-slate-400">Key</Label>
                  <Input id="set-key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. referral_reward_points" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-val" className="text-xs text-slate-600 dark:text-slate-400">Value</Label>
                  <Input id="set-val" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="50" />
                </div>
                <div className="flex items-end">
                  <Button onClick={createSetting} className="gap-1" disabled={!newKey.trim() || !newVal.trim()}>
                    <Settings2 className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                <KeyRound className="mt-0.5 h-3 w-3 shrink-0" />
                Keys containing "secret", "key", "password", or "token" are rejected; values for sensitive keys are masked with •••• when displayed.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
