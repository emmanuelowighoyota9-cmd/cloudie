import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Bell, Check, CheckCheck, CreditCard, ShoppingBag, Package, ShieldCheck, Info, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

function iconFor(title: string) {
  const value = title.toLowerCase();
  if (value.includes("payment") || value.includes("wallet") || value.includes("fund")) return CreditCard;
  if (value.includes("order") || value.includes("market")) return ShoppingBag;
  if (value.includes("ship") || value.includes("delivery")) return Package;
  if (value.includes("security") || value.includes("account")) return ShieldCheck;
  return Info;
}
function categoryFor(title: string) {
  const value = title.toLowerCase();
  if (value.includes("payment") || value.includes("wallet") || value.includes("fund")) return "Finance";
  if (value.includes("order") || value.includes("market")) return "Orders";
  if (value.includes("ship") || value.includes("delivery")) return "Services";
  if (value.includes("security") || value.includes("account")) return "Security";
  return "Updates";
}
function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function NotificationsPage() {
  const notifications = useQuery(api.notifications.listAll, { limit: 50 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [filter, setFilter] = useState("All");

  const unread = useMemo(() => (notifications ?? []).filter(n => !n.isRead).length, [notifications]);
  const categories = useMemo(() => ["All", "Unread", ...Array.from(new Set((notifications ?? []).map(n => categoryFor(n.title))))], [notifications]);
  const visible = useMemo(() => (notifications ?? []).filter(n => {
    if (filter === "Unread" && n.isRead) return false;
    if (filter !== "All" && filter !== "Unread" && categoryFor(n.title) !== filter) return false;
    return true;
  }), [notifications, filter]);

  return <div className="space-y-6 sm:space-y-8">
    <section className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bell className="size-6"/>{unread > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread}</span>}</div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cloudie Inbox</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Notifications</h1><p className="mt-1 text-sm text-muted-foreground">{unread ? `${unread} unread update${unread === 1 ? "" : "s"} waiting for you.` : "You’re all caught up."}</p></div></div>
        {unread > 0 && <Button variant="outline" onClick={() => markAllRead()} className="w-full gap-2 sm:w-auto"><CheckCheck className="size-4"/>Mark all read</Button>}
      </div>
    </section>

    <div className="flex gap-2 overflow-x-auto pb-1">
      {categories.map(category => <button key={category} onClick={() => setFilter(category)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{category}{category === "Unread" && unread > 0 ? ` ${unread}` : ""}</button>)}
    </div>

    {!notifications ? <div className="space-y-3">{[1,2,3,4].map(i => <Card key={i}><CardContent className="p-5 animate-pulse"><div className="flex gap-3"><div className="size-10 rounded-xl bg-muted"/><div className="flex-1 space-y-2"><div className="h-3 w-40 rounded bg-muted"/><div className="h-2 w-full max-w-lg rounded bg-muted"/><div className="h-2 w-20 rounded bg-muted"/></div></div></CardContent></Card>)}</div> :
    visible.length === 0 ? <Empty><EmptyMedia variant="icon"><Sparkles/></EmptyMedia><EmptyHeader><EmptyTitle>{filter === "Unread" ? "Nothing unread" : "No notifications here"}</EmptyTitle><EmptyDescription>{filter === "Unread" ? "You’re completely caught up." : "New Cloudie activity will appear here."}</EmptyDescription></EmptyHeader></Empty> :
    <div className="space-y-3">{visible.map(n => { const Icon = iconFor(n.title); const category = categoryFor(n.title); return <Card key={n._id} className={`overflow-hidden transition hover:border-primary/30 ${!n.isRead ? "border-primary/25 bg-primary/[0.025]" : ""}`}><CardContent className="p-4 sm:p-5"><div className="flex items-start gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${!n.isRead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="size-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-semibold text-foreground">{n.title}</p>{!n.isRead && <Badge className="border-0 bg-primary/10 text-primary text-[9px]">NEW</Badge>}</div><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{n.message}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span>{relativeTime(n.createdAt)}</span><span>·</span><span>{category}</span><span>·</span><span>{new Date(n.createdAt).toLocaleString()}</span></div></div>{!n.isRead && <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Mark notification as read" onClick={() => markRead({ id: n._id })}><Check className="size-4"/></Button>}</div></CardContent></Card>})}</div>}
  </div>;
}
