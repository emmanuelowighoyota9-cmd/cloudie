import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminPageHeader, AdminSkeleton } from "@/components/admin/shared";
import {
  DEFAULT_BRAND,
  DEFAULT_SUPPORT,
  type BrandConfig,
  type SupportConfig,
} from "@/lib/platformConfig";
import {
  BadgeCheck,
  Headphones,
  LifeBuoy,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-400">
        {label}
      </Label>
      <div className="flex items-stretch gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#087f73"
          className="font-mono"
        />
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={valid ? value : "#087f73"}
          onChange={(event) => onChange(event.target.value)}
          className="h-[38px] w-12 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** Small live preview of the shell + support launcher using the current form values. */
function AppearancePreview({ brand, support }: { brand: BrandConfig; support: SupportConfig }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="h-6 w-6 rounded-md" style={{ background: brand.accent }} />
        <span className="text-sm font-bold text-slate-900 dark:text-white">{brand.name}</span>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: brand.accent }}>
          Live
        </span>
      </div>
      <div className="flex">
        <div className="hidden w-24 shrink-0 space-y-1.5 border-r border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/60 sm:block">
          {["Dashboard", "Shipments", "Documents"].map((item, index) => (
            <div
              key={item}
              className="truncate rounded px-2 py-1 text-[10px]"
              style={
                index === 0
                  ? { background: `${brand.accent}1a`, color: brand.accent, fontWeight: 600 }
                  : { color: "#64748b" }
              }
            >
              {item}
            </div>
          ))}
        </div>
        <div className="flex-1 space-y-2 p-3">
          <div className="h-2.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-2 w-4/5 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="flex items-center gap-2 pt-1">
            <span className="rounded-md px-2 py-1 text-[10px] font-semibold text-white" style={{ background: brand.accent }}>
              Primary action
            </span>
            <span className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700">
              Secondary
            </span>
          </div>
          <p className="pt-1 text-[10px] text-slate-400">{brand.footerNote}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
          <LifeBuoy className="h-3 w-3" style={{ color: brand.accent }} />
          {support.widgetEnabled ? support.widgetTitle : "Support widget disabled"}
        </span>
        <span className="truncate text-[10px] text-slate-400">
          {support.email || support.phone || "No contact channel set"}
        </span>
      </div>
    </div>
  );
}

export default function AdminAppearance() {
  const config = useQuery(api.platform.getPublicConfig);
  const saveBrand = useMutation(api.platform.saveBrand);
  const saveSupport = useMutation(api.platform.saveSupport);
  const resetConfig = useMutation(api.platform.resetConfig);

  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);
  const [support, setSupport] = useState<SupportConfig>(DEFAULT_SUPPORT);
  const [touchedBrand, setTouchedBrand] = useState(false);
  const [touchedSupport, setTouchedSupport] = useState(false);
  const [saving, setSaving] = useState<"brand" | "support" | "reset" | null>(null);

  // Seed the forms from the live config until the admin starts editing, so
  // realtime subscription updates never clobber in-progress changes.
  useEffect(() => {
    if (config && !touchedBrand) setBrand(config.brand);
  }, [config, touchedBrand]);
  useEffect(() => {
    if (config && !touchedSupport) setSupport(config.support);
  }, [config, touchedSupport]);

  const updateBrand = (patch: Partial<BrandConfig>) => {
    setTouchedBrand(true);
    setBrand((prev) => ({ ...prev, ...patch }));
  };
  const updateSupport = (patch: Partial<SupportConfig>) => {
    setTouchedSupport(true);
    setSupport((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveBrand = async () => {
    setSaving("brand");
    try {
      await saveBrand({ brand });
      setTouchedBrand(false);
      toast.success("Appearance saved — applied across the platform");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save appearance");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveSupport = async () => {
    setSaving("support");
    try {
      await saveSupport({ support });
      setTouchedSupport(false);
      toast.success("Support details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save support details");
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async () => {
    setSaving("reset");
    try {
      await resetConfig();
      setTouchedBrand(false);
      setTouchedSupport(false);
      toast.success("Configuration reset to platform defaults");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset configuration");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Appearance & Support"
        description="Set the app design tokens, product identity and the customer support details shown to your users. Every change is audited (SETTING_CHANGED) and applies live."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving !== null} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
            </Button>
          </div>
        }
      />

      {config === undefined ? (
        <AdminSkeleton rows={6} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Tabs defaultValue="design">
              <TabsList className="mb-4">
                <TabsTrigger value="design" className="gap-1.5">
                  <Palette className="h-3.5 w-3.5" /> Brand & design
                </TabsTrigger>
                <TabsTrigger value="support" className="gap-1.5">
                  <Headphones className="h-3.5 w-3.5" /> Customer support
                </TabsTrigger>
              </TabsList>

              <TabsContent value="design">
                <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-slate-900 dark:text-white">App design</CardTitle>
                    <p className="text-xs text-slate-500">
                      Accents override the design tokens in both light and dark mode. Only 6-digit hex values are accepted.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="brand-name" className="text-xs text-slate-600 dark:text-slate-400">
                          Product name
                        </Label>
                        <Input id="brand-name" value={brand.name} onChange={(e) => updateBrand({ name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="brand-tagline" className="text-xs text-slate-600 dark:text-slate-400">
                          Tagline
                        </Label>
                        <Input id="brand-tagline" value={brand.tagline} onChange={(e) => updateBrand({ tagline: e.target.value })} />
                      </div>
                      <ColorField
                        id="brand-accent"
                        label="Accent colour (light mode)"
                        value={brand.accent}
                        onChange={(value) => updateBrand({ accent: value })}
                      />
                      <ColorField
                        id="brand-accent-dark"
                        label="Accent colour (dark mode)"
                        value={brand.accentDark}
                        onChange={(value) => updateBrand({ accentDark: value })}
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor="brand-mode" className="text-xs text-slate-600 dark:text-slate-400">
                          Default colour scheme
                        </Label>
                        <Select
                          value={brand.defaultMode}
                          onValueChange={(value) => updateBrand({ defaultMode: value as BrandConfig["defaultMode"] })}
                        >
                          <SelectTrigger id="brand-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="system">Respect device setting</SelectItem>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-slate-400">Applies to visitors who have not chosen a theme yet.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="brand-logo" className="text-xs text-slate-600 dark:text-slate-400">
                          Logo URL (optional)
                        </Label>
                        <Input
                          id="brand-logo"
                          value={brand.logoUrl}
                          onChange={(e) => updateBrand({ logoUrl: e.target.value })}
                          placeholder="https://cdn.example.com/logo.svg"
                        />
                        <p className="text-[11px] text-slate-400">Absolute https URL. Ignored if invalid.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-footer" className="text-xs text-slate-600 dark:text-slate-400">
                        Footer note
                      </Label>
                      <Input id="brand-footer" value={brand.footerNote} onChange={(e) => updateBrand({ footerNote: e.target.value })} />
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <BadgeCheck className="h-3 w-3" /> {touchedBrand ? "Unsaved changes" : "Saved"}
                      </p>
                      <Button onClick={handleSaveBrand} disabled={saving !== null} className="gap-1.5">
                        <Save className="h-3.5 w-3.5" /> {saving === "brand" ? "Saving…" : "Save design"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="support" className="space-y-5">
                <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-slate-900 dark:text-white">Customer support details</CardTitle>
                    <p className="text-xs text-slate-500">
                      These render in the in-app support launcher, the landing footer and tenant contact pages.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">Support launcher</p>
                        <p className="text-[11px] text-slate-400">Show the floating help button on public and workspace pages.</p>
                      </div>
                      <Switch
                        checked={support.widgetEnabled}
                        onCheckedChange={(value) => updateSupport({ widgetEnabled: value })}
                        aria-label="Toggle support launcher"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="support-title" className="text-xs text-slate-600 dark:text-slate-400">
                          Launcher title
                        </Label>
                        <Input id="support-title" value={support.widgetTitle} onChange={(e) => updateSupport({ widgetTitle: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="support-hours" className="text-xs text-slate-600 dark:text-slate-400">
                          Service hours
                        </Label>
                        <Input id="support-hours" value={support.hours} onChange={(e) => updateSupport({ hours: e.target.value })} placeholder="Mon–Fri · 08:00–20:00 UTC" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="support-email" className="text-xs text-slate-600 dark:text-slate-400">
                          Support email
                        </Label>
                        <Input id="support-email" type="email" value={support.email} onChange={(e) => updateSupport({ email: e.target.value })} placeholder="support@example.com" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="support-phone" className="text-xs text-slate-600 dark:text-slate-400">
                          Support phone
                        </Label>
                        <Input id="support-phone" value={support.phone} onChange={(e) => updateSupport({ phone: e.target.value })} placeholder="+1 (800) 555-0142" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="support-whatsapp" className="text-xs text-slate-600 dark:text-slate-400">
                          WhatsApp number
                        </Label>
                        <Input id="support-whatsapp" value={support.whatsapp} onChange={(e) => updateSupport({ whatsapp: e.target.value })} placeholder="15551234567" />
                        <p className="text-[11px] text-slate-400">Digits only, including country code.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="support-help" className="text-xs text-slate-600 dark:text-slate-400">
                          Help centre URL
                        </Label>
                        <Input id="support-help" value={support.helpCenterUrl} onChange={(e) => updateSupport({ helpCenterUrl: e.target.value })} placeholder="https://help.example.com" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="support-message" className="text-xs text-slate-600 dark:text-slate-400">
                        Launcher message
                      </Label>
                      <Textarea
                        id="support-message"
                        value={support.widgetMessage}
                        onChange={(e) => updateSupport({ widgetMessage: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">FAQ entries</CardTitle>
                      <p className="text-xs text-slate-500">Up to 8 questions shown inside the support launcher.</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={support.faqs.length >= 8}
                      onClick={() => updateSupport({ faqs: [...support.faqs, { question: "", answer: "" }] })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {support.faqs.length === 0 && (
                      <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-700">
                        No FAQ entries yet.
                      </p>
                    )}
                    {support.faqs.map((faq, index) => (
                      <div key={index} className="space-y-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <Input
                            value={faq.question}
                            placeholder="Question"
                            aria-label={`FAQ ${index + 1} question`}
                            onChange={(e) => {
                              const faqs = [...support.faqs];
                              faqs[index] = { ...faqs[index], question: e.target.value };
                              updateSupport({ faqs });
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-red-500"
                            aria-label={`Remove FAQ ${index + 1}`}
                            onClick={() => updateSupport({ faqs: support.faqs.filter((_, i) => i !== index) })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Textarea
                          value={faq.answer}
                          rows={2}
                          placeholder="Answer"
                          aria-label={`FAQ ${index + 1} answer`}
                          onChange={(e) => {
                            const faqs = [...support.faqs];
                            faqs[index] = { ...faqs[index], answer: e.target.value };
                            updateSupport({ faqs });
                          }}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Send className="h-3 w-3" /> {touchedSupport ? "Unsaved changes" : "Saved"}
                      </p>
                      <Button onClick={handleSaveSupport} disabled={saving !== null} className="gap-1.5">
                        <Save className="h-3.5 w-3.5" /> {saving === "support" ? "Saving…" : "Save support"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="lg:sticky lg:top-4 lg:self-start"
          >
            <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-900 dark:text-white">Live preview</CardTitle>
                <p className="text-xs text-slate-500">Reflects unsaved values before you publish them.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <AppearancePreview brand={brand} support={support} />
                <dl className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex justify-between gap-2">
                    <dt>Product name</dt>
                    <dd className="truncate font-medium text-slate-700 dark:text-slate-200">{brand.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Browser title</dt>
                    <dd className="truncate font-medium text-slate-700 dark:text-slate-200">
                      {brand.name} · {brand.tagline}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Support channels</dt>
                    <dd className="font-medium text-slate-700 dark:text-slate-200">
                      {[support.email && "email", support.phone && "phone", support.whatsapp && "whatsapp", support.helpCenterUrl && "help centre"]
                        .filter(Boolean)
                        .join(", ") || "none"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Last updated</dt>
                    <dd className="font-medium text-slate-700 dark:text-slate-200">
                      {config.updatedAt ? new Date(config.updatedAt).toLocaleString() : "defaults"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
