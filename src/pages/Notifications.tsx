import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";

export default function NotificationsPage() {
  const notifications = useQuery(api.notifications.listAll, { limit: 50 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Stay updated on your account activity.</p>
        </div>
        {notifications && notifications.some((n) => !n.isRead) && (
          <Button variant="outline" size="sm" onClick={() => markAllRead()} className="gap-1.5">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      {!notifications ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="notebook-card"><CardContent className="p-4 animate-pulse"><div className="flex gap-3"><div className="h-8 w-8 rounded-full bg-muted" /><div className="flex-1 space-y-1"><div className="h-3 w-40 bg-muted rounded" /><div className="h-2 w-60 bg-muted rounded" /></div></div></CardContent></Card>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><Bell /></EmptyMedia>
          <EmptyHeader><EmptyTitle>No notifications</EmptyTitle></EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n._id} className={`notebook-card transition-colors ${!n.isRead ? "border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${!n.isRead ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400" : "bg-muted text-muted-foreground"}`}>
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--nb-ink)]">{n.title}</p>
                      {!n.isRead && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  {!n.isRead && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => markRead({ id: n._id })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
