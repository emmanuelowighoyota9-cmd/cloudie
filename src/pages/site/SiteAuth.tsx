import { useParams, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useState } from "react";
import { Landmark, Eye, EyeOff, ArrowRight, UserPlus, LogIn, Lock } from "lucide-react";
import { bankTheme, bankTone } from "@/lib/tenantBankTheme";

export default function SiteAuth() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Design kit from the banking template applied at tenancy creation.
  const theme = bankTheme(site?.branding);
  const { primary, accent, panel, border, muted, radius, inputBg, subtle } = theme;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Authentication itself is handled by Cloudie's auth system, tenant-scoped
      // via the return path — the customer lands back in this tenant's portal.
      navigate(`/auth?returnTo=/site/${siteId}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (site === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }
  if (!site || !site.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Landmark className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">This site is currently unavailable.</p>
        </div>
      </div>
    );
  }

  const fieldStyle = { backgroundColor: inputBg, border: `1px solid ${border}`, color: theme.text, borderRadius: radius } as const;
  const labelStyle = { color: muted } as const;

  return (
    <SiteLayout>
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo + Title */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center shadow-lg" style={{ backgroundColor: primary, borderRadius: radius }}>
              <Landmark className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? `Sign in to ${site.siteName}` : `Open Account at ${site.siteName}`}
            </h1>
            <p className="mt-2 text-sm" style={{ color: muted }}>
              {theme.tagline ?? (mode === "login"
                ? "Access your accounts and manage your finances."
                : "Create your account to get started with digital banking.")}
            </p>
          </div>

          {/* Form Card */}
          <div className="p-6 shadow-sm" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="w-full px-4 py-3 text-sm outline-none transition-all focus:ring-2"
                    style={fieldStyle}
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 text-sm outline-none transition-all focus:ring-2"
                  style={fieldStyle}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium" style={labelStyle}>Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-10 text-sm outline-none transition-all focus:ring-2"
                    style={fieldStyle}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: muted }}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 text-sm" style={{ ...bankTone(theme, "danger"), borderWidth: 1, borderStyle: "solid", borderRadius: radius }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-50"
                style={{ backgroundColor: primary, borderRadius: radius }}
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    {mode === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                className="text-sm font-medium hover:underline"
                style={{ color: accent }}
              >
                {mode === "login"
                  ? "Don't have an account? Open one now"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 p-3 text-xs" style={{ backgroundColor: subtle, border: `1px solid ${border}`, borderRadius: radius, color: muted }}>
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
            <span>
              Sign-in is handled by Cloudie's audited auth service and returns you to {site.siteName}.
              All access attempts are logged.
            </span>
          </div>

          <p className="mt-6 text-center text-xs" style={{ color: muted }}>
            By continuing, you agree to {site.siteName}'s Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}
