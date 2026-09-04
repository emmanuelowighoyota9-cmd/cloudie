import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function AdminSettings() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--nb-ink)]">Admin Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform-wide configuration.</p>
        </div>
      </div>

      <Card className="notebook-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Point Pricing</CardTitle>
          <CardDescription>Configurable costs for platform operations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Shipment Creation</span><span className="font-semibold">100 pts</span></div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Flight Itinerary</span><span className="font-semibold">150 pts</span></div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Hotel Reservation</span><span className="font-semibold">120 pts</span></div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Commercial Invoice</span><span className="font-semibold">80 pts</span></div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Customs Document</span><span className="font-semibold">100 pts</span></div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Email per recipient</span><span className="font-semibold">10 pts</span></div>
          <div className="flex justify-between text-sm py-2 border-b border-[var(--nb-rule)]"><span className="text-muted-foreground">Image Rendering</span><span className="font-semibold">50 pts</span></div>
          <div className="flex justify-between text-sm py-2"><span className="text-muted-foreground">Referral Reward (referrer)</span><span className="font-semibold">50 pts</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
