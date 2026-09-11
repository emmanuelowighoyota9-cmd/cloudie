import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import logo from "@/assets/logo.svg";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert } from "lucide-react";
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
 */
function AdminLoginForm() {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
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

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, destination]);

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
            disabled={isLoading}
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
