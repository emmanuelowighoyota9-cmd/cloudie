import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminEmpty,
  AdminPageHeader,
  AdminSkeleton,
  fmtDate,
} from "@/components/admin/shared";
import { motion } from "framer-motion";
import { KeyRound, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Super-admin console: manage who can sign in to the Cloudie platform console.
 *
 * Adding an administrator creates a real password account (same Scrypt hashing
 * as a normal sign-up) on the deployment that serves this page, so the new
 * administrator signs in through the standard /admin/login form. Every
 * creation is written to the audit log.
 */
export default function AdminAdministrators() {
  const { user } = useAuth();
  const admins = useQuery(api.admin.listAdministrators, {});
  const createAdministrator = useAction(api.adminSeed.createAdministrator);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
  };

  const handleCreate = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const result = await createAdministrator({
        name: name.trim(),
        email: cleanEmail,
        password,
      });
      toast.success(
        result.status === "promoted"
          ? `${cleanEmail} already had an account — administrator access granted`
          : `${cleanEmail} can now sign in to the admin console`,
      );
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create administrator");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Administrators"
        description="Accounts that can sign in to the Cloudie platform console at /admin/login."
        actions={
          <Button
            onClick={() => setOpen(true)}
            className="gap-2 bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-700 hover:to-orange-700"
          >
            <UserPlus className="h-4 w-4" />
            Add administrator
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-2 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Platform administrators
            </CardTitle>
            <CardDescription>
              Server-verified on every admin request — roles never come from the client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {admins === undefined ? (
              <AdminSkeleton rows={3} />
            ) : admins.length === 0 ? (
              <AdminEmpty
                message="No administrators found"
                hint="Use the button above to create one."
              />
            ) : (
              admins.map((admin, index) => (
                <motion.div
                  key={admin._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900 dark:text-white">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {admin.email ?? "no email"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {admin.name ?? "Administrator"} · added {fmtDate(admin.createdAt)} · last
                      active {fmtDate(admin.lastActiveAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {admin.isAnonymous && (
                      <Badge variant="outline" className="border-amber-400 text-amber-600">
                        no email
                      </Badge>
                    )}
                    {user?.email && admin.email === user.email && (
                      <Badge className="bg-emerald-600 text-white">you</Badge>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-slate-500" />
              Signing in
            </CardTitle>
            <CardDescription>How administrator access works.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            <p>
              Administrators sign in at <span className="font-medium text-slate-700 dark:text-slate-200">/admin/login</span>{" "}
              with the email and password set here.
            </p>
            <p>
              Lost the password? Use{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Forgot the administrator password?
              </span>{" "}
              on the sign-in page — a 6-digit code is emailed to the account.
            </p>
            <p>
              Adding an administrator is always recorded in the audit log with your
              identity and a timestamp.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setOpen(false);
            reset();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add an administrator</DialogTitle>
            <DialogDescription>
              Creates a password login with full access to the platform console. If
              the email already has an account, entering its password promotes it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-name">Full name</Label>
              <Input
                id="admin-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cloudie Administrator"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">
                Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={busy}
              className="gap-2 bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-700 hover:to-orange-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create administrator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
