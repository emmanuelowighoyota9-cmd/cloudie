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
import { Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

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

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const initializeUser = useMutation(api.admin.initializeUser);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

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
      const message =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      // Convex Auth surfaces friendly messages for duplicate accounts and
      // invalid credentials; keep them recognizable for the user.
      setError(
        /already|exists|invalid|credentials|password/i.test(message)
          ? message.charAt(0).toUpperCase() + message.slice(1)
          : "Sign-in failed. Please check your details and try again.",
      );
      setIsLoading(false);
    }
  };

  const switchMode = (next: "signIn" | "signUp") => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <img
          src={logo}
          alt="Cloudie"
          width={56}
          height={56}
          className="mb-6 cursor-pointer rounded-xl"
          onClick={() => navigate("/")}
        />
        <Card className="w-full max-w-md rounded-2xl border-slate-200 shadow-md dark:border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
              {mode === "signIn" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">
              {mode === "signIn"
                ? "Sign in to your Cloudie workspace"
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
                <Label htmlFor="password">Password</Label>
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
