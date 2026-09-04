import { Card, CardContent } from "@/components/ui/card";
import { FileText, Plane, Building, FileSpreadsheet, ScrollText, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

const docTypes = [
  { label: "Flight Itinerary", description: "Generate professional flight itinerary documents", icon: Plane, to: "/ticketing/flight", color: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400", cost: 150 },
  { label: "Hotel Reservation", description: "Generate hotel reservation confirmations", icon: Building, to: "/ticketing/hotel", color: "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400", cost: 120 },
  { label: "Commercial Invoice", description: "Generate professional commercial invoices", icon: FileSpreadsheet, to: "/ticketing/invoice", color: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400", cost: 80 },
  { label: "Customs Document", description: "Generate customs declaration documents", icon: ScrollText, to: "/ticketing/customs", color: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400", cost: 100 },
];

export default function Ticketing() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Ticketing & Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">Generate professional document templates for travel and business.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {docTypes.map((dt) => (
          <Link key={dt.to} to={dt.to}>
            <Card className="notebook-card cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm h-full">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${dt.color}`}>
                    <dt.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[var(--nb-ink)]">{dt.label}</h3>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{dt.description}</p>
                    <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">{dt.cost} points per document</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
