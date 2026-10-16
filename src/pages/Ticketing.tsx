import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Plane, Building, FileSpreadsheet, ScrollText, ArrowUpRight,
  Search, FileText, Clock3, Plus, ChevronRight, Sparkles, LayoutGrid, ArrowRight, Hotel , Car, CalendarDays,
} from "lucide-react";
import { Link } from "react-router";
import { usePricing } from "@/lib/pricing";

const docTypes = [
  { label: "Flight Itinerary", short: "Flight", description: "Professional itinerary and passenger travel document", icon: Plane, to: "/ticketing/flight", color: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400", service: "flight_pdf", cost: 150 },
  { label: "Hotel Reservation", short: "Hotel", description: "Reservation confirmation with guest and stay details", icon: Building, to: "/ticketing/hotel", color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400", service: "hotel_pdf", cost: 120 },
  { label: "Commercial Invoice", short: "Invoice", description: "Business-ready invoice with line items and totals", icon: FileSpreadsheet, to: "/ticketing/invoice", color: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400", service: "commercial_invoice", cost: 80 },
  { label: "Customs Document", short: "Customs", description: "Shipment and commodity declaration document", icon: ScrollText, to: "/ticketing/customs", color: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400", service: "customs_document", cost: 100 },
] as const;

export default function Ticketing() {
  const { price } = usePricing();
  const documents = useQuery(api.documents.list, { limit: 20 });
  const flightTemplates = useQuery(api.docTemplates.listTemplates, { documentType: "flight_itinerary", limit: 12 });
  const corporateTemplates = useQuery(api.docTemplates.listTemplates, { documentType: "corporate", limit: 12 });
  const generalTemplates = useQuery(api.docTemplates.listTemplates, { documentType: "general", limit: 12 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "flight" | "hotel" | "invoice" | "customs">("all");

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (documents ?? []).filter((doc) => {
      const typeOk = filter === "all" || doc.type === filter;
      const searchOk = !q || doc.title.toLowerCase().includes(q) || doc.type.toLowerCase().includes(q);
      return typeOk && searchOk;
    });
  }, [documents, search, filter]);

  const counts = useMemo(() => {
    const source = documents ?? [];
    return {
      total: source.length,
      flight: source.filter((d) => d.type === "flight").length,
      hotel: source.filter((d) => d.type === "hotel").length,
      business: source.filter((d) => d.type === "invoice" || d.type === "customs").length,
    };
  }, [documents]);

  return (
    <div className="cloudie-ticketing-page space-y-6 sm:space-y-8">
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Documents are generated from the details you provide. Verify flight and hotel bookings with the provider, and verify payments and invoices against your own records.</div>
      <section className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-[#1e6091] via-[#2563eb] to-[#3b82f6] p-5 text-white shadow-[0_28px_60px_-38px_rgba(37,99,235,.55)] sm:rounded-3xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative max-w-3xl">
          <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ticketing workspace
          </Badge>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-4xl">Travel & business documents</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
            Create, preview and manage professional travel and business documents from one workspace.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/ticketing/flight"><Button className="bg-white text-[#1e6091] hover:bg-blue-50"><Plus className="mr-2 h-4 w-4" /> Create itinerary</Button></Link>
            <Link to="/documents"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Document library</Button></Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total documents", value: counts.total, icon: FileText },
          { label: "Flight", value: counts.flight, icon: Plane },
          { label: "Hotel", value: counts.hotel, icon: Building },
          { label: "Business", value: counts.business, icon: FileSpreadsheet },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={String(label)} className="border-border/80 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Ticketing templates</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the dedicated ticketing pack or browse the wider document studio.</p>
          </div>
          <Link to="/documents/templates" className="inline-flex items-center text-sm font-semibold text-primary hover:underline">
            Browse all templates <ArrowRight className="ml-1 size-4" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Flight booking", description: "Passenger, route, fare and confirmation.", icon: Plane, to: "/documents/templates?category=flight_itinerary", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" },
            { label: "Hotel confirmation", description: "Guest, stay, room and reservation details.", icon: Hotel, to: "/documents/templates?category=corporate", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" },
            { label: "Travel voucher", description: "Transfers and itinerary-linked services.", icon: Car, to: "/documents/templates?category=general", tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400" },
            { label: "Trip summary", description: "One-page multi-stop travel overview.", icon: CalendarDays, to: "/documents/templates?category=flight_itinerary", tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400" },
          ].map((item) => { const Icon = item.icon; return (
            <Link key={item.label} to={item.to} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <div className={`flex size-10 items-center justify-center rounded-xl ${item.tone}`}><Icon className="size-5" /></div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{item.label}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary">Use template <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          ); })}
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><LayoutGrid className="size-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Live template catalog</h3></div>
            <span className="text-xs text-muted-foreground">{(flightTemplates?.length ?? 0) + (corporateTemplates?.length ?? 0) + (generalTemplates?.length ?? 0)} templates available</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...(flightTemplates ?? []), ...(corporateTemplates ?? []), ...(generalTemplates ?? [])].slice(0, 9).map((template) => (
              <Link key={template._id} to={`/documents/new/${template._id}`} className="flex items-center gap-3 rounded-xl border border-border/80 p-3 transition-colors hover:bg-muted/60">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{template.name}</span><span className="block truncate text-[10px] text-muted-foreground">{template.requiredCredits} pts · {template.fieldCount} fields</span></span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Expanded document catalog</h2>
            <p className="mt-1 text-sm text-muted-foreground">More mature travel, identity-profile, certificate and business document templates.</p>
          </div>
          <Link to="/documents/templates" className="text-sm font-semibold text-primary hover:underline">Open full catalog <ArrowRight className="ml-1 inline size-4" /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title:"Flight e-ticket summary", description:"Passenger, route, cabin and fare summary.", category:"flight_itinerary", icon:Plane },
            { title:"Multi-city flight itinerary", description:"Organize multiple flight legs into one trip pack.", category:"flight_itinerary", icon:CalendarDays },
            { title:"Driver profile card", description:"Non-government driver profile for training and UI use.", category:"general", icon:FileText },
            { title:"Marriage keepsake certificate", description:"Ceremony keepsake clearly marked as non-government record.", category:"certificates", icon:Sparkles },
            { title:"Employment certificate", description:"Professional HR confirmation and internal record.", category:"certificates", icon:FileSpreadsheet },
            { title:"Event & ceremony certificate", description:"Flexible certificate for participation and events.", category:"certificates", icon:ScrollText },
          ].map((item) => { const Icon = item.icon; return (
            <Link key={item.title} to={`/documents/templates?category=${item.category}&search=${encodeURIComponent(item.title)}`} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-primary">Use template <ArrowRight className="ml-1 size-3.5" /></span>
            </Link>
          ); })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Create a document</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a template and enter the details you need.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {docTypes.map((dt) => {
            const Icon = dt.icon;
            return (
              <Link key={dt.to} to={dt.to} className="group">
                <Card className="h-full border-border/80 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-blue-500/10">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${dt.color}`}><Icon className="size-6" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{dt.label}</h3>
                          <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{dt.description}</p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-primary">{price(dt.service, dt.cost).label} / document</span>
                          <span className="text-xs text-muted-foreground">Create <ChevronRight className="ml-0.5 inline size-3" /></span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Recent documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your latest generated documents and their creation status.</p>
          </div>
          <Link to="/documents" className="text-sm font-semibold text-primary hover:underline">Open document library</Link>
        </div>

        <Card className="border-border/80">
          <CardContent className="p-3 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..." className="pl-9" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {([["all","All"],["flight","Flights"],["hotel","Hotels"],["invoice","Invoices"],["customs","Customs"]] as const).map(([key,label]) => (
                  <Button key={key} type="button" size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)} className="shrink-0">{label}</Button>
                ))}
              </div>
            </div>

            {!documents ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
            ) : filteredDocs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-medium text-foreground">{search || filter !== "all" ? "No matching documents" : "No documents yet"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{search || filter !== "all" ? "Try another search or filter." : "Create your first document above to see it here."}</p>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {filteredDocs.slice(0, 8).map((doc) => {
                  const meta = docTypes.find((item) => item.short.toLowerCase() === doc.type);
                  const Icon = meta?.icon ?? FileText;
                  return (
                    <Link key={doc._id} to={`/documents/${doc._id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/60 sm:p-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{doc.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3" />{new Date(doc.createdAt).toLocaleString()}</span>
                      </span>
                      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{doc.pointsCost} pts</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
