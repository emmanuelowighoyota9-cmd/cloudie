/**
 * Regression suite for the Bank Mailer send workflow — the pay-per-purchase
 * charge → dispatch → refund pipeline.
 *
 * Each case pins one promise of the product contract:
 *
 *   1. The unit price is deducted exactly once, atomically with its ledger
 *      row, before dispatch starts.
 *   2. A short balance is a 402 with the missing amount — no ledger write,
 *      no dispatch, no partial state.
 *   3. A failed dispatch refunds the full amount and says so.
 *   4. A thrown dispatcher still refunds (the failure path cannot bypass
 *      recovery by crashing).
 *   5. A charge failure rolls back completely and never dispatches.
 *   6. When the refund itself cannot be recorded, the caller is told — the
 *      workflow never reports a clean failure it did not actually resolve.
 *
 * The workflow runs against a fake client, so every path is exercised without
 * a live Postgres.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BANK_MAILER_PRICE_NGN,
  validateBankMailerPayload,
  type BankMailerPayload,
} from "./bankMailer.js";
import {
  executeBankMailerSend,
  type ClientLike,
  type DispatchReport,
  type NoticePair,
  type QueryResultLike,
} from "./bankMailerSend.js";

/* ── Payload builder ─────────────────────────────────────────────────────── */

function buildPayload(overrides: Record<string, unknown> = {}): BankMailerPayload {
  const raw = {
    transaction: { amount: 2500.5, currency: "USD", status: "success", language: "en" },
    sender: {
      fullName: "Ada Obi",
      email: "ada@example.com",
      accountNumber: "0123456789",
      bankName: "First Meridian Bank",
      bankCountry: "Nigeria",
      bankAddress: "12 Marina Road, Lagos",
    },
    receiver: {
      fullName: "Bayo Cole",
      email: "bayo@example.com",
      accountNumber: "9988776655",
      bankName: "Northgate Trust",
      bankCountry: "United States",
      bankAddress: "5 Wall Street, New York",
    },
    referenceCode: "REF-2026-001",
    transactionId: "",
    ...overrides,
  };
  const result = validateBankMailerPayload(raw);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return result.value;
}

/* ── Fake client: transactions, rollback, injectable failures ────────────── */

type FakeUser = { id: string; wallet_balance_ngn: number };

function ok(rows: Array<Record<string, unknown>> = [], rowCount = rows.length): QueryResultLike {
  return { rows, rowCount };
}

class FakeDb {
  users = new Map<string, FakeUser>();
  ledger: Array<Record<string, unknown>> = [];
  /** Which statement throws: "select" | "update" | "insert" | "update#2". */
  failOn: string | null = null;
  updateCalls = 0;

  private snapshot: { users: Map<string, FakeUser>; ledger: Array<Record<string, unknown>> } | null = null;

  seed(user: FakeUser) {
    this.users.set(user.id, { ...user });
  }

  client(): ClientLike {
    return { query: (text, values) => this.query(text, values) };
  }

  private async query(text: string, values: unknown[] = []): Promise<QueryResultLike> {
    const sql = text.trim().toUpperCase();

    if (sql === "BEGIN") {
      this.snapshot = {
        users: new Map([...this.users].map(([k, v]) => [k, { ...v }])),
        ledger: this.ledger.map((row) => ({ ...row })),
      };
      return ok();
    }
    if (sql === "COMMIT") {
      this.snapshot = null;
      return ok();
    }
    if (sql.startsWith("ROLLBACK")) {
      if (this.snapshot) {
        this.users = this.snapshot.users;
        this.ledger = this.snapshot.ledger;
      }
      this.snapshot = null;
      return ok();
    }

    if (sql.startsWith("SELECT WALLET_BALANCE_NGN")) {
      if (this.failOn === "select") throw new Error("connection lost");
      const user = this.users.get(String(values[0]));
      return user ? ok([{ wallet_balance_ngn: user.wallet_balance_ngn }], 1) : ok();
    }

    if (sql.startsWith("UPDATE APP_USERS")) {
      this.updateCalls += 1;
      if (this.failOn === "update" || (this.failOn === "update#2" && this.updateCalls === 2)) {
        throw new Error("update failed");
      }
      const [nextBalance, id, expectedBefore] = values as [number, string, number];
      const user = this.users.get(String(id));
      if (!user || Number(user.wallet_balance_ngn) !== Number(expectedBefore)) return ok();
      user.wallet_balance_ngn = Number(nextBalance);
      return ok([], 1);
    }

    if (sql.startsWith("INSERT INTO WALLET_LEDGER")) {
      if (this.failOn === "insert") throw new Error("ledger insert failed");
      this.ledger.push({
        user_id: values[0],
        amount_ngn: Number(values[1]),
        balance_after_ngn: Number(values[2]),
        description: values[3],
        transaction_type: values[4],
        reference: values[5],
        idempotency_key: values[6],
        metadata: values[7],
      });
      return ok([], 1);
    }

    throw new Error(`FakeDb: unexpected SQL: ${text}`);
  }
}

/* ── Dispatchers ─────────────────────────────────────────────────────────── */

type Recorded = { pairs: NoticePair[]; report: DispatchReport | null; throwWith?: string };

function recordingDispatch(report: DispatchReport): {
  dispatch: (pair: NoticePair) => Promise<DispatchReport>;
  state: Recorded;
} {
  const state: Recorded = { pairs: [], report };
  return {
    state,
    dispatch: async (pair) => {
      state.pairs.push(pair);
      return state.report!;
    },
  };
}

const DELIVERED: DispatchReport = {
  debit: { ok: true, messageId: "msg-debit" },
  credit: { ok: true, messageId: "msg-credit" },
};

const REJECTED: DispatchReport = {
  debit: { ok: true, messageId: "msg-debit" },
  credit: { ok: false, code: "PROVIDER_400", message: "invalid recipient" },
};

/* ── Cases ───────────────────────────────────────────────────────────────── */

test("charges once, atomically, and dispatches both notices in parallel", async () => {
  const db = new FakeDb();
  db.seed({ id: "user_1", wallet_balance_ngn: 1000 });
  const { dispatch, state } = recordingDispatch(DELIVERED);

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "user_1", payload: buildPayload(), platformName: "Cloudie" },
    dispatch,
  );

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  // Wallet: one debit of the unit price, ledger agrees with the balance.
  assert.equal(db.users.get("user_1")!.wallet_balance_ngn, 1000 - BANK_MAILER_PRICE_NGN);
  assert.equal(db.ledger.length, 1);
  assert.equal(db.ledger[0].amount_ngn, -BANK_MAILER_PRICE_NGN);
  assert.equal(db.ledger[0].transaction_type, "email_dispatch");
  assert.equal(db.ledger[0].balance_after_ngn, 1000 - BANK_MAILER_PRICE_NGN);
  assert.equal(outcome.balanceAfterNgn, 1000 - BANK_MAILER_PRICE_NGN);
  assert.equal(outcome.chargedNgn, BANK_MAILER_PRICE_NGN);
  assert.equal(outcome.transactionId.length, 12);

  // Dispatch: exactly one call, carrying both rendered notices to the right
  // addresses — the debit masks the sender account, the credit carries the
  // receiver's full account.
  assert.equal(state.pairs.length, 1);
  const pair = state.pairs[0];
  assert.equal(pair.debit.to, "ada@example.com");
  assert.equal(pair.credit.to, "bayo@example.com");
  assert.match(pair.debit.subject, /Debit alert/);
  assert.match(pair.credit.subject, /Credit alert/);
  assert.ok(pair.debit.html.includes("•••• 6789"));
  assert.ok(!pair.debit.html.includes("0123456789"));
  assert.equal(outcome.delivery.debit, "msg-debit");
  assert.equal(outcome.delivery.credit, "msg-credit");
});

test("rejects an insufficient balance with 402 before anything moves", async () => {
  const db = new FakeDb();
  db.seed({ id: "user_1", wallet_balance_ngn: BANK_MAILER_PRICE_NGN - 1 });
  const { dispatch, state } = recordingDispatch(DELIVERED);

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "user_1", payload: buildPayload(), platformName: "Cloudie" },
    dispatch,
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 402);
  assert.equal(outcome.code, "INSUFFICIENT_FUNDS");
  assert.equal(outcome.requiredNgn, BANK_MAILER_PRICE_NGN);
  assert.equal(outcome.balanceNgn, BANK_MAILER_PRICE_NGN - 1);

  assert.equal(state.pairs.length, 0, "no dispatch on a short balance");
  assert.equal(db.ledger.length, 0, "no ledger row on a short balance");
  assert.equal(db.users.get("user_1")!.wallet_balance_ngn, BANK_MAILER_PRICE_NGN - 1);
});

test("refunds the full charge when a notice fails to dispatch", async () => {
  const db = new FakeDb();
  db.seed({ id: "user_1", wallet_balance_ngn: 1000 });
  const { dispatch, state } = recordingDispatch(REJECTED);

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "user_1", payload: buildPayload(), platformName: "Cloudie" },
    dispatch,
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 502);
  assert.equal(outcome.code, "DISPATCH_FAILED");
  assert.match(outcome.message, /refunded/);
  assert.match(outcome.message, /credit notice/);

  // The wallet is back where it started: debit + matching refund row.
  assert.equal(db.users.get("user_1")!.wallet_balance_ngn, 1000);
  assert.equal(db.ledger.length, 2);
  assert.equal(db.ledger[0].amount_ngn, -BANK_MAILER_PRICE_NGN);
  assert.equal(db.ledger[1].amount_ngn, BANK_MAILER_PRICE_NGN);
  assert.equal(db.ledger[1].transaction_type, "refund");
  assert.equal(state.pairs.length, 1, "dispatch was attempted exactly once");
});

test("still refunds when the dispatcher throws", async () => {
  const db = new FakeDb();
  db.seed({ id: "user_1", wallet_balance_ngn: 500 });
  const throwingDispatch = async (): Promise<DispatchReport> => {
    throw new Error("fetch exploded");
  };

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "user_1", payload: buildPayload(), platformName: "Cloudie" },
    throwingDispatch,
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 502);
  assert.match(outcome.message, /fetch exploded/);
  assert.equal(db.users.get("user_1")!.wallet_balance_ngn, 500);
  assert.equal(db.ledger.filter((row) => Number(row.amount_ngn) > 0).length, 1, "refund recorded");
});

test("rolls back completely and never dispatches when the charge fails", async () => {
  const db = new FakeDb();
  db.seed({ id: "user_1", wallet_balance_ngn: 1000 });
  db.failOn = "insert";
  const { dispatch, state } = recordingDispatch(DELIVERED);

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "user_1", payload: buildPayload(), platformName: "Cloudie" },
    dispatch,
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 500);
  assert.equal(outcome.code, "CHARGE_FAILED");
  assert.equal(state.pairs.length, 0, "no dispatch without a completed charge");
  assert.equal(db.ledger.length, 0, "rolled back ledger");
  assert.equal(db.users.get("user_1")!.wallet_balance_ngn, 1000, "rolled back balance");
});

test("surfaces a failed refund instead of reporting a clean failure", async () => {
  const db = new FakeDb();
  db.seed({ id: "user_1", wallet_balance_ngn: 1000 });
  db.failOn = "update#2"; // first update = charge, second = refund
  const { dispatch } = recordingDispatch(REJECTED);

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "user_1", payload: buildPayload(), platformName: "Cloudie" },
    dispatch,
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 500);
  assert.equal(outcome.code, "DISPATCH_AND_REFUND_FAILED");
  assert.equal(outcome.refundFailed, true);
  assert.match(outcome.message, /contact support/i);
  // The charge stands and the ledger shows only the debit — exactly the state
  // the response admits to.
  assert.equal(db.ledger.length, 1);
  assert.equal(db.ledger[0].amount_ngn, -BANK_MAILER_PRICE_NGN);
});

test("rejects an unknown user before charging", async () => {
  const db = new FakeDb();
  const { dispatch, state } = recordingDispatch(DELIVERED);

  const outcome = await executeBankMailerSend(
    db.client(),
    { userId: "ghost", payload: buildPayload(), platformName: "Cloudie" },
    dispatch,
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 404);
  assert.equal(state.pairs.length, 0);
  assert.equal(db.ledger.length, 0);
});
