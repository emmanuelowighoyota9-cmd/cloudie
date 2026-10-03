import { Link } from "react-router";
import { useQuery } from "convex/react";
import { ArrowRight, Coins, Info } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { CatalogProductView } from "@/convex/vtuCatalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
// Shared with the history rows and the purchase page, so one service type has
// one glyph everywhere it appears.
import { VtuNav, VtuServiceIcon } from "@/components/vtu/shared";
import { formatNgn } from "@/lib/pricing";
import { VTU_SERVICE_TYPE_COPY, vtuServiceTypeLabel } from "@/lib/vtu";
import { cn } from "@/lib/utils";

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

export default function VtuCatalog() {
  const catalog = useQuery(api.vtuCatalog.listCatalog, {});
  const balance = useQuery(api.points.getBalance);

  return (
    /* `page-gutter` + `py-10 sm:py-14` matches the other three VTU pages. Without
       them the catalogue sat ~40px higher, so the shared nav — which is the
       first child on every VTU page — jumped vertically on every tab click.
       The extra inline padding here is pre-existing and shared with the other
       three pages, so it is left alone rather than fixed piecemeal. */
    <div className="page-gutter mx-auto w-full max-w-5xl space-y-8 py-10 sm:py-14">
      <VtuNav />
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Airtime, data &amp; bills
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Pay with your points. Prices are set by us, and a top-up that does
              not go through returns your points automatically.
            </p>
          </div>
          <Badge variant="secondary" className="gap-1.5 tabular-nums">
            <Coins className="h-3 w-3" />
            {(balance ?? 0).toLocaleString()} pts available
          </Badge>
        </div>
      </Reveal>

      {catalog === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : catalog.groups.length === 0 ? (
        <Reveal>
          <Card>
            <CardContent className="space-y-2 p-8 text-center">
              <p className="text-sm font-medium">Nothing is on sale yet</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                No services are enabled right now. If that is unexpected, an
                administrator can add them under VTU Catalog &amp; Routing — this
                page updates the moment they do.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      ) : (
        catalog.groups.map((group, groupIndex) => {
          const copy = VTU_SERVICE_TYPE_COPY[group.serviceType];
          return (
            <Reveal key={group.serviceType} delay={groupIndex * 0.04}>
              <section className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <VtuServiceIcon
                      serviceType={group.serviceType}
                      className="h-4 w-4"
                    />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold uppercase tracking-wider">
                      {vtuServiceTypeLabel(group.serviceType)}
                    </h2>
                    {copy && (
                      <p className="text-xs text-muted-foreground">{copy.blurb}</p>
                    )}
                  </div>
                </div>

                <StaggerGroup className="grid gap-3 sm:grid-cols-2">
                  {group.products.map((product) => (
                    <StaggerItem key={product.productCode}>
                      <ProductCard product={product} />
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </section>
            </Reveal>
          );
        })
      )}

      <Reveal>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Estimated prices are shown for products whose cost depends on the
          amount you choose. The exact figure appears on the purchase form
          before you confirm.
        </p>
      </Reveal>
    </div>
  );
}

function ProductCard({ product }: { product: CatalogProductView }) {
  const shape = describeShape(product);

  return (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold">{product.displayName}</p>
          <p className="text-xs text-muted-foreground">
            We&rsquo;ll ask for: {product.customerIdentifierLabel}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {shape.map((chip) => (
            <Badge key={chip} variant="outline" className="font-normal">
              {chip}
            </Badge>
          ))}
        </div>

        <div className="mt-auto space-y-2">
          <PriceBlock product={product} />
          {product.purchasable ? (
            <Button asChild className="min-h-11 w-full gap-1.5">
              {/* Airtime keeps its own grid (network + amount chips); every
                  other product is bought on the bills page by product code. */}
              <Link
                to={
                  product.airtimeNetwork
                    ? `/vtu/airtime?network=${product.airtimeNetwork}`
                    : `/vtu/bills?product=${product.productCode}`
                }
              >
                Buy now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <div
              className={cn(
                "rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground",
              )}
            >
              Not available to buy yet — ask support to enable it
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The price line.
 *
 * Three honest cases, in order of certainty:
 *   - a resolved fixed price, which is exact;
 *   - an estimated range for anything whose cost moves with the amount;
 *   - no number at all, rather than a guess the checkout will contradict.
 */
function PriceBlock({ product }: { product: CatalogProductView }) {
  if (product.fixedPoints !== null) {
    return (
      <p className="text-base font-semibold tabular-nums">
        {product.fixedPoints.toLocaleString()} pts
      </p>
    );
  }

  const { indicativeMinPoints: lo, indicativeMaxPoints: hi } = product;
  if (lo !== null && hi !== null) {
    return (
      <div className="space-y-0.5">
        <p className="text-base font-semibold tabular-nums">
          {lo === hi
            ? `${lo.toLocaleString()} pts`
            : `${lo.toLocaleString()}–${hi.toLocaleString()} pts`}
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          estimated for {formatNgn(product.minAmount ?? 0)}–
          {formatNgn(product.maxAmount ?? 0)}
        </p>
      </div>
    );
  }

  return <p className="text-sm font-medium text-muted-foreground">Price shown at checkout</p>;
}

/** What the customer has to choose, in words rather than enum values. */
function describeShape(product: CatalogProductView): string[] {
  const chips: string[] = [];
  if (product.requiresAmount) {
    chips.push("You choose the amount");
    if (product.minAmount !== null && product.maxAmount !== null) {
      chips.push(`${formatNgn(product.minAmount)}–${formatNgn(product.maxAmount)}`);
    }
  }
  if (product.requiresPackageCode) chips.push("Choose a plan");
  if (chips.length === 0) chips.push("Fixed price");
  return chips;
}
