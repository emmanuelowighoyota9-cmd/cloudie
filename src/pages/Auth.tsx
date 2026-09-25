import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import logo from "@/assets/logo.svg";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
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

type Mode = "signIn" | "signUp" | "forgot";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const initializeUser = useMutation(api.admin.initializeUser);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [mode, setMode] = useState<Mode>("signIn");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot-password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotStage, setForgotStage] = useState<"request" | "confirm">("request");

  useEffect(() => {
    if (!authLoading && isAuthenticated && mode !== "forgot") {
      navigate(redirect, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirect, mode]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
    const password = (formData.get("password") as string) ?? "";

    if (mode === "signUp" && name.length === 0) {
      setError("Please enter your name.");
      setIsLoading(false);
      return;
    }
    if (email.length === 0 || password.length === 0) {
      setError("Please enter your email and password.");
      setIsLoading(false);
      return;
    }
    if (mode === "signUp" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      setIsLoading(false);
      return;
    }

    try {
      await signIn("password", {
        flow: mode,
        email,
        password,
        ...(mode === "signUp" ? { name } : {}),
      });
      // Record the login event and run one-time profile setup (role,
      // createdAt, referral code, welcome bonus). Failures must not block
      // navigation, so they are logged rather than surfaced.
      try {
        await initializeUser({});
      } catch (e) {
        console.warn("initializeUser failed", e);
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const combined = `${raw} ${extractCauseText(err)}`;
      if (/TooManyFailedAttempts|too many|rate limit/i.test(combined)) {
        setError("Too many failed attempts. Please wait a while and try again.");
      } else if (/already|exists/i.test(combined)) {
        setError(
          "An account with this email already exists. Try signing in instead.",
        );
      } else if (/invalid|credentials|password/i.test(combined)) {
        setError("Incorrect email or password.");
      } else {
        setError("Sign-in failed. Please check your details and try again.");
      }
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
      setError("Enter your email address.");
      setIsLoading(false);
      return;
    }
    try {
      await signIn("password", { flow: "reset", email });
      setForgotStage("confirm");
      toast.success(`Reset code sent to ${email}. It expires in 15 minutes.`);
    } catch (err) {
      const combined = `${err instanceof Error ? err.message : ""} ${extractCauseText(err)}`;
      if (/rate|too many|attempts/i.test(combined)) {
        setError("Too many attempts. Please wait a while and try again.");
        setIsLoading(false);
        return;
      }
      // Keep messaging identical for unknown accounts (no enumeration).
      setForgotStage("confirm");
      toast.success(`Reset code sent to ${email}. It expires in 15 minutes.`);
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
      setError(null);
    } catch (err) {
      const combined = `${err instanceof Error ? err.message : ""} ${extractCauseText(err)}`;
      setError(
        /invalid code|expired/i.test(combined)
          ? "That code is invalid or has expired. Request a new one."
          : "Password reset failed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next !== "forgot") setForgotStage("request");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <img
          src={logo}
          alt="Crestline Express"
          width={56}
          height={56}
          className="mb-6 cursor-pointer rounded-xl"
          onClick={() => navigate("/")}
        />
        <Card className="w-full max-w-md rounded-2xl border-slate-200 shadow-md dark:border-slate-700">
          {mode === "forgot" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                  <KeyRound className="h-5 w-5 text-blue-600" />
                  Reset your password
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  We&apos;ll email you a 6-digit code to set a new password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {forgotStage === "request" ? (
                  <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="forgot-email"
                          type="email"
                          autoComplete="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="pl-9"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
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
                      <Label htmlFor="forgot-code">6-digit code</Label>
                      <Input
                        id="forgot-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={forgotCode}
                        onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="text-center font-mono text-lg tracking-[0.4em]"
                        disabled={isLoading}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="forgot-password">New password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="forgot-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={forgotPassword}
                          onChange={(e) => setForgotPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="pl-9 pr-10"
                          disabled={isLoading}
                          minLength={8}
                          required
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-3 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
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
                      className="w-full text-center text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Didn&apos;t get it? Send a new code
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => switchMode("signIn")}
                  className="mt-6 flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                  {mode === "signIn" ? "Welcome back" : "Create your account"}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  {mode === "signIn"
                    ? "Sign in to your Crestline Express workspace"
                    : "Sign up with your name, email and a password"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* a11y: tabs are buttons; mode state is controlled by switchMode */}
                <div
                  role="tablist"
                  aria-label="Authentication mode"
                  className="mb-6 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signIn"}
                    onClick={() => switchMode("signIn")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      mode === "signIn"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signUp"}
                    onClick={() => switchMode("signUp")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      mode === "signUp"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {mode === "signUp" && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          placeholder="Jane Doe"
                          className="pl-9"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signIn" && (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                          className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                        placeholder={mode === "signUp" ? "At least 8 characters" : "Your password"}
                        className="pl-9 pr-10"
                        disabled={isLoading}
                        minLength={mode === "signUp" ? 8 : undefined}
                        required
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-3 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {mode === "signIn" ? "Signing in..." : "Creating account..."}
                      </>
                    ) : (
                      <>{mode === "signIn" ? "Sign In" : "Create Account"}</>
                    )}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  {mode === "signIn" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signUp")}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signIn")}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </CardContent>
              <CardFooter className="justify-center border-t border-slate-100 py-4 dark:border-slate-700">
                <p className="text-xs text-slate-400">
                  Secured with encrypted password authentication
                </p>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense fallback={null}>
      <Auth {...props} />
    </Suspense>
  );
}
