import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * One-time bootstrap screen: when the platform has NO administrator yet, a
 * signed-in user can claim the role here (requires ADMIN_SETUP_CODE env var
 * when configured). Once any admin exists this flow is permanently disabled
 * server-side and the component behaves as the normal admin gate.
 */
function ClaimAdminPanel() {
  const claim = useMutation(api.admin.claimFirstAdmin);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleClaim = async () => {
    setBusy(true);
    try {
      await claim({ setupCode: code.trim() });
      toast.success("You are now the platform administrator");
      // Reload so the gate re-evaluates against the fresh role.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claim failed");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl border-border bg-card">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="mt-3 text-center text-lg font-bold text-foreground">
            No administrator yet
          </CardTitle>
          <CardDescription className="text-center">
            This Cloudie deployment has no admin account. The first person to
            claim the role becomes the platform administrator. This offer
            disappears permanently once claimed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="setup-code">
              Setup code{" "}
              <span className="text-xs text-muted-foreground">
                (only if ADMIN_SETUP_CODE is configured)
              </span>
            </Label>
            <Input
              id="setup-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Leave empty if no code was set"
              disabled={busy}
            />
          </div>
          <Button onClick={handleClaim} disabled={busy} className="w-full gap-2">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Claim administrator role
          </Button>
          <Link
            to="/dashboard"
            className="block text-center text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Escape hatch for a signed-in NON-admin who landed on an admin route:
 * offers sign-out (then routes to the dedicated admin login) instead of a
 * dead end. This is the common "wrong account" fix.
 */
function NonAdminNotice() {
  const { user, signOut } = useAuth();
  const claim = useMutation(api.admin.claimFirstAdmin);
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      toast.success("Signed out. Sign in with the administrator account.");
    } catch {
      toast.error("Sign out failed");
      setBusy(false);
    }
  };

  const handleRecovery = async () => {
    setRecoveryBusy(true);
    try {
      await claim({ setupCode: recoveryCode.trim() });
      toast.success("Administrator access granted");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recovery failed");
      setRecoveryBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-error/12 text-error">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-foreground">
          Access restricted
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as <span className="font-medium text-foreground">{user?.email ?? "another account"}</span>,
          which does not have administrator access.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={handleSignOut} disabled={busy} className="w-full gap-2">
            {busy && <Loader2 className="size-4 animate-spin" />}
            <LogOut className="size-4" />
            Sign out and use admin login
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>

        {/* Recovery: only succeeds when the platform's existing administrators
            are locked out, or when the operator supplies ADMIN_SETUP_CODE. */}
        <div className="mt-5 border-t border-border pt-4 text-left">
          <button
            type="button"
            onClick={() => setShowRecovery((v) => !v)}
            aria-expanded={showRecovery}
            className="w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showRecovery ? "Hide administrator recovery" : "Platform locked out? Administrator recovery"}
          </button>

          {showRecovery && (
            <div className="mt-3 space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Grants administrator access to this signed-in account. It is only
                allowed when no existing administrator can be reached, or when you
                enter the platform recovery code. Every attempt is audited.
              </p>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="recovery-code" className="text-xs">
                  Recovery code <span className="text-muted-foreground">(if configured)</span>
                </Label>
                <Input
                  id="recovery-code"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="Leave empty if no code was set"
                  disabled={recoveryBusy}
                />
              </div>
              <Button
                onClick={handleRecovery}
                disabled={recoveryBusy}
                variant="outline"
                className="w-full gap-2"
              >
                {recoveryBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Claim administrator access
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Server-authoritative admin gate: the client check below is convenience only.
 * Every admin Convex function re-verifies the admin role server-side
 * (`requireAdmin` in adminApi.ts), so spoofing this component grants nothing.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking administrator access…</span>
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/admin/login?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  if (user?.role !== "admin") {
    return <NonAdminNotice />;
  }

  return children;
}
