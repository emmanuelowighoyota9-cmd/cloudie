import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, CheckCircle, XCircle, Clock, FileText, AlertTriangle,
} from "lucide-react";
import { bankTheme, bankTone, type BankTone } from "@/lib/tenantBankTheme";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_TONE: Record<string, BankTone> = {
  approved: "success",
  rejected: "danger",
  submitted: "warning",
  under_review: "info",
  resubmission_required: "warning",
};

export default function SiteKyc() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const kyc = useQuery(api.tenants.myKyc, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const submitKyc = useMutation(api.tenants.customerSubmitKyc);

  // Design kit from the banking template applied at tenancy creation.
  const theme = bankTheme(site?.branding);
  const { primary, panel, border, text, muted, radius, inputBg, divider, subtle } = theme;

  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);

  if (!site) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Site not found</div></div>;

  const latest = kyc?.[0] ?? null;
  const canSubmit = !latest || latest.status === "resubmission_required";

  const handleSubmit = async () => {
    if (!fullName.trim() || !siteId) return;
    setBusy(true);
    try {
      await submitKyc({ tenantId: siteId as Id<"tenantSites">, fullName: fullName.trim(), dateOfBirth: dob || undefined });
      toast.success("KYC submitted successfully");
      setFormOpen(false); setFullName(""); setDob("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (site === undefined || kyc === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }

  const fieldStyle = { backgroundColor: inputBg, border: `1px solid ${border}`, color: text, borderRadius: radius } as const;
  const latestTone: BankTone = latest ? STATUS_TONE[latest.status] ?? "neutral" : "neutral";
  const tone = bankTone(theme, latestTone);

  return (
    <SiteLayout authenticated>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Identity Verification</h1>
          <p className="mt-1 text-sm" style={{ color: muted }}>
            Verify your identity to unlock full {site.siteName} features.
          </p>
        </div>

        {/* Current Status */}
        {latest ? (
          <div className="p-6" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: tone.bg }}>
                {latest.status === "approved" ? <CheckCircle className="h-5 w-5" style={{ color: tone.fg }} /> :
                  latest.status === "rejected" ? <XCircle className="h-5 w-5" style={{ color: tone.fg }} /> :
                    <Clock className="h-5 w-5" style={{ color: tone.fg }} />}
              </div>
              <div>
                <p className="font-bold capitalize">{latest.status.replace(/_/g, " ")}</p>
                <p className="text-xs" style={{ color: muted }}>Submitted {fmtDate(latest.createdAt)}</p>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="text-xs" style={{ color: muted }}>Full Name</span>
                <p className="font-medium">{latest.fullName}</p>
              </div>
              {latest.dateOfBirth && (
                <div>
                  <span className="text-xs" style={{ color: muted }}>Date of Birth</span>
                  <p className="font-medium">{latest.dateOfBirth}</p>
                </div>
              )}
            </div>

            {latest.notes && (
              <div className="mt-4 p-3 text-sm" style={{ backgroundColor: subtle, border: `1px solid ${border}`, borderRadius: radius }}>
                <span className="font-medium">Reviewer notes: </span>{latest.notes}
              </div>
            )}

            {latest.status === "resubmission_required" && (
              <div className="mt-4 flex items-center gap-2 p-3 text-sm"
                style={{ ...bankTone(theme, "warning"), borderWidth: 1, borderStyle: "solid", borderRadius: radius }}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Additional information is required. Please submit an updated application.
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-center" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
            <ShieldCheck className="mx-auto h-14 w-14" style={{ color: muted }} />
            <h3 className="mt-4 text-lg font-bold">Not Verified</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: muted }}>
              Submit your identity to access all features including higher transaction limits and account management.
            </p>
          </div>
        )}

        {/* Submit Button / Form */}
        {canSubmit && (
          <>
            {!formOpen ? (
              <button
                onClick={() => setFormOpen(true)}
                className="flex w-full items-center justify-center gap-2 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.01]"
                style={{ backgroundColor: primary, borderRadius: radius }}
              >
                <FileText className="h-4 w-4" />
                {latest?.status === "resubmission_required" ? "Resubmit KYC" : "Start Verification"}
              </button>
            ) : (
              <div className="space-y-4 p-6" style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
                <h3 className="font-bold">Identity Information</h3>
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: muted }}>Full Legal Name *</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    placeholder="As it appears on your ID" required autoFocus
                    className="w-full px-4 py-3 text-sm outline-none" style={fieldStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: muted }}>Date of Birth</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                    className="w-full px-4 py-3 text-sm outline-none" style={fieldStyle} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setFormOpen(false)} className="flex-1 py-2.5 text-sm font-medium"
                    style={{ border: `1px solid ${border}`, borderRadius: radius, color: muted }}>
                    Cancel
                  </button>
                  <button onClick={handleSubmit} disabled={busy || !fullName.trim()}
                    className="flex-1 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
                    style={{ backgroundColor: primary, borderRadius: radius }}>
                    {busy ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* History */}
        {kyc && kyc.length > 1 && (
          <div>
            <h3 className="mb-3 text-sm font-bold">Verification History</h3>
            <div className="space-y-2">
              {kyc.slice(1).map((k) => {
                const t = bankTone(theme, STATUS_TONE[k.status] ?? "neutral");
                return (
                  <div key={k._id} className="flex items-center gap-3 p-4"
                    style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: radius }}>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold capitalize"
                      style={{ backgroundColor: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
                      {k.status.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm">{k.fullName}</p>
                      <p className="text-xs" style={{ color: muted }}>{fmtDate(k.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ borderTop: `1px solid ${divider}` }} />
      </div>
    </SiteLayout>
  );
}
