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

const FALLBACK_RATE = { ngnPerPoint: 15, usdPerPoint: 0.01 };

/**
 * Central pricing hook: every surface that renders a point cost or a package
 * price reads the admin-configured conversion rate from here so NGN shows up
 * consistently across the customer and admin apps.
 */
export function usePricing() {
  const config = useQuery(api.pricing.getBillingConfig);
  const ngnPerPoint = config?.ngnPerPoint ?? FALLBACK_RATE.ngnPerPoint;
  const usdPerPoint = config?.usdPerPoint ?? FALLBACK_RATE.usdPerPoint;

  return {
    loading: config === undefined,
    ngnPerPoint,
    usdPerPoint,
    packages: (config?.packages ?? []) as PointPackage[],
    ngnFor: (points: number) => points * ngnPerPoint,
    usdFor: (points: number) => points * usdPerPoint,
    ngnLabel: (points: number) => formatNgn(points * ngnPerPoint),
    usdLabel: (points: number) => formatUsd(points * usdPerPoint),
    /** "150 pts · ₦2,250" — the standard pricing suffix used across the app. */
    pointsWithNgn: (points: number) =>
      `${points.toLocaleString()} pts · ${formatNgn(points * ngnPerPoint)}`,
  };
}
