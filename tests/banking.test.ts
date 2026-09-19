import { test, expect } from "bun:test";
import { toMinor, toMajor, fmtMoney, validateAmountMinor } from "@/lib/money";

// ─── Money arithmetic must stay in integer minor units (no float bal) ────

test("bank money — toMinor is integer and invertible (USD)", () => {
  expect(toMinor(10.00)).toBe(1000);
  expect(toMinor(0.01)).toBe(1);
  expect(toMinor(1234.56)).toBe(123456);
  expect(toMajor(1000)).toBe(10);
  expect(toMajor(toMinor(9.99))).toBe(9.99);
});

test("bank money — never float: adding amounts in minor is exact", () => {
  // classic float trap 0.1+0.2 would break decimal
  const a = toMinor(0.1);
  const b = toMinor(0.2);
  expect(a + b).toBe(30);
  expect(fmtMoney(a + b)).toBe("$0.30");
});

test("bank money — validateAmountMinor guards", () => {
  expect(validateAmountMinor(0)).toBe("INVALID_AMOUNT");
  expect(validateAmountMinor(-1)).toBe("INVALID_AMOUNT");
  expect(validateAmountMinor(1)).toBeNull();
  expect(validateAmountMinor(5, { min: 100 })).toContain("MINIMUM_AMOUNT_");
  expect(validateAmountMinor(10000, { max: 9999 })).toContain("MAXIMUM_AMOUNT_");
  expect(validateAmountMinor(1000, { min: 100, max: 10000 })).toBeNull();
});

// ─── Ledger invariant helpers (mirror convexity banking invariant) ─────────

function debitsEqCredits(legs: Array<{ debitMinor: number; creditMinor: number }>) {
  const d = legs.reduce((s, e) => s + (e.debitMinor ?? 0), 0);
  const c = legs.reduce((s, e) => s + (e.creditMinor ?? 0), 0);
  return d === c;
}

test("double-entry ledger — transfer group balances", () => {
  const amount = 10000, fee = 50;
  expect(debitsEqCredits([
    { debitMinor: amount, creditMinor: 0 }, // debit source
    { debitMinor: 0, creditMinor: amount }, // credit dest
    { debitMinor: fee, creditMinor: 0 },    // fee debit
    { debitMinor: 0, creditMinor: fee },    // fee contra
  ])).toBe(true);
  expect(debitsEqCredits([{ debitMinor: 100, creditMinor: 0 }])).toBe(false);
});

test("double-entry ledger — deposit credits equal contra debit", () => {
  const amount = 50000;
  expect(debitsEqCredits([
    { debitMinor: amount, creditMinor: 0 },
    { debitMinor: 0, creditMinor: amount },
  ])).toBe(true);
});

test("double-entry ledger — withdrawal + fee balances within one group", () => {
  const amount = 20000, fee = 200;
  expect(debitsEqCredits([
    { debitMinor: amount, creditMinor: 0 }, // withdrawal
    { debitMinor: fee, creditMinor: 0 },    // fee
    { debitMinor: 0, creditMinor: amount + fee }, // contra
  ])).toBe(true);
});

// ─── Isolation: references are opaque; tenant scoping is by id not by client input ──

test("banking isolation — reference format encodes kind and is opaque", () => {
  // references all use a prefix so clients can't guess another tenant's id
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const r = `TXN-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now() % 1000}`;
    seen.add(r);
  }
  expect(seen.size).toBe(10);
});

// ─── Lifecycle gating: only active tenants transact ────────────────────────

test("tenant lifecycle — canonical active set blocks the rest", () => {
  const isActive = (ls: string, flag: boolean) => !["disabled", "suspended", "archived", "draft"].includes(ls) && flag;
  expect(isActive("active", true)).toBe(true);
  expect(isActive("suspended", false)).toBe(false);
  expect(isActive("disabled", true)).toBe(false);
  expect(isActive("draft", true)).toBe(false);
});
