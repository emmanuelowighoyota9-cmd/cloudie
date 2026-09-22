import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type PointPackage = {
  id: string;
  name: string;
  points: number;
  priceNgn: number;
  priceUsd: number;
  popular: boolean;
};

/** Naira, no decimals — the customer-facing price unit. */
export function formatNgn(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}₦${Math.abs(rounded).toLocaleString("en-NG")}`;
}

/** Dollars with cents, used as the secondary price. */
export function formatUsd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ServicePrice = {
  service: string;
  pointsCost: number;
  priceNgn: number;
  priceUsd: number;
};

const FALLBACK_RATE = { ngnPerPoint: 15, usdPerPoint: 0.01 };

/**
 * Central pricing hook: every surface that renders a point cost or a package
 * price reads the admin-configured conversion rate from here so NGN shows up
 * consistently across the customer and admin apps.
 */
export function usePricing() {
  const config = useQuery(api.pricing.getBillingConfig);
  const services = useQuery(api.pricing.getServicePrices);
  const ngnPerPoint = config?.ngnPerPoint ?? FALLBACK_RATE.ngnPerPoint;
  const usdPerPoint = config?.usdPerPoint ?? FALLBACK_RATE.usdPerPoint;

  const servicesByKey = useMemo(() => {
    const map = new Map<string, ServicePrice>();
    for (const s of (services ?? []) as ServicePrice[]) map.set(s.service, s);
    return map;
  }, [services]);

  /**
   * Resolve what a service costs. An admin-set per-service price is used when
   * the service is active; otherwise the caller's platform default applies.
   */
  const price = (service: string, fallbackPoints: number) => {
    const row = servicesByKey.get(service);
    const points = row?.pointsCost ?? fallbackPoints;
    const ngn = row?.priceNgn ?? points * ngnPerPoint;
    const usd = row?.priceUsd ?? points * usdPerPoint;
    return {
      configured: row !== undefined,
      service,
      points,
      ngn,
      usd,
      pointsLabel: `${points.toLocaleString()} pts`,
      ngnLabel: formatNgn(ngn),
      usdLabel: formatUsd(usd),
      /** "150 pts · ₦2,250" — the standard pricing suffix used across the app. */
      label: `${points.toLocaleString()} pts · ${formatNgn(ngn)}`,
    };
  };

  return {
    loading: config === undefined,
    ngnPerPoint,
    usdPerPoint,
    packages: (config?.packages ?? []) as PointPackage[],
    price,
    ngnFor: (points: number) => points * ngnPerPoint,
    usdFor: (points: number) => points * usdPerPoint,
    ngnLabel: (points: number) => formatNgn(points * ngnPerPoint),
    usdLabel: (points: number) => formatUsd(points * usdPerPoint),
    pointsWithNgn: (points: number) =>
      `${points.toLocaleString()} pts · ${formatNgn(points * ngnPerPoint)}`,
  };
}
