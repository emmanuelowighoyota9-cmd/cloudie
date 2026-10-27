/**
 * Bank Mailer — the pay-per-purchase send workflow.
 *
 * Execution order, exactly as the product contract requires:
 *
 *   1. The route validates the payload against the shared schema first; only a
 *      validated `BankMailerPayload` reaches this module.
 *   2. Charge: the user's row is locked `FOR UPDATE`, the balance is checked
 *      against the unit price, and the debit + ledger row commit together.
 *      A short balance is a `402` before a single kobo moves.
 *   3. Render: both notices are compiled from the shared templates — the same
 *      function the live preview shows.
 *   4. Dispatch: the debit notice and the credit notice go out in parallel
 *      through an injected dispatcher (see `bankMailerDispatch.ts`).
 *   5. Recovery: any failure after the charge — provider error, thrown fetch,
 *      unrenderable input — refunds the full amount in its own transaction and
 *      reports what happened. The user is never charged for an undelivered
 *      pair, and a refund that itself fails is surfaced, never swallowed.
 *
 * The database access goes through a structural `ClientLike`, so the whole
 * workflow runs against a fake in `bankMailerSend.test.ts` — every failure path
 * is exercised without a live Postgres.
 */
import { randomUUID } from "node:crypto";
import {
  BANK_MAILER_CREDITS,
  BANK_MAILER_PRICE_NGN,
  BANK_MAILER_SERVICE,
  renderBankNotice,
  type BankMailerPayload,
} from "./bankMailer.js";

/* ── Structural types ────────────────────────────────────────────────────── */

export type QueryResultLike = {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
};

export type ClientLike = {
  query(text: string, values?: unknown[]): Promise<QueryResultLike>;
};

export type OutboundNotice = { to: string; subject: string; html: string; text: string };
export type NoticePair = { debit: OutboundNotice; credit: OutboundNotice };

export type Attempt =
  | { ok: true; messageId: string | null }
  | { ok: false; code: string; message: string };

export type DispatchReport = { debit: Attempt; credit: Attempt };

export type NoticeDispatcher = (pair: NoticePair) => Promise<DispatchReport>;

export type SendParams = {
  userId: string;
  payload: BankMailerPayload;
  platformName: string;
};

export type SendSuccess = {
  ok: true;
  transactionId: string;
  chargedNgn: number;
  balanceAfterNgn: number;
  delivery: { debit: string; credit: string };
};

export type SendFailure = {
  ok: false;
  status: 402 | 404 | 409 | 500 | 502;
  code: string;
  message: string;
  /** Present on 402 so the client can say exactly how much is missing. */
  requiredNgn?: number;
  balanceNgn?: number;
  /** Set when dispatch failed AND the automatic refund could not be recorded. */
  refundFailed?: boolean;
};

export type SendOutcome = SendSuccess | SendFailure;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function rollback(client: ClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The connection may already be broken; the pool discards it either way.
  }
}

function failure(
  status: SendFailure["status"],
  code: string,
  message: string,
  extra: Partial<SendFailure> = {},
): SendFailure {
  return { ok: false, status, code, message, ...extra };
}

/* ── 1. Charge ───────────────────────────────────────────────────────────── */

type ChargeOutcome =
  | { ok: true; balanceAfterNgn: number }
  | SendFailure;

/**
 * Debit the unit price inside one transaction: lock, check, update, ledger,
 * commit. The ledger row and the balance change commit or roll back together,
 * so the ledger can never disagree with the wallet.
 */
async function chargeWallet(client: ClientLike, params: SendParams): Promise<ChargeOutcome> {
  const { userId, payload } = params;
  const amount = BANK_MAILER_PRICE_NGN;
  const chargeKey = `bank_mailer:${payload.transactionId}:${randomUUID()}`;

  try {
    await client.query("BEGIN");

    const current = await client.query(
      "SELECT wallet_balance_ngn FROM app_users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const row = current.rows[0];
    if (!row) {
      await rollback(client);
      return failure(404, "USER_NOT_FOUND", "Your account could not be found.");
    }

    const before = Number(row.wallet_balance_ngn);
    if (!Number.isFinite(before)) {
      await rollback(client);
      return failure(500, "INVALID_BALANCE", "Your wallet balance could not be read.");
    }

    if (before + 1e-9 < amount) {
      await rollback(client);
      return failure(
        402,
        "INSUFFICIENT_FUNDS",
        `Insufficient balance — you need ${amount} to send this notice.`,
        { requiredNgn: amount, balanceNgn: round2(before) },
      );
    }

    const after = round2(before - amount);
    const updated = await client.query(
      "UPDATE app_users SET wallet_balance_ngn = $1, updated_at = NOW() WHERE id = $2 AND wallet_balance_ngn = $3",
      [after, userId, before],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      await rollback(client);
      return failure(409, "CONCURRENT_MODIFICATION", "Your balance changed while charging; please retry.");
    }

    await client.query(
      `INSERT INTO wallet_ledger (user_id, amount_ngn, balance_after_ngn, description, transaction_type, reference, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        userId,
        -amount,
        after,
        `Bank Mailer — debit/credit notice pair (${payload.transactionId})`,
        "email_dispatch",
        BANK_MAILER_SERVICE,
        chargeKey,
        JSON.stringify({
          service: BANK_MAILER_SERVICE,
          transaction_id: payload.transactionId,
          credits: BANK_MAILER_CREDITS,
          sender_email: payload.sender.email,
          receiver_email: payload.receiver.email,
        }),
      ],
    );

    await client.query("COMMIT");
    return { ok: true, balanceAfterNgn: after };
  } catch {
    await rollback(client);
    return failure(500, "CHARGE_FAILED", "The wallet charge could not be completed.");
  }
}

/* ── 2. Refund ───────────────────────────────────────────────────────────── */

type RefundOutcome = { ok: true; balanceAfterNgn: number } | SendFailure;

/**
 * Credit the exact amount back. Its own transaction, keyed to the transaction
 * id so the recovery path is visible in the ledger as a real refund row.
 */
async function refundWallet(
  client: ClientLike,
  params: SendParams,
  reason: string,
): Promise<RefundOutcome> {
  const { userId, payload } = params;
  const amount = BANK_MAILER_PRICE_NGN;
  const refundKey = `bank_mailer_refund:${payload.transactionId}:${randomUUID()}`;

  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT wallet_balance_ngn FROM app_users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const row = current.rows[0];
    if (!row) {
      await rollback(client);
      return failure(404, "USER_NOT_FOUND", "Your account could not be found for the refund.");
    }
    const before = Number(row.wallet_balance_ngn);
    if (!Number.isFinite(before)) {
      await rollback(client);
      return failure(500, "INVALID_BALANCE", "Your wallet balance could not be read.");
    }

    const after = round2(before + amount);
    const updated = await client.query(
      "UPDATE app_users SET wallet_balance_ngn = $1, updated_at = NOW() WHERE id = $2 AND wallet_balance_ngn = $3",
      [after, userId, before],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      await rollback(client);
      return failure(409, "CONCURRENT_MODIFICATION", "Your balance changed while refunding; please retry.");
    }

    await client.query(
      `INSERT INTO wallet_ledger (user_id, amount_ngn, balance_after_ngn, description, transaction_type, reference, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        userId,
        amount,
        after,
        `Refund — Bank Mailer dispatch failed (${payload.transactionId})`,
        "refund",
        BANK_MAILER_SERVICE,
        refundKey,
        JSON.stringify({ service: BANK_MAILER_SERVICE, transaction_id: payload.transactionId, reason }),
      ],
    );

    await client.query("COMMIT");
    return { ok: true, balanceAfterNgn: after };
  } catch {
    await rollback(client);
    return failure(500, "REFUND_FAILED", "The automatic refund could not be recorded.");
  }
}

/* ── 3. Orchestration ────────────────────────────────────────────────────── */

/**
 * Charge → render → dispatch in parallel → refund on any failure.
 *
 * Returns a discriminated outcome the route maps straight onto an HTTP
 * response; `dispatch` is injected so tests drive it without a mail provider.
 */
export async function executeBankMailerSend(
  client: ClientLike,
  params: SendParams,
  dispatch: NoticeDispatcher,
): Promise<SendOutcome> {
  const charge = await chargeWallet(client, params);
  if (!charge.ok) return charge;

  const { payload, platformName } = params;

  let report: DispatchReport;
  try {
    const debit = renderBankNotice({ kind: "debit", payload, platformName });
    const credit = renderBankNotice({ kind: "credit", payload, platformName });
    report = await dispatch({
      debit: { to: payload.sender.email, ...debit },
      credit: { to: payload.receiver.email, ...credit },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    report = {
      debit: { ok: false, code: "DISPATCH_ERROR", message: detail },
      credit: { ok: false, code: "DISPATCH_ERROR", message: detail },
    };
  }

  const failures: string[] = [];
  if (!report.debit.ok) failures.push(`debit notice: ${report.debit.message}`);
  if (!report.credit.ok) failures.push(`credit notice: ${report.credit.message}`);

  if (failures.length > 0) {
    const reason = failures.join("; ");
    const refund = await refundWallet(client, params, reason);
    if (!refund.ok) {
      return failure(
        500,
        "DISPATCH_AND_REFUND_FAILED",
        `Email delivery failed (${reason}) and the automatic refund could not be recorded. Contact support with transaction ${payload.transactionId}.`,
        { refundFailed: true },
      );
    }
    return failure(
      502,
      "DISPATCH_FAILED",
      `Email delivery failed (${reason}) — ${BANK_MAILER_PRICE_NGN} NGN was refunded to your wallet.`,
    );
  }

  return {
    ok: true,
    transactionId: payload.transactionId,
    chargedNgn: BANK_MAILER_PRICE_NGN,
    balanceAfterNgn: charge.balanceAfterNgn,
    delivery: {
      debit: report.debit.ok ? report.debit.messageId ?? "sent" : "sent",
      credit: report.credit.ok ? report.credit.messageId ?? "sent" : "sent",
    },
  };
}
