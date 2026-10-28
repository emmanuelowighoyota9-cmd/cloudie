-- Transaction Mail Studio — delivery log.
--
-- One row per paid send. The studio delivers only to the signed-in account's own
-- address (the recipient is taken from the session, never from the request), so
-- this table is a rendering-test history, not a mailing list.
--
-- Additive only: no existing table is altered.

CREATE TABLE IF NOT EXISTS mail_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  -- Template the user picked (see TRANSACTION_MAIL_TEMPLATES in api/src/transactionMailer.ts).
  template_key TEXT NOT NULL,
  notice_type TEXT NOT NULL CHECK (notice_type IN ('deposit','withdrawal','transfer','security')),
  -- Always the account owner's own verified address.
  recipient_email TEXT NOT NULL,
  amount TEXT NOT NULL,
  -- Asset symbol (BTC, ETH, USDT, NGN …). Named `currency` to match the MailLogs contract.
  currency TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','SENT','FAILED')),
  error_message TEXT,
  charged_ngn NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mail_logs_user_created_idx
  ON mail_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mail_logs_status_created_idx
  ON mail_logs(status, created_at DESC);
