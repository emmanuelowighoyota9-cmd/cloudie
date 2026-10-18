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

function toFiniteNumber(
  value:
    | number
    | string
    | { balance?: unknown; walletBalanceNgn?: unknown; ngnEquivalent?: unknown; amount?: unknown; amountNgn?: unknown }
    | null
    | undefined,
): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const raw =
      (value as Record<string, unknown>).walletBalanceNgn ??
      (value as Record<string, unknown>).balance ??
      (value as Record<string, unknown>).ngnEquivalent ??
      (value as Record<string, unknown>).amountNgn ??
      (value as Record<string, unknown>).amount ??
      0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Naira, no decimals — the customer-facing price unit. */
export function formatNgn(amount: number | unknown): string {
  const safe = toFiniteNumber(amount as number);
  const rounded = Math.round(safe);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}₦${Math.abs(rounded).toLocaleString("en-NG")}`;
}

/** Dollars with cents, used as the secondary price. */
export function formatUsd(amount: number | unknown): string {
  const safe = toFiniteNumber(amount as number);
  const sign = safe < 0 ? "-" : "";
  return `${sign}$${Math.abs(safe).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ServicePrice = {
  service: string;
  pointsCost: number;
  priceNgn: number;
  priceUsd: number;
};

const FALLBACK_RATE = { ngnPerPoint: 15, usdPerPoint: 0.01 };

export const DEFAULT_POINT_PACKAGES: PointPackage[] = [
  { id: "starter", name: "Starter Pack", points: 100, priceNgn: 1500, priceUsd: 1.0, popular: false },
  { id: "growth", name: "Growth Pack", points: 500, priceNgn: 7500, priceUsd: 5.0, popular: true },
  { id: "business", name: "Business Pack", points: 2000, priceNgn: 30000, priceUsd: 20.0, popular: false },
];

/**
 * Central pricing hook: every surface that renders a point cost or a package
 * price reads the admin-configured conversion rate from here so NGN shows up
 * consistently across the customer and admin apps.
 */
export function usePricing() {
  const config = useQuery(api.pricing.getBillingConfig);
  const services = useQuery(api.pricing.getServicePrices);
  const ngnPerPoint = Number(config?.ngnPerPoint) > 0 ? Number(config?.ngnPerPoint) : FALLBACK_RATE.ngnPerPoint;
  const usdPerPoint = Number(config?.usdPerPoint) > 0 ? Number(config?.usdPerPoint) : FALLBACK_RATE.usdPerPoint;

  const servicesByKey = useMemo(() => {
    const map = new Map<string, ServicePrice>();
    const list = Array.isArray(services) ? (services as ServicePrice[]) : [];
    for (const s of list) {
      if (s && typeof s.service === "string") map.set(s.service, s);
    }
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
      pointsLabel: formatNgn(ngn),
      ngnLabel: formatNgn(ngn),
      usdLabel: formatUsd(usd),
      /** "150 pts · ₦2,250" — the standard pricing suffix used across the app. */
      label: formatNgn(ngn),
    };
  };

  const rawPackages = Array.isArray(config?.packages) && config.packages.length > 0
    ? (config.packages as PointPackage[])
    : DEFAULT_POINT_PACKAGES;

  return {
    loading: config === undefined,
    ngnPerPoint,
    usdPerPoint,
    packages: rawPackages,
    price,
    ngnFor: (points: number) => points * ngnPerPoint,
    usdFor: (points: number) => points * usdPerPoint,
    ngnLabel: (points: number) => formatNgn(points * ngnPerPoint),
    usdLabel: (points: number) => formatUsd(points * usdPerPoint),
    pointsWithNgn: (points: number) => formatNgn(points * ngnPerPoint),
  };
}
