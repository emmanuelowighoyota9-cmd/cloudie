export type Currency = "USD" | "GBP" | "EUR" | "NGN" | string;

export function toMinor(major: number, currency: Currency = "USD"): number {
  const places = currency === "JPY" ? 0 : 2;
  return Math.round(major * Math.pow(10, places));
}

export function toMajor(minor: number, currency: Currency = "USD"): number {
  const places = currency === "JPY" ? 0 : 2;
  return minor / Math.pow(10, places);
}

export function fmtMoney(
  minor: number | { balance?: unknown; walletBalanceNgn?: unknown; amount?: unknown } | null | undefined,
  currency: Currency = "USD",
): string {
  let raw = 0;
  if (typeof minor === "number") {
    raw = Number.isFinite(minor) ? minor : 0;
  } else if (minor && typeof minor === "object") {
    const extracted = Number(minor.balance ?? minor.walletBalanceNgn ?? minor.amount ?? 0);
    raw = Number.isFinite(extracted) ? extracted : 0;
  }
  const major = raw / (currency === "JPY" ? 1 : 100);
  if (currency === "NGN") {
    const sign = major < 0 ? "-" : "";
    return `${sign}₦${Math.abs(major).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USD" || currency === "GBP" || currency === "EUR" || currency === "JPY" ? currency : "USD",
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(major);
}

export function addMinor(a: number, b: number): number { return a + b; }
export function subMinor(a: number, b: number): number { return a - b; }

export function validateAmountMinor(minor: number, limits?: { min?: number; max?: number }): string | null {
  if (!Number.isFinite(minor) || !Number.isInteger(minor) || minor <= 0) return "INVALID_AMOUNT";
  if (limits?.min !== undefined && minor < limits.min) return `MINIMUM_AMOUNT_${limits.min}`;
  if (limits?.max !== undefined && minor > limits.max) return `MAXIMUM_AMOUNT_${limits.max}`;
  return null;
}
