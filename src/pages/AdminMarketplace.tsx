import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Ban, Check, RotateCcw, X, RefreshCw, Store, Boxes, PackageCheck, FileText, type LucideIcon } from "lucide-react";
import { AdminPageHeader, StatusBadge, AdminEmpty, AdminSkeleton, fmtDate } from "@/components/admin/shared";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatNgn } from "@/lib/pricing";

const MARKETPLACE_I = [
  "Discord", "Texting Numbers", "Outlook", "Apple", "Emails", "VPN", "Snapchat",
  "Reddit", "Twitter", "Instagram", "TikTok", "Facebook", "Gomeo Edu",
  "Netflix Premium", "Clone Tiik.T0k", "Aged Farming Clones",
];
const MARKETPLACE_II = [
  "Facebook", "Instagram", "New FB Accounts", "Pinterest", "Random Countries FB",
  "Self-created and Nurtured Accounts", "TikTok Account",
];

const matches = (product: { category: string; name: string }, terms: string[]) => {
  const haystack = `${product.category} ${product.name}`.toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
};

export default function AdminMarketplace() {
  const products = useQuery(api.marketplace.adminListAllProducts, { limit: 200 });
  const approve = useMutation(api.marketplace.adminApproveProduct);
  const toggleActive = useMutation(api.adminApi.adminToggleProductActive);
  const provider = useQuery(api.marketplace.getLogspanelAdminStatus, {});
  const providerProducts = useQuery(api.marketplace.getLogspanelProducts, { limit: 200 });
  const syncCatalog = useAction(api.logspanel.syncCatalog);
  const saveProvider = useMutation(api.marketplace.setLogspanelSettings);
  const [syncing, setSyncing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [markup, setMarkup] = useState("0");
  const disputes = useQuery(api.adminApi.adminListDisputes, { limit: 100 });
  const orders = useQuery(api.admin.adminListOrders, { limit: 500 });
  const releaseEscrow = useMutation(api.adminApi.releaseEscrow);
  const refundOrder = useMutation(api.adminApi.refundOrder);
  const partialRefund = useMutation(api.adminApi.partialRefundDispute);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [partialTarget, setPartialTarget] = useState<any>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialReason, setPartialReason] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolving, setResolving] = useState(false);
  const orderMap = new Map<string, any>((orders ?? []).map((o: any) => [String(o._id), o]));
  const openDisputes = (disputes ?? []).filter((d: any) => d.status === "open" || d.status === "under_review");
  const selectedDispute = openDisputes.find((d: any) => String(d._id) === selectedDisputeId) ?? openDisputes[0] ?? null;
  const selectedOrder = selectedDispute ? orderMap.get(String(selectedDispute.orderId)) : null;
  async function resolveCase(kind: "release" | "refund") {
    if (!selectedDispute || !selectedOrder || resolutionReason.trim().length < 10) { toast.error("Enter a reason of at least 10 characters."); return; }
    setResolving(true); try {
      if (kind === "release") await releaseEscrow({ orderId: selectedOrder._id as never, reason: resolutionReason.trim(), disputeId: selectedDispute._id as never });
      else await refundOrder({ orderId: selectedOrder._id as never, reason: resolutionReason.trim(), disputeId: selectedDispute._id as never });
      toast.success(kind === "release" ? "Escrow released and action audited" : "Buyer refunded and action audited"); setResolutionReason(""); setSelectedDisputeId(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Dispute action failed"); } finally { setResolving(false); }
  }
  async function submitPartialRefund() {
    if (!partialTarget || !Number.isFinite(Number(partialAmount)) || Number(partialAmount) <= 0 || partialReason.trim().length < 10) return;
    setResolving(true); try { await partialRefund({ disputeId: partialTarget._id as never, amountNgn: Number(partialAmount), reason: partialReason.trim() });
      toast.success("Partial refund completed and audit logged"); setPartialTarget(null); setPartialAmount(""); setPartialReason(""); setSelectedDisputeId(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Partial refund failed"); } finally { setResolving(false); }
  }

  useEffect(() => {
    if (provider) {
      setEnabled(provider.enabled);
      setMarkup(String(provider.markupPercent));
    }
  }, [provider?.enabled, provider?.markupPercent]);

  const summary = useMemo(() => {
    const all = products ?? [];
    const marketplaceI = all.filter((p) => matches(p, MARKETPLACE_I)).length;
    const marketplaceII = all.filter((p) => matches(p, MARKETPLACE_II)).length;
    const providerStock = all.reduce((sum, p) => sum + (p.providerAvailableQuantity ?? 0), 0);
    const lowStock = all.filter((p) => p.providerAvailableQuantity !== undefined && p.providerAvailableQuantity <= 10).length;
    return { total: all.length, marketplaceI, marketplaceII, providerStock, lowStock };
  }, [products]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await syncCatalog({});
      toast.success(`Logspanel synced: ${result.created} created, ${result.updated} updated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Catalog sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const saveProviderSettings = async () => {
    try {
      await saveProvider({ enabled, markupPercent: Number(markup) });
      toast.success("Logspanel settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    }
  };

  const act = async (productId: string, doApprove: boolean) => {
    try {
      await approve({ productId: productId as never, approve: doApprove });
      toast.success(doApprove ? "Product approved" : "Product rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operation failed");
    }
  };

  const toggle = async (productId: string, isActive: boolean) => {
    try {
      await toggleActive({ productId: productId as never, isActive: !isActive });
      toast.success(isActive ? "Product disabled" : "Product re-enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operation failed");
    }
  };

  const summaryCards: Array<{ label: string; value: string | number; Icon: LucideIcon }> = [
    { label: "Products", value: summary.total, Icon: Boxes },
    { label: "Marketplace I", value: summary.marketplaceI, Icon: Store },
    { label: "Marketplace II", value: summary.marketplaceII, Icon: Store },
    { label: "Provider stock", value: summary.providerStock.toLocaleString(), Icon: PackageCheck },
    { label: "Low stock", value: summary.lowStock, Icon: PackageCheck },
  ];

  return (
    <div className="space-y-4">
      <Tabs defaultValue="catalog" className="space-y-4"><TabsList><TabsTrigger value="catalog">Catalog</TabsTrigger><TabsTrigger value="disputes">Disputes</TabsTrigger></TabsList>
      <TabsContent value="catalog"><div className="space-y-6">
      <AdminPageHeader
        title="Marketplace Administration"
        description="Manage the dual marketplace catalog, provider inventory, pricing and product visibility."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(({ label, value, Icon }) => (
          <Card key={label} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
            <CardContent className="p-4">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <p className="mt-3 text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <Store className="mt-1 h-5 w-5" />
              <div>
                <h2 className="font-semibold">Logspanel Provider</h2>
                <p className="text-sm text-muted-foreground">External provider with server-side fulfillment and catalog synchronization.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {provider?.configured ? "API key configured" : "Set LOGSPANEL_API_KEY in Convex"}
                  {" · "}
                  {provider?.syncedProducts ?? 0} products synced
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!provider?.configured || syncing} onClick={sync}>
                <RefreshCw className={syncing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                {syncing ? "Syncing..." : "Sync catalog"}
              </Button>
              <Button onClick={saveProviderSettings}>Save settings</Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Provider enabled</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={enabled ? "true" : "false"}
                onChange={(event) => setEnabled(event.target.value === "true")}
              >
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Markup %</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={markup}
                onChange={(event) => setMarkup(event.target.value)}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {products === undefined ? (
        <AdminSkeleton rows={5} />
      ) : products.length === 0 ? (
        <AdminEmpty message="No marketplace products yet. Sync the provider catalog or approve vendor products." />
      ) : (
        <div className="space-y-2">
          {products.map((product) => {
            const stock = product.providerAvailableQuantity;
            return (
              <Card key={product._id} className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{product.name}</p>
                      <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                      {product.provider && <Badge variant="secondary" className="text-[10px]">{product.provider}</Badge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {formatNgn(product.priceNgn ?? product.pointsPrice * 15)} · {product.totalSold} sold · {stock === undefined ? "stock provider-managed" : `${stock.toLocaleString()} in stock`} · {fmtDate(product.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={product.isApproved ? (product.isActive ? "active" : "paused") : "draft"} />
                  <div className="flex shrink-0 gap-1">
                    {!product.isApproved ? (
                      <>
                        <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => act(product._id, true)}>
                          <Check className="mr-1 h-3 w-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => act(product._id, false)}>
                          <X className="mr-1 h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => toggle(product._id, product.isActive)}>
                        {product.isActive ? <><Ban className="mr-1 h-3 w-3" /> Disable</> : <><RotateCcw className="mr-1 h-3 w-3" /> Re-enable</>}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {providerProducts !== undefined && providerProducts.length > 0 && (
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-700">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Provider inventory snapshot</h2>
                <p className="text-xs text-muted-foreground">Read-only view of the products currently mapped to the provider.</p>
              </div>
              <Badge variant="outline">{providerProducts.length} mapped</Badge>
            </div>
          </CardContent>
        </Card>
      </div></TabsContent>
      <TabsContent value="disputes" className="space-y-3">
        <AdminPageHeader title="Marketplace disputes" description="Split-pane case review with audited escrow release and refund decisions." />
        {disputes === undefined || orders === undefined ? <AdminSkeleton rows={5} /> : openDisputes.length === 0 ? <Card className="rounded-xl shadow-none"><CardContent className="p-10 text-center text-sm text-muted-foreground">No open marketplace disputes.</CardContent></Card> :
          <div className="grid min-h-[560px] gap-3 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.7fr)]">
            <Card className="overflow-hidden rounded-xl shadow-none"><div className="border-b p-3"><p className="text-sm font-semibold">Open cases</p><p className="text-[11px] text-muted-foreground">{openDisputes.length} awaiting resolution</p></div><div className="max-h-[650px] overflow-y-auto">
              {openDisputes.map((d: any) => { const o = orderMap.get(String(d.orderId)); const age = Math.max(0, Math.floor((Date.now()-d.createdAt)/3600000)); return <button key={d._id} onClick={() => { setSelectedDisputeId(String(d._id)); setResolutionReason(""); }} className={"w-full border-b p-3 text-left hover:bg-muted/40 " + (String(selectedDispute?._id)===String(d._id) ? "bg-muted/60" : "")}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold">Order #{String(d.orderId).slice(-8)}</span><StatusBadge status={d.status}/></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.reason}</p><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{age < 24 ? age+"h old" : Math.floor(age/24)+"d old"}</span><span>{o ? formatNgn(o.totalNgn ?? (o.totalPoints ?? 0)*15) : "Order unavailable"}</span></div></button>; })}
            </div></Card>
            <Card className="rounded-xl shadow-none"><CardContent className="space-y-4 p-4">{!selectedDispute ? <p className="text-sm text-muted-foreground">Select a dispute.</p> : <>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dispute / order</p><h2 className="mt-1 text-lg font-semibold">#{String(selectedDispute.orderId).slice(-10)}</h2><p className="mt-1 text-sm text-muted-foreground">{selectedDispute.reason}</p></div><StatusBadge status={selectedDispute.status}/></div>
              <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-md border p-3"><p className="text-[10px] text-muted-foreground">Order total</p><p className="mt-1 font-mono font-semibold">{selectedOrder ? formatNgn(selectedOrder.totalNgn ?? (selectedOrder.totalPoints ?? 0)*15) : "Unavailable"}</p></div><div className="rounded-md border p-3"><p className="text-[10px] text-muted-foreground">Order status</p><p className="mt-1 text-sm font-semibold">{selectedOrder?.status ?? "Not found"}</p></div><div className="rounded-md border p-3"><p className="text-[10px] text-muted-foreground">Opened</p><p className="mt-1 text-sm font-semibold">{fmtDate(selectedDispute.createdAt)}</p></div></div>
              <div className="grid gap-3 md:grid-cols-2"><section><h3 className="mb-2 text-xs font-semibold">Evidence files</h3><div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"><FileText className="mx-auto mb-2 size-4"/>No evidence files attached to this dispute record.</div></section><section><h3 className="mb-2 text-xs font-semibold">Buyer / vendor history</h3><div className="space-y-2 rounded-md border p-3"><p className="text-xs font-semibold">Buyer</p><p className="break-all font-mono text-[10px] text-muted-foreground">{selectedOrder?.buyerId ?? selectedDispute.raisedBy}</p><p className="mt-2 text-xs font-semibold">Vendor</p><p className="break-all font-mono text-[10px] text-muted-foreground">{selectedOrder?.vendorId ?? "Unavailable"}</p><p className="text-[10px] text-muted-foreground">Historical activity summaries are not exposed by the current dispute query.</p></div></section></div>
              <section><h3 className="mb-2 text-xs font-semibold">Case notes</h3><div className="max-h-32 space-y-2 overflow-y-auto">{(selectedDispute.notes ?? []).length ? selectedDispute.notes.map((n:any,i:number)=><div key={i} className="rounded-md border p-2"><p className="text-[10px] text-muted-foreground">{n.authorEmail ?? "Admin"} · {fmtDate(n.createdAt)}</p><p className="mt-1 text-xs">{n.text}</p></div>) : <p className="text-xs text-muted-foreground">No notes recorded.</p>}</div></section>
              {selectedOrder && <div className="space-y-2 border-t pt-3"><label className="text-xs font-medium">Resolution reason (10+ characters, audited)</label><Textarea value={resolutionReason} onChange={e=>setResolutionReason(e.target.value)} rows={2} placeholder="Document the decision rationale."/><div className="flex flex-wrap justify-end gap-2"><Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={resolving || resolutionReason.trim().length<10} onClick={()=>void resolveCase("release")}><Check className="mr-1 size-3.5"/>Release to vendor</Button><Button variant="destructive" disabled={resolving || resolutionReason.trim().length<10} onClick={()=>void resolveCase("refund")}><RotateCcw className="mr-1 size-3.5"/>Refund buyer</Button><Button variant="outline" disabled={resolving} onClick={()=>{setPartialTarget(selectedDispute);setPartialAmount("");setPartialReason("");}}><RefreshCw className="mr-1 size-3.5"/>Partial refund</Button></div></div>}
            </>}</CardContent></Card>
          </div>
        }
      </TabsContent></Tabs>
      <Dialog open={Boolean(partialTarget)} onOpenChange={open=>!open&&!resolving&&setPartialTarget(null)}><DialogContent><DialogHeader><DialogTitle>Partial refund</DialogTitle><DialogDescription>Refund part of the order and release remaining escrow. This is audit logged.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1"><label className="text-xs font-medium">Refund amount (NGN)</label><input type="number" min="0.01" step="0.01" value={partialAmount} onChange={e=>setPartialAmount(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="2500"/></div><div className="space-y-1"><label className="text-xs font-medium">Reason (10+ characters)</label><Textarea rows={3} value={partialReason} onChange={e=>setPartialReason(e.target.value)} placeholder="Explain the partial refund decision"/></div></div><DialogFooter><Button variant="outline" disabled={resolving} onClick={()=>setPartialTarget(null)}>Cancel</Button><Button disabled={resolving || Number(partialAmount)<=0 || partialReason.trim().length<10} onClick={()=>void submitPartialRefund()}>{resolving?"Processing…":"Confirm partial refund"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
