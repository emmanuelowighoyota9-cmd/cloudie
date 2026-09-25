import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Building2, Loader2, Moon, Sun, User, Shield } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ThemeProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/** Custom organization name — used on the documents you author yourself. */
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
      toast.success(
        result.organizationName
          ? `Organization name set to ${result.organizationName}`
          : "Organization name cleared",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the organization name");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="notebook-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Organization
          </CardTitle>
        </div>
        <CardDescription>
          Your own documents are issued under this name — it pre-fills the “Issued by” field on any document you
          design, and you can still change it per document.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Northwind Trading Ltd"
            aria-label="Organization name"
            className="h-11 sm:h-9"
          />
          <Button onClick={onSave} disabled={saving || !dirty} className="h-11 gap-1.5 sm:h-9 sm:w-28">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {saved
            ? "Shown on the documents you author yourself. Platform templates are unaffected."
            : "Optional — leave blank to keep documents unsigned."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your account settings and preferences.</p>
      </div>

      {/* Profile */}
      <Card className="notebook-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--nb-ink)]">{user?.name || "Unnamed User"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email || "No email"}</p>
            </div>
            <Badge variant="outline" className="capitalize">{user?.role || "user"}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Organization */}
      <OrganizationCard />

      {/* Appearance */}
      <Card className="notebook-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            {theme === "light" ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</CardTitle>
          </div>
          <CardDescription>Switch between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--nb-ink)]">Theme</p>
              <p className="text-xs text-muted-foreground capitalize">Currently: {theme}</p>
            </div>
            <Button variant="outline" onClick={toggle} className="gap-2">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {theme === "light" ? "Dark Mode" : "Light Mode"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="notebook-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Security</CardTitle>
          </div>
          <CardDescription>Manage your account security settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><p className="text-sm font-medium text-[var(--nb-ink)]">Email Verification</p><p className="text-xs text-muted-foreground">{user?.emailVerificationTime ? "Verified" : "Not verified"}</p></div>
            <Badge variant={user?.emailVerificationTime ? "default" : "secondary"}>{user?.emailVerificationTime ? "Verified" : "Pending"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
