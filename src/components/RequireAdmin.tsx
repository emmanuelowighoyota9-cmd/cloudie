import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";

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

  if (isLoading || (isAuthenticated && me === undefined)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />
    );
  }

  if (me?.role !== "admin") {
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
