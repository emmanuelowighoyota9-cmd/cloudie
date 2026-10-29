/**
 * Transaction Mail Studio — the pay-per-send workflow.
 *
 * Execution order:
 *
 *   1. The route validates the payload and supplies the recipient from the
 *      authenticated session; only a validated payload reaches this module.
 *   2. Charge: the user's row is locked `FOR UPDATE`, the balance is checked
 *      against the unit price, and the debit + ledger row commit together. A
 *      short balance is a `402` before a single kobo moves.
 *   3. Log: a PENDING `mail_logs` row is written, so a crash mid-send leaves a
 *      record of an unresolved attempt instead of nothing.
 *   4. Render + dispatch through an injected mailer (see `mailTransport.ts`).
 *   5. Recovery: any failure after the charge refunds the full amount in its own
 *      transaction, marks the log FAILED with the reason, and reports what
 *      happened. A refund that itself fails is surfaced, never swallowed.
 *
 * Database access goes through a structural `ClientLike`, so the whole workflow
 * runs against a fake in `transactionMailer.test.ts` — every failure path is
 * exercised without a live Postgres.
 */
import { randomUUID } from "node:crypto";
import {
  TRANSACTION_MAILER_CREDITS,
  TRANSACTION_MAILER_PRICE_NGN,
  TRANSACTION_MAILER_SERVICE,
  renderTransactionMail,
  type MailBrand,
  type TransactionMailPayload,
} from "./transactionMailer.js";
import type { MailAttempt, OutboundEmail } from "./mailTransport.js";
import {
  renderEmailTemplate,
  templateSurchargeNgn,
  transactionTemplateVariables,
  type EmailTemplateProduct,
} from "./emailTemplates.js";

/* ── Structural types ────────────────────────────────────────────────────── */

export type QueryResultLike = {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
};

export type ClientLike = {
  query(text: string, values?: unknown[]): Promise<QueryResultLike>;
};

export type Mailer = (email: OutboundEmail) => Promise<MailAttempt>;

export type SendParams = {
  userId: string;
  /** Taken from the authenticated session by the route — never from the body. */
  recipientEmail: string;
  payload: TransactionMailPayload;
  brand: MailBrand;
  platformName: string;
  /** Active catalog layout chosen by the customer, if any. */
  template?: Pick<EmailTemplateProduct, "id" | "htmlContent" | "priceCredits"> | null;
};

export type SendSuccess = {
  ok: true;
  logId: string;
  transactionId: string;
  chargedNgn: number;
  balanceAfterNgn: number;
  status: "SENT";
  messageId: string | null;
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

/** Base price plus any pay-per-use template surcharge. */
function unitPrice(params: SendParams): number {
  const surcharge = params.template ? templateSurchargeNgn(params.template.priceCredits) : 0;
  return round2(TRANSACTION_MAILER_PRICE_NGN + surcharge);
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

type ChargeOutcome = { ok: true; balanceAfterNgn: number } | SendFailure;

async function chargeWallet(client: ClientLike, params: SendParams): Promise<ChargeOutcome> {
  const { userId, payload } = params;
  const amount = unitPrice(params);
  const chargeKey = `transaction_mailer:${payload.txHash}:${randomUUID()}`;

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
        `Insufficient balance — you need ₦${amount.toLocaleString("en-NG")} to send this mail.`,
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
        `Transaction Mail Studio — ${payload.templateKey} preview (${payload.txHash.slice(0, 12)})`,
        "email_dispatch",
        TRANSACTION_MAILER_SERVICE,
        chargeKey,
        JSON.stringify({
          service: TRANSACTION_MAILER_SERVICE,
          template: payload.templateKey,
          tx_hash: payload.txHash,
          credits: TRANSACTION_MAILER_CREDITS,
          recipient_email: params.recipientEmail,
          ...(params.template ? { template_id: params.template.id } : {}),
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

async function refundWallet(
  client: ClientLike,
  params: SendParams,
  reason: string,
): Promise<RefundOutcome> {
  const { userId, payload } = params;
  const amount = unitPrice(params);
  const refundKey = `transaction_mailer_refund:${payload.txHash}:${randomUUID()}`;

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
        `Refund — Transaction Mail Studio delivery failed (${payload.txHash.slice(0, 12)})`,
        "refund",
        TRANSACTION_MAILER_SERVICE,
        refundKey,
        JSON.stringify({ service: TRANSACTION_MAILER_SERVICE, tx_hash: payload.txHash, reason }),
      ],
    );

    await client.query("COMMIT");
    return { ok: true, balanceAfterNgn: after };
  } catch {
    await rollback(client);
    return failure(500, "REFUND_FAILED", "The automatic refund could not be recorded.");
  }
}

/* ── 3. Log rows ─────────────────────────────────────────────────────────── */

async function insertLog(client: ClientLike, logId: string, params: SendParams): Promise<void> {
  const { userId, recipientEmail, payload } = params;
  await client.query(
    `INSERT INTO mail_logs
       (id, user_id, template_key, notice_type, recipient_email, amount, currency, tx_hash, status, charged_ngn)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)`,
    [
      logId,
      userId,
      payload.templateKey,
      payload.noticeType,
      recipientEmail,
      payload.amount,
      payload.currency,
      payload.txHash,
      unitPrice(params),
    ],
  );
}

async function finishLog(
  client: ClientLike,
  logId: string,
  status: "SENT" | "FAILED",
  errorMessage: string | null,
): Promise<boolean> {
  try {
    const result = await client.query(
      "UPDATE mail_logs SET status = $1, error_message = $2 WHERE id = $3",
      [status, errorMessage, logId],
    );
    return (result.rowCount ?? 0) === 1;
  } catch {
    return false;
  }
}

/* ── 4. Orchestration ────────────────────────────────────────────────────── */

/**
 * Charge → log → render → dispatch → refund on failure.
 *
 * Returns a discriminated outcome the route maps straight onto an HTTP response;
 * `send` is injected so tests drive it without a mail provider.
 */
export async function executeTransactionMailSend(
  client: ClientLike,
  params: SendParams,
  send: Mailer,
): Promise<SendOutcome> {
  const charge = await chargeWallet(client, params);
  if (!charge.ok) return charge;

  const logId = randomUUID();
  let logWritten = true;
  try {
    await insertLog(client, logId, params);
  } catch {
    logWritten = false;
  }

  let attempt: MailAttempt;
  try {
    const mail = renderTransactionMail({
      payload: params.payload,
      brand: params.brand,
      platformName: params.platformName,
    });
    const html = params.template
      ? renderEmailTemplate(
          params.template.htmlContent,
          transactionTemplateVariables({
            platformName: params.platformName,
            brandName: params.brand.name,
            recipientEmail: params.recipientEmail,
            noticeType: params.payload.noticeType,
            amount: params.payload.amount,
            currency: params.payload.currency,
            transactionId: params.payload.txHash,
            status: "SENT",
            message: params.payload.note ?? "",
            occurredAt: params.payload.occurredAt,
          }),
        )
      : mail.html;
    attempt = await send({ to: params.recipientEmail, ...mail, html });
  } catch (error) {
    attempt = {
      ok: false,
      code: "DISPATCH_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!attempt.ok) {
    const reason = attempt.message;
    const refund = await refundWallet(client, params, reason);
    if (logWritten) await finishLog(client, logId, "FAILED", reason.slice(0, 400));

    if (!refund.ok) {
      return failure(
        500,
        "DISPATCH_AND_REFUND_FAILED",
        `Email delivery failed (${reason}) and the automatic refund could not be recorded. Contact support with reference ${params.payload.txHash}.`,
        { refundFailed: true },
      );
    }
    return failure(
      502,
      "DISPATCH_FAILED",
      `Email delivery failed (${reason}) — ₦${unitPrice(params).toLocaleString(
        "en-NG",
      )} was refunded to your wallet.`,
    );
  }

  // Delivery succeeded; a log write that failed earlier is retried here so the
  // history still shows the send that actually happened.
  if (!logWritten) {
    try {
      await insertLog(client, logId, params);
    } catch {
      // The email is already out; the charge stands and the ledger row proves it.
    }
  }
  await finishLog(client, logId, "SENT", null);

  return {
    ok: true,
    logId,
    transactionId: params.payload.txHash,
    chargedNgn: unitPrice(params),
    balanceAfterNgn: charge.balanceAfterNgn,
    status: "SENT",
    messageId: attempt.messageId,
  };
}
