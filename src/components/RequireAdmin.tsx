import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
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
      await claim({ setupCode: code.trim() || undefined });
      toast.success("You are now the platform administrator");
      // Reload so the gate re-evaluates against the fresh role.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claim failed");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md rounded-2xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/50">
            <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="mt-3 text-center text-lg font-bold text-slate-900 dark:text-white">
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
              <span className="text-xs text-slate-400">
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
          <Button
            onClick={handleClaim}
            disabled={busy}
            className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Claim administrator role
          </Button>
          <Link
            to="/dashboard"
            className="block text-center text-sm text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400"
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Server-authoritative admin gate: the client check below is convenience only.
 * Every admin Convex function re-verifies the admin role server-side
 * (`requireAdmin` in adminApi.ts), so spoofing this component grants nothing.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Same auth gate semantics as RequireAuth (returnTo preserved).
  const me = useQuery(
    api.users.currentUser,
    isAuthenticated ? {} : "skip",
  );

  // Whether any admin exists — enables the one-time first-admin claim flow.
  const anyAdmin = useQuery(api.admin.adminExists, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && me === undefined)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    // Dedicated admin sign-in: keep the requested path so the admin login
    // page can return the administrator to where they were headed.
    return (
      <Navigate
        to={`/admin/login?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  // Bootstrap window: no admin exists anywhere → allow a signed-in user to
  // claim the role once. Server enforces this is only possible pre-bootstrap.
  if (me?.role !== "admin") {
    if (anyAdmin === false) {
      return <ClaimAdminPanel />;
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
            Access restricted
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            This area is only available to platform administrators. Your
            attempt is subject to access auditing.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-blue-700 hover:to-indigo-700"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return children;
}
