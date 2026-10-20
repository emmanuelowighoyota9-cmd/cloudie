import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowRight,
  Coins,
  Info,
  LayoutGrid,
  Lightbulb,
  Plus,
  Radio,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
// Shared with the history rows and the purchase pages, so one service type has
// one glyph everywhere it appears.
import {
  VtuBand,
  VtuNav,
  VtuSection,
  VtuServiceIcon,
  VtuShell,
} from "@/components/vtu/shared";

/**
 * Catalog browse — everything on sale, grouped by service type.
 *
 * READ-ONLY. It prices nothing itself and decides nothing itself: every number
 * on this page is a scalar the server resolved (`fixedPoints`) or derived from
 * the catalog's declared bounds (`indicativeMin/MaxPoints`). Provider identity
 * never reaches this component, so there is nothing here to leak and nothing
 * here to re-derive.
 *
 * A product whose shape the backend cannot yet purchase is still LISTED, and
 * says so plainly. Hiding it would deny a customer the information that the
 * service exists; showing it as buyable would advertise a purchase the server
 * will refuse.
 */

/**
 * The four tiles under the balance.
 *
 * Quick links, not a menu: each one lands on the screen where that purchase
 * actually happens, with the category already chosen. "All bills" is the
 * fourth because a customer who does not recognise their own bill type needs
 * somewhere to look, and sending them back to this page would be a loop.
 */
const QUICK_LINKS = [
  { to: "/vtu/airtime", label: "Airtime", icon: Radio },
  { to: "/vtu/data", label: "Data", icon: Wifi },
  { to: "/vtu/electricity", label: "Electricity", icon: Lightbulb },
  { to: "/vtu/bills", label: "All bills", icon: LayoutGrid },
] as const;

export default function VtuCatalog() {
  const balance = useQuery(api.points.getPointsBalance);

  return (
    <VtuShell>
      <VtuNav />

      <VtuBand>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">
              Airtime, data &amp; bills
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">
              {(balance ?? 0).toLocaleString()}
              <span className="ml-1 text-sm font-medium opacity-70">pts</span>
            </p>
            <p className="mt-1 max-w-md text-xs text-vtu-band-fg/75">
              Pay with your points. Prices are set by us, and a top-up that does
              not go through returns your points automatically.
            </p>
          </div>
          <Button
            asChild
            variant="vtu"
            className="border border-vtu-band-fg/25 bg-vtu-band-fg/10 hover:bg-vtu-band-fg/20"
          >
            <Link to="/buy-points">
              <Plus className="h-4 w-4" />
              Buy points
            </Link>
          </Button>
        </div>
      </VtuBand>

      <Reveal>
        <VtuSection title="Quick links" hint="Straight to the thing you came for.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="vtu-chip flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vtu-chip text-vtu-text">
                  <link.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {link.label}
                </span>
              </Link>
            ))}
          </div>
        </VtuSection>
      </Reveal>

      <Reveal>
        <VtuSection title="Services" hint="Choose what you want to pay for.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { to: "/vtu/airtime", label: "Airtime", icon: Radio },
              { to: "/vtu/data", label: "Data", icon: Wifi },
              { to: "/vtu/electricity", label: "Electricity", icon: Lightbulb },
              { to: "/vtu/bills", label: "More bills", icon: LayoutGrid },
            ].map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="vtu-chip flex min-h-20 items-center gap-3 rounded-2xl px-4 py-3 transition-transform active:scale-[0.98]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-vtu-chip text-vtu-text">
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-vtu-muted" aria-hidden />
              </Link>
            ))}
          </div>
        </VtuSection>
      </Reveal>
      <Reveal>
        <p className="flex items-start gap-2 px-1 text-[11px] text-vtu-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Estimated prices are shown for products whose cost depends on the
          amount you choose. The exact figure appears on the confirmation before
          you pay.
        </p>
      </Reveal>
    </VtuShell>
  );
}
