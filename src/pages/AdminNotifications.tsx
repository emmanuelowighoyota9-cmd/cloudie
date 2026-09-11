import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Send } from "lucide-react";
import { useState } from "react";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";

const TYPES = ["system", "security", "shipment", "wallet", "marketplace_order", "document", "business", "maintenance"] as const;

export default function AdminNotifications() {
  const history = useQuery(api.adminApi.adminListNotifications, { limit: 200 });

  const send = useMutation(api.adminApi.sendNotification);
  const [broadcast, setBroadcast] = useState(true);
  const [type, setType] = useState<string>("system");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (title.trim().length < 3 || message.trim().length < 3) return;
    setSending(true);
    try {
      const res = await send({ broadcast: true, title: title.trim(), message: message.trim(), type, link: link.trim() || undefined });
      toast.success(`Announcement delivered to ${res.count} users`);
      setTitle("");
      setMessage("");
      setLink("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const filtered = history;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Notification Center"
        description="Send system announcements and review delivery history. All sends are audited."
      />

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 dark:text-white">New announcement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="broadcast" checked={broadcast} onCheckedChange={setBroadcast} />
            <Label htmlFor="broadcast" className="text-sm text-slate-700 dark:text-slate-300">
              Broadcast to all active users
            </Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notif-type" className="text-xs font-medium text-slate-600 dark:text-slate-400">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="notif-type" aria-label="Notification type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notif-link" className="text-xs font-medium text-slate-600 dark:text-slate-400">Optional link</Label>
              <Input id="notif-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/marketplace" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-title" className="text-xs font-medium text-slate-600 dark:text-slate-400">Title</Label>
            <Input id="notif-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance window" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-message" className="text-xs font-medium text-slate-600 dark:text-slate-400">Message</Label>
            <Textarea id="notif-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={800} placeholder="Shipment operations will be briefly paused…" />
          </div>
          <Button onClick={submit} disabled={sending || title.trim().length < 3 || message.trim().length < 3} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send announcement"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <Bell className="h-4 w-4 text-blue-600" /> Delivery history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered === undefined ? (
            <AdminSkeleton rows={4} />
          ) : filtered.length === 0 ? (
            <AdminEmpty message="No notifications sent yet." />
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
              {filtered.map((n) => (
                <div key={n._id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                    <p className="truncate text-xs text-slate-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {n.type.replace(/_/g, " ")} · {fmtDate(n.createdAt)} · {n.isRead ? "read" : "unread"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
