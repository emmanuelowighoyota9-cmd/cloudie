import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Building2, Loader2, Moon, Sun, User, Shield, CheckCircle2, Mail, Wallet, Bell, ArrowRight, LockKeyhole } from "lucide-react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ThemeProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

function OrganizationCard() {
  const org = useQuery(api.organization.getMyOrganization, {});
  const saveOrganization = useMutation(api.organization.setMyOrganization);
  const [name, setName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated || org === undefined) return;
    setHydrated(true);
    setName(org.organizationName);
  }, [org, hydrated]);

  const saved = org?.organizationName ?? "";
  const dirty = hydrated && name.trim() !== saved;

  const onSave = async () => {
    setSaving(true);
    try {
      const result = await saveOrganization({ organizationName: name.trim() });
      setName(result.organizationName);
      toast.success(result.organizationName ? `Organization name set to ${result.organizationName}` : "Organization name cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the organization name");
    } finally {
      setSaving(false);
    }
  };

  return <Card className="border-border/70 shadow-sm">
    <CardHeader><div className="flex items-center gap-2"><Building2 className="size-4 text-primary"/><CardTitle className="text-sm">Organization</CardTitle></div><CardDescription>Your organization name is used when you author your own documents.</CardDescription></CardHeader>
    <CardContent className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row"><Input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Northwind Trading Ltd" aria-label="Organization name" className="h-11"/><Button onClick={onSave} disabled={saving || !dirty} className="h-11 sm:w-28">{saving ? <Loader2 className="size-4 animate-spin"/> : null}Save</Button></div><p className="text-[11px] text-muted-foreground">{saved ? "Saved and ready for your authored documents." : "Optional — leave blank to keep documents unsigned."}</p></CardContent>
  </Card>;
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const emailVerified = Boolean(user?.emailVerificationTime);

  return <div className="space-y-6 sm:space-y-8">
    <section className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><User className="size-6"/></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cloudie Account</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Profile & Security</h1><p className="mt-1 text-sm text-muted-foreground">Manage your identity, preferences and account protection.</p></div>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 rounded-full px-3 py-1.5"><Shield className="size-3.5"/>{emailVerified ? "Account verified" : "Verification pending"}</Badge>
      </div>
    </section>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary text-lg font-bold">{(user?.name || "U").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="text-lg font-semibold text-foreground">{user?.name || "Unnamed User"}</p><p className="mt-0.5 flex items-center gap-1.5 break-all text-sm text-muted-foreground"><Mail className="size-3.5 shrink-0"/>{user?.email || "No email"}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary" className="capitalize">{user?.role || "user"}</Badge><Badge variant={emailVerified ? "default" : "outline"}>{emailVerified ? "Email verified" : "Email not verified"}</Badge></div></div>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-primary"><LockKeyhole className="size-4"/><span className="text-sm font-semibold">Security posture</span></div><p className="mt-3 text-2xl font-bold text-foreground">{emailVerified ? "Good" : "Action needed"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{emailVerified ? "Your account email is verified." : "Verify your email to strengthen account recovery and trust."}</p></CardContent></Card>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link to="/personal/wallet" className="group"><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/30"><CardContent className="flex items-center gap-3 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wallet className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Wallet</p><p className="text-xs text-muted-foreground">Balance & transactions</p></div><ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5"/></CardContent></Card></Link>
      <Link to="/notifications" className="group"><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/30"><CardContent className="flex items-center gap-3 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Notifications</p><p className="text-xs text-muted-foreground">Manage account updates</p></div><ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5"/></CardContent></Card></Link>
      <Card><CardContent className="flex items-center gap-3 p-5"><div className={`flex size-10 items-center justify-center rounded-xl ${emailVerified ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{emailVerified ? <CheckCircle2 className="size-5"/> : <Mail className="size-5"/>}</div><div><p className="text-sm font-semibold">Email verification</p><p className="text-xs text-muted-foreground">{emailVerified ? "Verified and active" : "Verification pending"}</p></div></CardContent></Card>
    </div>

    <OrganizationCard />

    <Card>
      <CardHeader><div className="flex items-center gap-2"><Sun className="size-4 text-primary"/><CardTitle className="text-sm">Appearance</CardTitle></div><CardDescription>Choose the Cloudie interface theme for this device.</CardDescription></CardHeader>
      <CardContent><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{theme === "light" ? "Light mode" : "Dark mode"}</p><p className="text-xs text-muted-foreground">Currently using {theme} theme.</p></div><Button variant="outline" onClick={toggle} className="h-11 gap-2 sm:h-9">{theme === "light" ? <Moon className="size-4"/> : <Sun className="size-4"/>}{theme === "light" ? "Switch to dark" : "Switch to light"}</Button></div></CardContent>
    </Card>

    <Card className="border-primary/15 bg-primary/[0.025]">
      <CardHeader><div className="flex items-center gap-2"><Shield className="size-4 text-primary"/><CardTitle className="text-sm">Account security</CardTitle></div><CardDescription>Cloudie currently exposes your verified-email status here. Additional security controls should only be enabled when the underlying account APIs are available.</CardDescription></CardHeader>
      <CardContent><div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4"><div className={`flex size-9 items-center justify-center rounded-full ${emailVerified ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{emailVerified ? <CheckCircle2 className="size-4"/> : <Mail className="size-4"/>}</div><div><p className="text-sm font-medium">{emailVerified ? "Email verification is complete" : "Email verification is not complete"}</p><p className="text-xs text-muted-foreground">{emailVerified ? "No action is required on this screen." : "Use the account verification flow when it is provided by the platform."}</p></div></div></CardContent>
    </Card>
  </div>;
}
