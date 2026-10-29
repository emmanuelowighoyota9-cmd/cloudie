-- Admin Email Template Catalog — selectable, priced email layouts.
--
-- One row per product. `html_content` is always the sanitised form produced by
-- the API (scripts, event handlers and script URLs are stripped before insert).
-- Placeholders are constrained per `service_type` in the API layer; the check
-- here keeps the enum closed even if a row is written by another path.
--
-- Additive only: no existing table is altered.

CREATE TABLE IF NOT EXISTS email_template_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('billing','security_alerts','user_onboarding','notifications')),
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  html_content TEXT NOT NULL,
  price_credits NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_credits >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_template_products_service_active_idx
  ON email_template_products(service_type, is_active, price_credits);

CREATE INDEX IF NOT EXISTS email_template_products_created_idx
  ON email_template_products(created_at DESC);
