import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import logo from "@/assets/logo.svg";
import { Eye, EyeOff, Loader2, Lock, LogOut, Mail, ShieldAlert } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

/**
 * Dedicated administrator sign-in for Cloudie.
 *
 * Authenticates against the same Convex Auth Password provider as the regular
 * auth page (identical hashing), then runs the shared post-login
 * initialization and routes to the admin console. The admin console itself
 * re-verifies the role server-side on every request.
 *
 * Safe for account switching: an already-authenticated NON-admin sees the
 * form with a notice + "sign out" escape instead of being bounced to the
 * admin console (which would dead-end on "Access restricted").
 */
function AdminLoginForm() {
  const { isLoading: authLoading, isAuthenticated, user, signIn, signOut } = useAuth();
  const initializeUser = useMutation(api.admin.initializeUser);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  // Only honor safe, admin-relative return paths.
  const destination =
    returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/admin";

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isAdmin = isAuthenticated && user?.role === "admin";
  // Auto-redirect ONLY when the current session is already an administrator.
  // A signed-in non-admin must be able to reach the form to switch accounts.
  useEffect(() => {
    if (!authLoading && isAdmin) {
      navigate(destination, { replace: true });
    }
  }, [authLoading, isAdmin, navigate, destination]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      setError(null);
      toast.success("Signed out. Enter the administrator credentials.");
    } catch {
      toast.error("Sign out failed");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
    const password = (formData.get("password") as string) ?? "";

    if (email.length === 0 || password.length === 0) {
      setError("Enter the administrator email and password.");
      setIsLoading(false);
      return;
    }

    try {
      await signIn("password", { flow: "signIn", email, password });
      try {
        await initializeUser({});
      } catch (e) {
        console.warn("initializeUser failed", e);
      }
      // Route to the console. RequireAdmin re-verifies the role server-side:
      // admins land on the dashboard; non-admins get a clear "sign out and
      // switch" escape instead of a silent dead end.
      toast.success("Administrator signed in");
      navigate(destination, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Administrator sign-in failed.";
      setError(
        /invalid|credentials|password|account/i.test(message)
          ? "Invalid administrator credentials."
          : "Sign-in failed. Please try again.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
      <img
        src={logo}
        alt="Cloudie Admin"
        width={56}
        height={56}
        className="mb-6 rounded-xl"
      />
      <div className="mb-6 flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-red-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        Restricted area
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">Administrator Sign In</h1>
          <p className="mt-1 text-sm text-slate-400">
            Cloudie platform control console
          </p>
        </div>

        {/* Signed in as a non-admin: offer an escape instead of a redirect loop */}
        {isAuthenticated && !isAdmin && !authLoading && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-amber-300">
              You&apos;re signed in as {user?.email ?? "another account"}, which is
              not an administrator.
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              Sign out below, then enter the administrator credentials.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="mt-3 w-full gap-2 border-amber-500/40 bg-transparent text-amber-200 hover:bg-amber-500/20 hover:text-amber-100"
            >
              {isSigningOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sign out and switch account
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="admin-email" className="text-slate-300">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="admin@example.com"
                className="border-slate-700 bg-slate-800 pl-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-red-500/50"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-password" className="text-slate-300">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Administrator password"
                className="border-slate-700 bg-slate-800 pl-9 pr-10 text-slate-100 placeholder:text-slate-500 focus-visible:ring-red-500/50"
                disabled={isLoading}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-3 text-slate-500 transition-colors hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading || isAuthenticated}
            className="w-full gap-2 bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-700 hover:to-orange-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying credentials...
              </>
            ) : (
              "Sign in to Admin Console"
            )}
          </Button>
        </form>

        <p className="mt-6 border-t border-slate-800 pt-4 text-center text-xs text-slate-500">
          All access attempts are logged and audited.
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
