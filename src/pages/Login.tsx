import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import {
  AlertStrip,
  AuthField,
  AuthSplitLayout,
  RedirectSkeleton,
  describeAuthError,
  resolveAuthRedirect,
  type OAuthProvider,
} from "@/components/AuthSplitLayout";

/**
 * `/login` — the sign-in half of the split-screen auth pair.
 *
 * Every rule lives once: the validators below run on blur (through
 * `touched`) and again on submit, so the button can never accept input the
 * fields already rejected. Server failures never land in a field — they land
 * in the alert strip above the button, announced via `role="alert"`.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return null;
}

function validatePassword(value: string): string | null {
  if (!value) return "Enter your password.";
  return null;
}

const VALIDATORS = {
  email: validateEmail,
  password: validatePassword,
} as const;

type FieldKey = keyof typeof VALIDATORS;

export default function LoginPage({ redirectAfterAuth = "/dashboard" }: { redirectAfterAuth?: string }) {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { brand } = usePlatformConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveAuthRedirect(searchParams.get("returnTo"), redirectAfterAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const errorFor = (key: FieldKey): string | null =>
    touched[key] ? VALIDATORS[key](key === "email" ? email : password) : null;

  // Already signed in (or the session hydrated mid-render): show the success
  // skeleton rather than a form that would immediately be replaced.
  useEffect(() => {
    if (isAuthenticated && !authLoading && status === "idle") setStatus("success");
  }, [isAuthenticated, authLoading, status]);

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => navigate(redirect, { replace: true }), 850);
    return () => clearTimeout(timer);
  }, [status, navigate, redirect]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "idle") return;
    setServerError(null);
    setTouched({ email: true, password: true });

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) return;

    setStatus("loading");
    try {
      await login(email.trim().toLowerCase(), password);
      setStatus("success");
    } catch (err) {
      setServerError(describeAuthError(err, "login"));
      setStatus("idle");
    }
  };

  const handleProvider = (provider: OAuthProvider) => {
    const label = provider === "google" ? "Google" : "GitHub";
    setServerError(`${label} sign-in isn't connected to this workspace yet. Use your email and password to continue.`);
  };

  const form =
    status === "success" ? (
      <RedirectSkeleton title="Signed in" hint="Opening your workspace…" />
    ) : (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onValueChange={setEmail}
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          error={errorFor("email")}
          disabled={status === "loading"}
        />

        <AuthField
          id="login-password"
          label="Password"
          type="password"
          withReveal
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onValueChange={setPassword}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          error={errorFor("password")}
          disabled={status === "loading"}
        />

        {serverError && <AlertStrip>{serverError}</AlertStrip>}

        <Button
          type="submit"
          disabled={status === "loading"}
          className="h-12 w-full gap-2 text-[15px] font-bold"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    );

  return (
    <AuthSplitLayout
      title="Welcome back"
      description={`Sign in to your ${brand.name} workspace to pick up where you left off.`}
      form={form}
      pending={status === "success"}
      onProvider={handleProvider}
      switchNode={
        <span>
          New to {brand.name}?{" "}
          <Link
            to={`/register${searchParams.get("returnTo") ? `?returnTo=${encodeURIComponent(searchParams.get("returnTo")!)}` : ""}`}
            className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
          >
            Create an account
          </Link>
        </span>
      }
      footer="Encrypted sign-in · sessions expire after 8 hours"
    />
  );
}
