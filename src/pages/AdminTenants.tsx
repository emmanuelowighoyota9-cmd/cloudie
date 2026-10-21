import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminPageHeader, AdminEmpty, AdminSkeleton, StatusBadge, fmtDate } from "@/components/admin/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, Lock, LockOpen, Search, ShieldAlert } from "lucide-react";

type Site = { _id:string; siteName:string; subdomain:string; siteType:string; isActive:boolean; ownerId:string; ownerName?:string; ownerEmail?:string; renewalDate?:number; contactEmail?:string; contactPhone?:string };
export default function AdminTenants() {
  const tenants = useQuery(api.tenants.adminList, { limit: 300 }) as Site[] | undefined;
  const flags = useQuery(api.adminApi.listModerationFlags, { limit: 100 });
  const lockdown = useMutation(api.tenants.adminLockdown);
  const unlock = useMutation(api.adminApi.unlockTenant);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("all");
  const [view,setView]=useState<Site|null>(null);
  const [locking,setLocking]=useState<Site|null>(null);
  const [typedName,setTypedName]=useState("");
  const [reason,setReason]=useState("");
  const [unlocking,setUnlocking]=useState<Site|null>(null);
  const [unlockReason,setUnlockReason]=useState("");
  const [busy,setBusy]=useState(false);
  const filtered=useMemo(()=> (tenants??[]).filter(t=>
    (status==="all"||(status==="active"&&t.isActive)||(status==="locked"&&!t.isActive)) &&
    (!search.trim()||[t.siteName,t.subdomain,t.ownerName,t.ownerEmail].some(v=>String(v??"").toLowerCase().includes(search.trim().toLowerCase())))
  ),[tenants,status,search]);
  const flagsFor=(id:string)=> (flags??[]).filter(f=>String(f.tenantId)===id && f.status==="open");
  const doLock=async()=>{ if(!locking||typedName!==locking.siteName||reason.trim().length<10)return;setBusy(true);try{await lockdown({tenantId:locking._id as never,reason:reason.trim()});toast.success("Site locked down and audit logged");setLocking(null);setTypedName("");setReason("");}catch(e){toast.error(e instanceof Error?e.message:"Lockdown failed");}finally{setBusy(false)} };
  const doUnlock=async()=>{if(!unlocking||unlockReason.trim().length<10)return;setBusy(true);try{await unlock({tenantId:unlocking._id as never,reason:unlockReason.trim()});toast.success("Site reactivated and audit logged");setUnlocking(null);setUnlockReason("");}catch(e){toast.error(e instanceof Error?e.message:"Reactivation failed");}finally{setBusy(false)}};
  return <div className="space-y-4">
    <AdminPageHeader title="Tenant sites" description="Sub-tenant inventory, ownership, compliance flags, renewal dates, and audited availability controls."/>
    <Card className="rounded-lg shadow-none"><CardContent className="flex flex-wrap items-center gap-2 p-3">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} className="pl-9" placeholder="Search site, owner, subdomain"/></div>
      <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Filter tenant status" className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="locked">Locked down</option></select>
      <span className="text-xs text-muted-foreground">{tenants===undefined?"Loading sites…":`${filtered.length} of ${tenants.length} sites`}</span>
    </CardContent></Card>
    {tenants===undefined?<AdminSkeleton rows={6}/>:!filtered.length?<AdminEmpty message="No tenant sites match your filters."/>:
    <Card className="overflow-hidden rounded-lg shadow-none"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-xs">
      <thead className="border-b bg-muted/40 text-muted-foreground"><tr>{["Site","Owner","Subdomain","Status","Compliance flags","Renewal","Actions"].map(h=><th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>{filtered.map(t=>{const openFlags=flagsFor(t._id);return <tr key={t._id} className="border-b last:border-0 hover:bg-muted/20">
        <td className="px-3 py-3"><p className="font-semibold">{t.siteName}</p><p className="mt-0.5 text-muted-foreground">{t.siteType}</p></td>
        <td className="px-3 py-3"><p>{t.ownerName??"Unknown owner"}</p><p className="mt-0.5 text-muted-foreground">{t.ownerEmail||String(t.ownerId).slice(-10)}</p></td>
        <td className="px-3 py-3 font-mono">{t.subdomain}</td><td className="px-3 py-3"><StatusBadge status={t.isActive?"active":"locked"}/></td>
        <td className="px-3 py-3">{openFlags.length?<div className="flex flex-wrap gap-1">{openFlags.slice(0,3).map(f=><Badge key={f._id} variant="outline" className="border-amber-500/40 text-amber-700">{f.rule}</Badge>)}{openFlags.length>3&&<Badge variant="outline">+{openFlags.length-3}</Badge>}</div>:<span className="text-muted-foreground">No open flags</span>}</td>
        <td className="whitespace-nowrap px-3 py-3">{t.renewalDate?fmtDate(t.renewalDate):"Not scheduled"}</td>
        <td className="px-3 py-3"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>setView(t)}><Eye className="mr-1 size-3.5"/>View</Button>{t.isActive?<Button size="sm" variant="outline" className="text-destructive" onClick={()=>{setLocking(t);setTypedName("");setReason("")}}><Lock className="mr-1 size-3.5"/>Lockdown</Button>:<Button size="sm" variant="outline" onClick={()=>{setUnlocking(t);setUnlockReason("")}}><LockOpen className="mr-1 size-3.5"/>Reactivate</Button>}</div></td>
      </tr>})}</tbody>
    </table></div></Card>}
    {locking&&<Dialog open onOpenChange={open=>{if(!open&&!busy)setLocking(null)}}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="size-5"/>Confirm site lockdown</DialogTitle><DialogDescription>This privileged action is immediate and will be recorded in the audit trail.</DialogDescription></DialogHeader>
      <div className="space-y-3"><div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="font-semibold text-destructive">Site will be immediately unreachable. This action is audited.</p><p className="mt-1 text-xs text-muted-foreground">Site: {locking.siteName} · {locking.subdomain}</p></div>
      <div className="space-y-1"><label className="text-xs font-medium">Type the exact site name to confirm</label><Input value={typedName} onChange={e=>setTypedName(e.target.value)} placeholder={locking.siteName} autoComplete="off"/></div>
      <div className="space-y-1"><label className="text-xs font-medium">Reason (minimum 10 characters)</label><Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this site must be taken offline" rows={3}/></div></div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setLocking(null)}>Cancel</Button><Button variant="destructive" disabled={busy||typedName!==locking.siteName||reason.trim().length<10} onClick={doLock}>{busy?"Locking down…":"Confirm lockdown"}</Button></DialogFooter></DialogContent></Dialog>}
    {unlocking&&<Dialog open onOpenChange={open=>{if(!open&&!busy)setUnlocking(null)}}><DialogContent><DialogHeader><DialogTitle>Reactivate tenant site</DialogTitle><DialogDescription>Restore availability for {unlocking.siteName}. This action is audit logged.</DialogDescription></DialogHeader><div className="space-y-1"><label className="text-xs font-medium">Reason (minimum 10 characters)</label><Textarea value={unlockReason} onChange={e=>setUnlockReason(e.target.value)} placeholder="Reason for restoring the site" rows={3}/></div><DialogFooter><Button variant="outline" onClick={()=>setUnlocking(null)}>Cancel</Button><Button disabled={busy||unlockReason.trim().length<10} onClick={doUnlock}>{busy?"Reactivating…":"Reactivate site"}</Button></DialogFooter></DialogContent></Dialog>}
    {view&&<Dialog open onOpenChange={open=>!open&&setView(null)}><DialogContent><DialogHeader><DialogTitle>{view.siteName}</DialogTitle><DialogDescription>Tenant site inventory details</DialogDescription></DialogHeader><div className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Subdomain</span><span className="font-mono">{view.subdomain}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Owner</span><span>{view.ownerName??"Unknown owner"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Owner email</span><span>{view.ownerEmail||"Not provided"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Type / status</span><span>{view.siteType} · {view.isActive?"Active":"Locked"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Renewal</span><span>{view.renewalDate?fmtDate(view.renewalDate):"Not scheduled"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Contact</span><span>{view.contactEmail??"—"} {view.contactPhone??""}</span></div></div><DialogFooter><Button onClick={()=>setView(null)}>Close</Button></DialogFooter></DialogContent></Dialog>}
  </div>;
}
