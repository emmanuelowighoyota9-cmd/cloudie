import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import { toast } from "sonner";
import { MessageCircle, Plus, Search, Send, X, Clock3, CheckCircle2, AlertCircle, ChevronRight, LifeBuoy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const categories = ["General", "Payments", "Orders", "VTU", "Marketplace", "Shipments", "Documents", "Account"] as const;
const statuses = ["all", "open", "pending", "resolved", "closed"] as const;

function statusTone(status: string) {
  if (status === "open") return "bg-primary/10 text-primary";
  if (status === "pending") return "bg-amber-500/10 text-amber-600";
  if (status === "resolved") return "bg-emerald-500/10 text-emerald-600";
  return "bg-muted text-muted-foreground";
}
function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function Support() {
  const tickets = useQuery(api.support.listMine, { limit: 100 });
  const createTicket = useMutation(api.support.create);
  const reply = useMutation(api.support.reply);
  const close = useMutation(api.support.close);
  const markRead = useMutation(api.support.markRead);
  const [status, setStatus] = useState<typeof statuses[number]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<any>(null);
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General");
  const [priority, setPriority] = useState<"low"|"normal"|"high"|"urgent">("normal");
  const [message, setMessage] = useState("");
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tickets ?? []).filter(t => (status === "all" || t.status === status) && (!q || t.ticketNumber.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)));
  }, [tickets, status, search]);

  const selected = useQuery(api.support.get, selectedId ? { ticketId: selectedId } : "skip" as any);

  const create = async () => {
    if (!subject.trim() || !message.trim()) return toast.error("Add a subject and message.");
    setSaving(true);
    try {
      const id = await createTicket({ subject, category, priority, message });
      setSubject(""); setMessage(""); setCompose(false); setSelectedId(id);
      toast.success("Support ticket created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create ticket"); }
    finally { setSaving(false); }
  };
  const sendReply = async () => {
    if (!selectedId || !replyText.trim()) return;
    setSaving(true);
    try { await reply({ ticketId: selectedId, message: replyText }); setReplyText(""); toast.success("Reply sent"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not send reply"); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6 sm:space-y-8">
    <section className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LifeBuoy className="size-6"/></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cloudie Support</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Support Center</h1><p className="mt-1 text-sm text-muted-foreground">Get help, track conversations and keep every request in one place.</p></div></div>
        <Button onClick={() => setCompose(true)} className="w-full gap-2 sm:w-auto"><Plus className="size-4"/> New ticket</Button>
      </div>
    </section>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {["all","open","pending","resolved"].map(s => <Card key={s} className="border-border/80"><CardContent className="p-4"><p className="text-xs capitalize text-muted-foreground">{s} tickets</p><p className="mt-2 text-2xl font-bold">{s === "all" ? tickets?.length ?? 0 : tickets?.filter(t => t.status === s).length ?? 0}</p></CardContent></Card>)}
    </div>

    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ticket number, subject or category" className="h-11 pl-9"/></div>
      <div className="flex gap-2 overflow-x-auto pb-1">{statuses.map(s => <button key={s} onClick={() => setStatus(s)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold capitalize ${status === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>{s}</button>)}</div>
    </div>

    {!tickets ? <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Loading your support inbox…</div> : filtered.length === 0 ? <Card><CardContent className="p-10 text-center"><MessageCircle className="mx-auto size-9 text-muted-foreground"/><h2 className="mt-3 font-semibold">No support tickets</h2><p className="mt-1 text-sm text-muted-foreground">Create a ticket whenever you need help from the Cloudie team.</p><Button onClick={() => setCompose(true)} className="mt-4">Open a ticket</Button></CardContent></Card> :
      <div className="grid gap-3">{filtered.map(t => <button key={t._id} onClick={() => { setSelectedId(t._id); if (t.unreadForCustomer) markRead({ ticketId: t._id }); }} className="w-full text-left"><Card className="transition hover:border-primary/30 hover:shadow-sm"><CardContent className="p-4 sm:p-5"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="size-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-primary">{t.ticketNumber}</span><Badge className={`border-0 capitalize ${statusTone(t.status)}`}>{t.status}</Badge>{t.unreadForCustomer > 0 && <Badge className="border-0 bg-destructive/10 text-destructive">New reply</Badge>}</div><h3 className="mt-1 truncate text-sm font-semibold">{t.subject}</h3><p className="mt-1 text-xs text-muted-foreground">{t.category} · Last activity {relativeTime(t.lastMessageAt)}</p></div><ChevronRight className="mt-2 size-4 text-muted-foreground"/></div></CardContent></Card></button>)}</div>}

    {compose && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><Card className="max-h-[90vh] w-full overflow-auto rounded-t-3xl sm:max-w-xl sm:rounded-3xl"><CardContent className="space-y-4 p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Open a support ticket</h2><p className="text-xs text-muted-foreground">Tell us what you need help with.</p></div><Button variant="ghost" size="icon" onClick={() => setCompose(false)}><X/></Button></div><Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What can we help with?" maxLength={120}/><div className="grid grid-cols-2 gap-2"><select value={category} onChange={e=>setCategory(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{categories.map(c=><option key={c}>{c}</option>)}</select><select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">{["low","normal","high","urgent"].map(p=><option key={p}>{p}</option>)}</select></div><Textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Describe the issue, order or service you need help with…" rows={6} maxLength={3000}/><Button disabled={saving} onClick={create} className="w-full h-11">{saving ? "Creating…" : "Create ticket"}</Button></CardContent></Card></div>}

    {selectedId && selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><Card className="max-h-[92vh] w-full overflow-hidden rounded-t-3xl sm:max-w-2xl sm:rounded-3xl"><CardContent className="flex max-h-[92vh] flex-col p-0"><div className="flex items-center justify-between border-b p-4 sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-primary">{selected.ticket.ticketNumber}</span><Badge className={`border-0 capitalize ${statusTone(selected.ticket.status)}`}>{selected.ticket.status}</Badge></div><h2 className="mt-1 truncate text-base font-bold">{selected.ticket.subject}</h2><p className="text-xs text-muted-foreground">{selected.ticket.category} · {selected.ticket.priority} priority</p></div><Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}><X/></Button></div><div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">{selected.messages.map((m: any) => <div key={m._id} className={`flex ${m.senderRole === "customer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 ${m.senderRole === "customer" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}><p className="whitespace-pre-wrap text-sm leading-6">{m.body}</p><p className={`mt-1 text-[10px] ${m.senderRole === "customer" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{relativeTime(m.createdAt)}</p></div></div>)}</div>{selected.ticket.status !== "closed" && <div className="space-y-2 border-t p-4"><Textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Write a reply…" rows={3}/><div className="flex gap-2"><Button onClick={sendReply} disabled={saving || !replyText.trim()} className="flex-1 gap-2"><Send className="size-4"/>Send reply</Button><Button variant="outline" onClick={async()=>{await close({ticketId:selectedId});toast.success("Ticket closed");}} className="gap-2"><CheckCircle2 className="size-4"/>Close</Button></div></div>}</CardContent></Card></div>}
  </div>;
}
