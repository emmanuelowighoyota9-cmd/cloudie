import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Users, Copy, Gift, Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Referrals() {
  const code = useQuery(api.referrals.getMyCode);
  const referrals = useQuery(api.referrals.getMyReferrals);
  const ensureCode = useMutation(api.referrals.ensureCode);
  const applyReferral = useMutation(api.referrals.applyReferral);
  const [applyCode, setApplyCode] = useState("");

  const handleEnsureCode = async () => {
    try {
      await ensureCode();
      toast.success("Referral code generated!");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const handleCopy = () => {
    if (code?.code) {
      navigator.clipboard.writeText(`${window.location.origin}/auth?ref=${code.code}`);
      toast.success("Referral link copied!");
    }
  };

  const handleApply = async () => {
    if (!applyCode.trim()) return;
    try {
      await applyReferral({ code: applyCode.trim() });
      toast.success("Referral applied! You earned 25 points.");
      setApplyCode("");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invite friends and earn 50 points for each referral.</p>
      </div>

      {/* My Code */}
      <Card className="notebook-card">
        <CardContent className="p-6">
          {code === undefined ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
          ) : code === null ? (
            <div className="text-center">
              <Gift className="mx-auto h-10 w-10 text-blue-600 dark:text-blue-400" />
              <p className="mt-3 text-sm text-muted-foreground">Generate your unique referral code to start earning.</p>
              <Button onClick={handleEnsureCode} className="mt-4 gap-2"><LinkIcon className="h-4 w-4" /> Generate Code</Button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Your Referral Code</p>
              <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--nb-rule)] bg-[var(--nb-bg)] px-6 py-3">
                <span className="text-2xl font-bold tracking-widest text-[var(--nb-ink)]">{code.code}</span>
                <Button variant="ghost" size="icon" onClick={handleCopy}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-[var(--nb-ink)]">{code.referralCount}</span> friends referred
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apply Code */}
      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Have a referral code?</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Enter referral code (e.g. CLOUD-ABC123)" value={applyCode} onChange={(e) => setApplyCode(e.target.value.toUpperCase())} className="min-w-0 flex-1" />
            <Button onClick={handleApply} disabled={!applyCode.trim()} className="shrink-0">Apply</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">You'll receive 25 bonus points when you apply a valid code.</p>
        </CardContent>
      </Card>

      {/* Referral History */}
      <Card className="notebook-card">
        <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Referral History</CardTitle></CardHeader>
        <CardContent>
          {!referrals ? <p className="text-sm text-muted-foreground animate-pulse">Loading...</p> : referrals.length === 0 ? (
            <Empty><EmptyMedia variant="icon"><Users /></EmptyMedia><EmptyHeader><EmptyTitle>No referrals yet</EmptyTitle><EmptyDescription>Share your code with friends to start earning.</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <div className="space-y-2">
              {referrals.map((r) => (
                <div key={r._id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--nb-ink)]/5">
                  <div><p className="text-sm font-medium text-[var(--nb-ink)]">Referral</p><p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p></div>
                  <div className="text-right"><Badge variant={r.status === "rewarded" ? "default" : "secondary"}>{r.status}</Badge><p className="mt-1 text-xs text-green-600">+{r.rewardPoints} pts</p></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
