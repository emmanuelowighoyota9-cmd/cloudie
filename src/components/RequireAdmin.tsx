import { useAuth } from "@/hooks/use-auth";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Client-side navigation gate backed by the role returned by the Neon API.
 * This is not the security boundary: every privileged operation must also
 * enforce the user's current role in the API.
 *
 * Admin claiming/recovery is intentionally not offered here. That operation
 * must be implemented as a server-side, audited, one-time Neon API flow before
 * the UI can safely expose it; the former Convex mutation is not a valid
 * fallback once this application authenticates through Neon.
 */
function NonAdminNotice() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out. Sign in with the administrator account.");
    } catch {
      toast.error("Sign out failed");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-error/12 text-error">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-foreground">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as{" "}
          <span className="font-medium text-foreground">{user?.email ?? "another account"}</span>,
          which does not have administrator access.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Administrator setup and recovery must be completed through a verified server-side process.
          This page cannot safely grant administrator privileges.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => void handleSignOut()} className="w-full gap-2">
            <LogOut className="size-4" />
            Sign out and use admin login
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

/**
 * Navigation gate only. Authorization must be enforced again by the API
 * for every privileged read or write.
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

  if (user?.role !== "admin") return <NonAdminNotice />;
  return children;
}
