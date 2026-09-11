import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ThemeProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Moon, Sun, User, Shield } from "lucide-react";

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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--nb-ink)]">{user?.name || "Unnamed User"}</p>
              <p className="text-xs text-muted-foreground">{user?.email || "No email"}</p>
            </div>
            <Badge variant="outline" className="capitalize">{user?.role || "user"}</Badge>
          </div>
        </CardContent>
      </Card>

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
          <div className="flex items-center justify-between py-2">
            <div><p className="text-sm font-medium text-[var(--nb-ink)]">Email Verification</p><p className="text-xs text-muted-foreground">{user?.emailVerificationTime ? "Verified" : "Not verified"}</p></div>
            <Badge variant={user?.emailVerificationTime ? "default" : "secondary"}>{user?.emailVerificationTime ? "Verified" : "Pending"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
