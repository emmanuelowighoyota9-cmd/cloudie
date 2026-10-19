-- Cloudie Neon migration phase 7: administrative audit trail.
-- Additive only; matches api/src/server.ts recordAuditLog() and GET /api/admin/audit-logs.
-- Audit rows must survive actor/target deletion, so user references use ON DELETE SET NULL.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  tenant_id TEXT REFERENCES tenant_sites(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_created_idx ON admin_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_created_idx ON admin_audit_logs (action, created_at DESC);
COMMIT;
