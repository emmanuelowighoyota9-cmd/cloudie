import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminEmpty, AdminPageHeader, AdminSkeleton, StatusBadge, fmtDate } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const notificationTypes = ["system", "marketplace", "shipment", "points", "document"] as const;

export default function AdminNotifications() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<(typeof notificationTypes)[number]>("system");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const notifications = useQuery(api.adminApi.adminListNotifications, { limit: 100 });
  const sendNotification = useMutation(api.adminApi.sendNotification);

  const unreadCount = useMemo(() => notifications?.filter((item) => !item.isRead).length ?? 0, [notifications]);

  const submit = async () => {
    if (!title.trim() || !message.trim() || busy) return;
    setBusy(true);
    try {
      const result = await sendNotification({
        broadcast: true,
        title: title.trim(),
        message: message.trim(),
        type,
        link: link.trim() || undefined,
      });
      setTitle("");
      setMessage("");
      setLink("");
      toast.success(`Broadcast sent to ${result.count.toLocaleString()} users`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Notifications"
        description="Broadcast platform updates and review recent notification history."
        actions={<StatusBadge status={`${unreadCount} unread`} />}
      />

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-2">
            <Label htmlFor="notification-title">Title</Label>
            <Input id="notification-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Platform maintenance notice" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as (typeof notificationTypes)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {notificationTypes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notification-link">Link</Label>
              <Input id="notification-link" value={link} onChange={(event) => setLink(event.target.value)} placeholder="/dashboard" />
            </div>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="notification-message">Message</Label>
            <Textarea
              id="notification-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write a concise update for all active users."
              rows={4}
            />
          </div>
          <div className="lg:col-span-2">
            <Button className="gap-2" onClick={submit} disabled={busy || !title.trim() || !message.trim()}>
              <Send className="h-4 w-4" />
              Send broadcast
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent notifications</h2>
        {notifications === undefined ? (
          <AdminSkeleton rows={5} />
        ) : notifications.length === 0 ? (
          <AdminEmpty message="No notifications have been sent." />
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <Card key={notification._id} className="rounded-xl border-border bg-card shadow-sm">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{notification.title}</p>
                      <StatusBadge status={notification.type} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{fmtDate(notification.createdAt)} · {notification.isRead ? "Read" : "Unread"}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
