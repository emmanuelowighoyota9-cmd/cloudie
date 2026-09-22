import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import logo from "@/assets/logo.svg";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
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
 * Also includes a code-based password reset (Convex Auth "reset" /
 * "reset-verification" flows backed by the email OTP service), so a lost
 * administrator password can always be recovered without support.
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

  const [mode, setMode] = useState<"signIn" | "forgot">("signIn");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Forgot-password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotStage, setForgotStage] = useState<"request" | "confirm">("request");

  const isAdmin = isAuthenticated && user?.role === "admin";
  // Auto-redirect ONLY when the current session is already an administrator.
  // A signed-in non-admin must be able to reach the form to switch accounts.
  useEffect(() => {
    if (!authLoading && isAdmin && mode === "signIn") {
      navigate(destination, { replace: true });
    }
  }, [authLoading, isAdmin, navigate, destination, mode]);

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
      const raw = err instanceof Error ? err.message : "";
      const combined = `${raw} ${extractCauseText(err)}`;
      setError(describeSignInError(combined));
      setIsLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────────

  const handleRequestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const email = forgotEmail.trim().toLowerCase();
    if (!email) {
      setError("Enter the administrator email.");
      setIsLoading(false);
      return;
    }
    try {
      await signIn("password", { flow: "reset", email });
      setForgotStage("confirm");
      toast.success(`Reset code sent to ${email}. It expires in 15 minutes.`);
    } catch (err) {
      // Convex Auth throws generic errors for unknown accounts; keep the
      // messaging identical so the form can't be used to enumerate accounts.
      toast.error(
        err instanceof Error && /rate|too many|attempts/i.test(err.message)
          ? "Too many attempts. Please wait a while and try again."
          : "If that email has an account, a reset code has been sent.",
      );
      // Still advance so a legitimate user who hit a transient error can retry
      // code entry; unknown emails simply never verify.
      setForgotStage("confirm");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const email = forgotEmail.trim().toLowerCase();
    const code = forgotCode.trim();
    if (!email || code.length === 0 || forgotPassword.length < 8) {
      setError("Enter the code and a new password of at least 8 characters.");
      setIsLoading(false);
      return;
    }
    try {
      await signIn("password", {
        flow: "reset-verification",
        email,
        code,
        newPassword: forgotPassword,
      });
      toast.success("Password updated. Sign in with your new password.");
      setMode("signIn");
      setForgotStage("request");
      setForgotCode("");
      setForgotPassword("");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const combined = `${raw} ${extractCauseText(err)}`;
      setError(
        /invalid code|expired|Invalid code/i.test(combined)
          ? "That code is invalid or has expired. Request a new one."
          : describeSignInError(combined),
      );
    } finally {
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
        {mode === "signIn" ? (
          <>
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

            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
              }}
              className="mt-4 w-full text-center text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              Forgot the administrator password?
            </button>
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-white">
                <KeyRound className="h-5 w-5 text-red-400" />
                Reset Admin Password
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                A 6-digit code will be emailed to the administrator address.
              </p>
            </div>

            {forgotStage === "request" ? (
              <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-slate-300">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="border-slate-700 bg-slate-800 pl-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-red-500/50"
                      disabled={isLoading}
                      required
                    />
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
                      Sending code...
                    </>
                  ) : (
                    "Send reset code"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="forgot-code" className="text-slate-300">6-digit code</Label>
                  <Input
                    id="forgot-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={forgotCode}
                    onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="border-slate-700 bg-slate-800 text-center text-lg font-mono tracking-[0.4em] text-slate-100 placeholder:text-slate-600 focus-visible:ring-red-500/50"
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="forgot-password" className="text-slate-300">
                    New password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="forgot-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={forgotPassword}
                      onChange={(e) => setForgotPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="border-slate-700 bg-slate-800 pl-9 pr-10 text-slate-100 placeholder:text-slate-500 focus-visible:ring-red-500/50"
                      disabled={isLoading}
                      minLength={8}
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
                      Updating password...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Set new password
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotStage("request");
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-slate-400 transition-colors hover:text-slate-200"
                >
                  Didn&apos;t get it? Send a new code
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setMode("signIn");
                setForgotStage("request");
                setError(null);
              }}
              className="mt-6 flex w-full items-center justify-center gap-1.5 text-center text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          </>
        )}

        <p className="mt-6 border-t border-slate-800 pt-4 text-center text-xs text-slate-500">
          All access attempts are logged and audited.
        </p>
      </div>
    </div>
  );
}

/** Convex Auth wraps provider errors in cause chains — flatten them. */
function extractCauseText(err: unknown): string {
  const parts: string[] = [];
  let cause = (err as { cause?: unknown })?.cause;
  let guard = 0;
  while (cause && guard < 5) {
    if (cause instanceof Error) parts.push(cause.message);
    cause = (cause as { cause?: unknown })?.cause;
    guard++;
  }
  return parts.join(" ");
}

function describeSignInError(combined: string): string {
  if (/TooManyFailedAttempts|too many|rate limit/i.test(combined)) {
    return "Too many failed attempts. Please wait a while and try again.";
  }
  if (/InvalidSecret|InvalidAccountId|invalid|credentials|password|account/i.test(combined)) {
    return "Invalid administrator credentials.";
  }
  return "Sign-in failed. Please try again.";
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
