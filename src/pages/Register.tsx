import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformConfig } from "@/hooks/use-platform-config";
import { neonApi } from "@/lib/neonApi";
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
 * `/register` — the sign-up half of the split-screen auth pair.
 *
 * Validators are value-based rather than field-based because `confirm`
 * depends on `password`: re-validating on every render means fixing the
 * first password immediately clears the mismatch under the second field.
 *
 * The display name is derived from the email local part — the API requires
 * one, and asking for it here would add a field this flow does not want.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Values = { email: string; password: string; confirm: string; referral: string };
type FieldKey = keyof Values;

const VALIDATORS: Record<FieldKey, (values: Values) => string | null> = {
  email: (values) => {
    const email = values.email.trim();
    if (!email) return "Enter your email address.";
    if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
    return null;
  },
  password: (values) => {
    if (!values.password) return "Create a password.";
    if (values.password.length < 8) return "Use at least 8 characters.";
    return null;
  },
  confirm: (values) => {
    if (!values.confirm) return "Confirm your password.";
    if (values.confirm !== values.password) return "Passwords don't match.";
    return null;
  },
  referral: (values) => {
    const code = values.referral.trim();
    if (!code) return null;
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(code)) {
      return "Codes are 3–32 letters, numbers, dashes or underscores.";
    }
    return null;
  },
};

export default function RegisterPage({ redirectAfterAuth = "/dashboard" }: { redirectAfterAuth?: string }) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { brand } = usePlatformConfig();
  const [searchParams] = useSearchParams();
  const redirect = resolveAuthRedirect(searchParams.get("returnTo"), redirectAfterAuth);

  const [values, setValues] = useState<Values>({
    email: "",
    password: "",
    confirm: "",
    referral: "",
  });
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const setValue = (key: FieldKey, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const touch = (key: FieldKey) =>
    setTouched((current) => ({ ...current, [key]: true }));

  const errorFor = (key: FieldKey): string | null =>
    touched[key] ? VALIDATORS[key](values) : null;

  useEffect(() => {
    if (isAuthenticated && !authLoading && status === "idle") setStatus("success");
  }, [isAuthenticated, authLoading, status]);

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => navigate(redirect, { replace: true }), 900);
    return () => clearTimeout(timer);
  }, [status, navigate, redirect]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "idle") return;
    setServerError(null);
    setTouched({ email: true, password: true, confirm: true, referral: true });

    const firstError =
      VALIDATORS.email(values) ??
      VALIDATORS.password(values) ??
      VALIDATORS.confirm(values) ??
      VALIDATORS.referral(values);
    if (firstError) return;

    setStatus("loading");
    try {
      const email = values.email.trim().toLowerCase();
      const referral = values.referral.trim();
      // The display name is derived: the API requires one and this flow has
      // no name field. The referral code rides along for the API to honour
      // once referrals are wired; it is ignored by the current schema.
      type RegisterPayload = {
        name: string;
        email: string;
        password: string;
        referralCode?: string;
      };
      const payload: RegisterPayload = {
        name: email.split("@")[0] || "Member",
        email,
        password: values.password,
        ...(referral ? { referralCode: referral } : {}),
      };
      await neonApi.register(payload);
      setStatus("success");
    } catch (err) {
      setServerError(describeAuthError(err, "register"));
      setStatus("idle");
    }
  };

  const handleProvider = (provider: OAuthProvider) => {
    const label = provider === "google" ? "Google" : "GitHub";
    setServerError(`${label} sign-in isn't connected to this workspace yet. Use your email and password to continue.`);
  };

  const returnTo = searchParams.get("returnTo");

  const form =
    status === "success" ? (
      <RedirectSkeleton
        title="Account created"
        hint="Preparing your workspace…"
      />
    ) : (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <AuthField
          id="register-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={values.email}
          onValueChange={(value) => setValue("email", value)}
          onBlur={() => touch("email")}
          error={errorFor("email")}
          disabled={status === "loading"}
        />

        <AuthField
          id="register-password"
          label="Password"
          type="password"
          withReveal
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={values.password}
          onValueChange={(value) => setValue("password", value)}
          onBlur={() => touch("password")}
          error={errorFor("password")}
          disabled={status === "loading"}
        />

        <AuthField
          id="register-confirm"
          label="Confirm password"
          type="password"
          withReveal
          autoComplete="new-password"
          placeholder="Type it again"
          value={values.confirm}
          onValueChange={(value) => setValue("confirm", value)}
          onBlur={() => touch("confirm")}
          error={errorFor("confirm")}
          disabled={status === "loading"}
        />

        <AuthField
          id="register-referral"
          label="Referral code"
          optional
          hint={`Have a friend already on ${brand.name}? Their code goes here.`}
          value={values.referral}
          onValueChange={(value) => setValue("referral", value)}
          onBlur={() => touch("referral")}
          error={errorFor("referral")}
          disabled={status === "loading"}
        />

        {serverError && <AlertStrip>{serverError}</AlertStrip>}

        <Button
          type="submit"
          disabled={status === "loading"}
          className="h-11 w-full rounded-xl text-sm font-semibold sm:h-10"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    );

  return (
    <AuthSplitLayout
      title="Create your account"
      description={`Set up your ${brand.name} workspace in under a minute.`}
      form={form}
      pending={status === "success"}
      onProvider={handleProvider}
      switchNode={
        <span>
          Already have an account?{" "}
          <Link
            to={`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
            className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
          >
            Sign in
          </Link>
        </span>
      }
      footer="Encrypted storage · your session expires after 8 hours"
    />
  );
}
