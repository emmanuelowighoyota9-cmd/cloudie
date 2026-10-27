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
import { CloudieMascot } from "@/components/CloudieMascot";
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
import { usePlatformConfig } from "@/hooks/use-platform-config";

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

/** Flatten nested authentication errors without exposing internal details. */
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
  const { brand } = usePlatformConfig();
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
    if (mode === "signUp" && password.length < 12) {
      setError("Password must be at least 12 characters.");
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
    setError("Password reset is not available yet because the API does not have a verified email-reset flow. Please contact support for account recovery.");
  };

  const handleConfirmReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("Password reset is not available yet because the API does not have a verified email-reset flow. Please contact support for account recovery.");
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next !== "forgot") setForgotStage("request");
  };

  return (
    <div className="landing-hero min-h-screen bg-background">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label={`Back to ${brand.name} home`}
          className="mb-6 rounded-full transition-transform duration-200 hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CloudieMascot className="w-24" />
        </button>
        <Card className="w-full max-w-md rounded-3xl border-border bg-card/80 shadow-lg shadow-black/20 backdrop-blur-sm">
          {mode === "forgot" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 font-display text-2xl font-bold tracking-tight text-foreground">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Reset your password
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Email-based password recovery is not available yet. Contact support to recover your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {forgotStage === "request" ? (
                  <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="forgot-email"
                          type="email"
                          autoComplete="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="rounded-full pl-11"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="text-sm text-error" role="alert">
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending code...
                        </>
                      ) : (
                        "Contact support for recovery"
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
                        placeholder="000000"                          className="rounded-full text-center font-mono text-lg tracking-[0.4em]"
                        disabled={isLoading}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="forgot-password">New password</Label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="forgot-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={forgotPassword}
                          onChange={(e) => setForgotPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="rounded-full pl-11 pr-12"
                          disabled={isLoading}
                          minLength={8}
                          required
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                      <p className="text-sm text-error" role="alert">
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full gap-2"
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
                      className="w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Didn&apos;t get it? Send a new code
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => switchMode("signIn")}
                  className="mt-6 flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {mode === "signIn" ? "Welcome back" : "Create your account"}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {mode === "signIn"
                    ? `Sign in to your ${brand.name} workspace`
                    : "Sign up with your name, email and a password"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* a11y: tabs are buttons; mode state is controlled by switchMode */}
                <div
                  role="tablist"
                  aria-label="Authentication mode"
                  className="mb-6 grid grid-cols-2 rounded-full border border-border bg-muted/60 p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signIn"}
                    onClick={() => switchMode("signIn")}
                    className={`min-h-10 rounded-full px-3 py-2 text-sm font-semibold transition-all duration-150 ${
                      mode === "signIn"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "signUp"}
                    onClick={() => switchMode("signUp")}
                    className={`min-h-10 rounded-full px-3 py-2 text-sm font-semibold transition-all duration-150 ${
                      mode === "signUp"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
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
                        <User className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          placeholder="Jane Doe"
                          className="rounded-full pl-11"
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
                          className="text-xs font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                        placeholder={mode === "signUp" ? "At least 8 characters" : "Your password"}
                        className="rounded-full pl-11 pr-12"
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
                    <p className="text-sm text-error" role="alert">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-11 w-full gap-2 font-semibold active:scale-95 sm:h-12"
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

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {mode === "signIn" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signUp")}
                        className="font-semibold text-primary hover:underline"
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
                        className="font-semibold text-primary hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </CardContent>
              <CardFooter className="justify-center border-t border-border py-4">
                <p className="text-xs text-muted-foreground">
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
