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

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  submitted: "bg-amber-100 text-amber-700 border-amber-200",
  under_review: "bg-blue-100 text-blue-700 border-blue-200",
  resubmission_required: "bg-orange-100 text-orange-700 border-orange-200",
};

export default function SiteKyc() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = useQuery(api.tenants.publicGet, siteId ? { id: siteId as Id<"tenantSites"> } : "skip");
  const kyc = useQuery(api.tenants.myKyc, siteId ? { tenantId: siteId as Id<"tenantSites"> } : "skip");
  const submitKyc = useMutation(api.tenants.customerSubmitKyc);
  const primary = site?.branding?.primaryColor || "#003087";
  if (!site) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Site not found</div></div>;

  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <SiteLayout authenticated>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Identity Verification</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verify your identity to unlock full {site.siteName} features.
          </p>
        </div>

        {/* Current Status */}
        {latest ? (
          <div className="rounded-2xl border bg-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                latest.status === "approved" ? "bg-emerald-100" : latest.status === "rejected" ? "bg-red-100" : "bg-amber-100"
              }`}>
                {latest.status === "approved" ? <CheckCircle className="h-5 w-5 text-emerald-600" /> :
                 latest.status === "rejected" ? <XCircle className="h-5 w-5 text-red-600" /> :
                 <Clock className="h-5 w-5 text-amber-600" />}
              </div>
              <div>
                <p className="font-bold text-gray-900 capitalize">{latest.status.replace(/_/g, " ")}</p>
                <p className="text-xs text-gray-400">Submitted {fmtDate(latest.createdAt)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div><span className="text-gray-400">Full Name</span><p className="font-medium text-gray-900">{latest.fullName}</p></div>
              {latest.dateOfBirth && <div><span className="text-gray-400">Date of Birth</span><p className="font-medium text-gray-900">{latest.dateOfBirth}</p></div>}
            </div>

            {latest.notes && (
              <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
                <span className="font-medium">Reviewer notes: </span>{latest.notes}
              </div>
            )}

            {latest.status === "resubmission_required" && (
              <div className="mt-4 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Additional information is required. Please submit an updated application.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
            <ShieldCheck className="mx-auto h-14 w-14 text-gray-300" />
            <h3 className="mt-4 text-lg font-bold text-gray-900">Not Verified</h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
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
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.01]"
                style={{ backgroundColor: primary }}
              >
                <FileText className="h-4 w-4" />
                {latest?.status === "resubmission_required" ? "Resubmit KYC" : "Start Verification"}
              </button>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
                <h3 className="font-bold text-gray-900">Identity Information</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Legal Name *</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    placeholder="As it appears on your ID" required autoFocus
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setFormOpen(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button onClick={handleSubmit} disabled={busy || !fullName.trim()} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 shadow-lg" style={{ backgroundColor: primary }}>
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
            <h3 className="text-sm font-bold text-gray-900 mb-3">Verification History</h3>
            <div className="space-y-2">
              {kyc.slice(1).map((k) => (
                <div key={k._id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLES[k.status] || "bg-gray-100 text-gray-600"}`}>
                    {k.status.replace(/_/g, " ")}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{k.fullName}</p>
                    <p className="text-xs text-gray-400">{fmtDate(k.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
