/**
 * Regression suite for the Transaction Mail Studio.
 *
 * Each case pins one promise of the product contract:
 *
 *   1. The recipient is never part of the payload — the route supplies it from
 *      the session, so a send cannot be aimed at a third party.
 *   2. The unit price is deducted exactly once, atomically with its ledger row,
 *      and a PENDING log row is written before dispatch starts.
 *   3. A short balance is a 402 with the missing amount — no ledger write, no
 *      dispatch, no log row.
 *   4. A failed dispatch refunds the full amount, marks the log FAILED and says
 *      so.
 *   5. A thrown mailer still refunds.
 *   6. Rendered markup escapes user input and always states that it is a test.
 *
 * The workflow runs against a fake client, so every path is exercised without a
 * live Postgres or mail provider.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  TRANSACTION_MAILER_PRICE_NGN,
  TRANSACTION_MAIL_TEMPLATES,
  renderTransactionMail,
  validateTransactionMailPayload,
  type TransactionMailPayload,
} from "./transactionMailer.js";
import {
  executeTransactionMailSend,
  type ClientLike,
  type QueryResultLike,
} from "./transactionMailerSend.js";
import type { OutboundEmail } from "./mailTransport.js";

/* ── Fixtures ────────────────────────────────────────────────────────────── */

function buildPayload(overrides: Record<string, unknown> = {}): TransactionMailPayload {
  const result = validateTransactionMailPayload({
    templateKey: "crypto_deposit",
    noticeType: "deposit",
    amount: "0.05",
    currency: "btc",
    walletAddress: "bc1qexampleaddress0000000000000000000000",
    txHash: "",
    occurredAt: Date.now(),
    note: "Invoice settlement",
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return result.value;
}

const BRAND = { name: "Northwind Studio", accent: "#10b981" };

function ok(rows: Array<Record<string, unknown>> = [], rowCount = rows.length): QueryResultLike {
  return { rows, rowCount };
}

/* ── Fake database ───────────────────────────────────────────────────────── */

class FakeDb {
  balance: number;
  ledger: Array<Record<string, unknown>> = [];
  logs = new Map<string, { status: string; error: string | null }>();
  constructor(balance: number) {
    this.balance = balance;
  }

  client(): ClientLike {
    return { query: (text, values) => this.query(text, values) };
  }

  private async query(text: string, values: unknown[] = []): Promise<QueryResultLike> {
    const sql = text.trim();

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return ok();

    if (sql.startsWith("SELECT wallet_balance_ngn")) {
      return ok([{ wallet_balance_ngn: this.balance }]);
    }

    if (sql.startsWith("UPDATE app_users SET wallet_balance_ngn")) {
      const [after, , before] = values;
      // The real statement is guarded by the balance it read; emulate that.
      if (this.balance !== Number(before)) return ok([], 0);
      this.balance = Number(after);
      return ok([], 1);
    }

    if (sql.startsWith("INSERT INTO wallet_ledger")) {
      this.ledger.push({
        amount_ngn: values[1],
        balance_after_ngn: values[2],
        transaction_type: values[4],
        reference: values[5],
        idempotency_key: values[6],
        metadata: values[7],
      });
      return ok([], 1);
    }

    if (sql.startsWith("INSERT INTO mail_logs")) {
      this.logs.set(String(values[0]), { status: "PENDING", error: null });
      return ok([], 1);
    }

    if (sql.startsWith("UPDATE mail_logs")) {
      const [status, error, id] = values;
      const row = this.logs.get(String(id));
      if (!row) return ok([], 0);
      row.status = String(status);
      row.error = error === null ? null : String(error);
      return ok([], 1);
    }

    throw new Error(`Unexpected SQL: ${sql.slice(0, 60)}`);
  }
}

/* ── Contract ────────────────────────────────────────────────────────────── */

test("the payload contract has no recipient field", () => {
  const value = buildPayload({ recipientEmail: "victim@example.com", to: "victim@example.com" });
  assert.equal("recipientEmail" in value, false);
  assert.equal("to" in value, false);
});

test("validation rejects an unknown template, asset and amount", () => {
  const result = validateTransactionMailPayload({
    templateKey: "binance",
    noticeType: "deposit",
    amount: "-1",
    currency: "XYZ",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.templateKey);
  assert.ok(result.errors.amount);
  assert.ok(result.errors.currency);
});

test("validation generates a transaction hash when the field is blank", () => {
  const value = buildPayload({ txHash: "" });
  assert.match(value.txHash, /^[0-9a-f]{64}$/);
});

test("the catalog carries tiers but no third-party brand names", () => {
  assert.ok(TRANSACTION_MAIL_TEMPLATES.length >= 4);
  for (const template of TRANSACTION_MAIL_TEMPLATES) {
    assert.ok(["GLOBAL", "GOLD", "PRO", "PREMIUM"].includes(template.tier));
    assert.doesNotMatch(
      `${template.name} ${template.tagline}`,
      /binance|coinbase|kraken|metamask|bybit|okx|luno|yellow ?card|zelle|cash app|blockchain\.com/i,
    );
  }
});

/* ── Rendering ───────────────────────────────────────────────────────────── */

test("rendering escapes user input and labels itself a test", () => {
  const mail = renderTransactionMail({
    payload: buildPayload({ note: '<script>alert("x")</script>' }),
    brand: BRAND,
    platformName: "Cloudie",
  });

  assert.equal(mail.html.includes("<script>"), false);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.subject, /\(test\)/);
  assert.match(mail.html, /Test delivery/);
  assert.match(mail.html, /Simulation generated with Cloudie/);
  assert.match(mail.html, /Northwind Studio/);
  assert.match(mail.text, /0\.05 BTC/);
});

test("an invalid accent never reaches inline styles unescaped", () => {
  const mail = renderTransactionMail({
    payload: buildPayload(),
    brand: { name: "Brand", accent: "red;background:url(javascript:alert(1))" },
    platformName: "Cloudie",
  });
  assert.equal(mail.html.includes("javascript:alert"), false);
  assert.match(mail.html, /#10b981/);
});

/* ── Workflow ────────────────────────────────────────────────────────────── */

test("a successful send charges once, logs SENT and delivers to the session address", async () => {
  const db = new FakeDb(1_000);
  const sent: OutboundEmail[] = [];
  const payload = buildPayload();

  const outcome = await executeTransactionMailSend(
    db.client(),
    {
      userId: "user-1",
      recipientEmail: "owner@example.com",
      payload,
      brand: BRAND,
      platformName: "Cloudie",
    },
    async (email) => {
      sent.push(email);
      return { ok: true, messageId: "msg-1" };
    },
  );

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.chargedNgn, TRANSACTION_MAILER_PRICE_NGN);
  assert.equal(outcome.balanceAfterNgn, 1_000 - TRANSACTION_MAILER_PRICE_NGN);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.com");
  // The delivered body is the preview body, byte for byte.
  assert.equal(
    sent[0].html,
    renderTransactionMail({ payload, brand: BRAND, platformName: "Cloudie" }).html,
  );

  assert.equal(db.ledger.length, 1);
  assert.equal(db.ledger[0].amount_ngn, -TRANSACTION_MAILER_PRICE_NGN);
  assert.equal(db.logs.size, 1);
  assert.equal([...db.logs.values()][0].status, "SENT");
});

test("a short balance is a 402 with nothing charged, sent or logged", async () => {
  const db = new FakeDb(10);
  let sends = 0;

  const outcome = await executeTransactionMailSend(
    db.client(),
    {
      userId: "user-1",
      recipientEmail: "owner@example.com",
      payload: buildPayload(),
      brand: BRAND,
      platformName: "Cloudie",
    },
    async () => {
      sends += 1;
      return { ok: true, messageId: null };
    },
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 402);
  assert.equal(outcome.requiredNgn, TRANSACTION_MAILER_PRICE_NGN);
  assert.equal(outcome.balanceNgn, 10);
  assert.equal(sends, 0);
  assert.equal(db.ledger.length, 0);
  assert.equal(db.logs.size, 0);
  assert.equal(db.balance, 10);
});

test("a failed delivery refunds the charge and marks the log FAILED", async () => {
  const db = new FakeDb(1_000);

  const outcome = await executeTransactionMailSend(
    db.client(),
    {
      userId: "user-1",
      recipientEmail: "owner@example.com",
      payload: buildPayload(),
      brand: BRAND,
      platformName: "Cloudie",
    },
    async () => ({ ok: false, code: "PROVIDER_500", message: "provider exploded" }),
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 502);
  assert.match(outcome.message, /refunded/);

  assert.equal(db.balance, 1_000);
  assert.equal(db.ledger.length, 2);
  assert.equal(db.ledger[1].transaction_type, "refund");
  assert.equal(db.ledger[1].amount_ngn, TRANSACTION_MAILER_PRICE_NGN);
  assert.equal([...db.logs.values()][0].status, "FAILED");
  assert.match(String([...db.logs.values()][0].error), /provider exploded/);
});

test("a thrown mailer still refunds instead of leaving the charge stranded", async () => {
  const db = new FakeDb(1_000);

  const outcome = await executeTransactionMailSend(
    db.client(),
    {
      userId: "user-1",
      recipientEmail: "owner@example.com",
      payload: buildPayload(),
      brand: BRAND,
      platformName: "Cloudie",
    },
    async () => {
      throw new Error("socket hang up");
    },
  );

  assert.equal(outcome.ok, false);
  assert.equal(db.balance, 1_000);
  assert.equal(db.ledger.length, 2);
});
