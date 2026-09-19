export type Currency = "USD" | "GBP" | "EUR" | "NGN" | string;

export function toMinor(major: number, currency: Currency = "USD"): number {
  const places = currency === "JPY" ? 0 : 2;
  return Math.round(major * Math.pow(10, places));
}

export function toMajor(minor: number, currency: Currency = "USD"): number {
  const places = currency === "JPY" ? 0 : 2;
  return minor / Math.pow(10, places);
}

export function fmtMoney(minor: number, currency: Currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USD" || currency === "GBP" || currency === "EUR" ? currency : "USD",
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(minor / (currency === "JPY" ? 1 : 100));
}

export function addMinor(a: number, b: number): number { return a + b; }
export function subMinor(a: number, b: number): number { return a - b; }

export function validateAmountMinor(minor: number, limits?: { min?: number; max?: number }): string | null {
  if (!Number.isFinite(minor) || !Number.isInteger(minor) || minor <= 0) return "INVALID_AMOUNT";
  if (limits?.min !== undefined && minor < limits.min) return `MINIMUM_AMOUNT_${limits.min}`;
  if (limits?.max !== undefined && minor > limits.max) return `MAXIMUM_AMOUNT_${limits.max}`;
  return null;
}
