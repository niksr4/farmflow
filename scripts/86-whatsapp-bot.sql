-- WhatsApp bot: phone number on users + conversation sessions table

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS whatsapp_phone text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_whatsapp_phone
  ON tenant_users (whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL;

-- Stores pending bot intents waiting for YES/NO confirmation.
-- Expires after 10 minutes so stale confirmations are ignored.
CREATE TABLE IF NOT EXISTS whatsapp_bot_sessions (
  id          bigserial   PRIMARY KEY,
  phone       text        NOT NULL,
  tenant_id   uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  user_role   text        NOT NULL DEFAULT 'user',
  pending_intent jsonb,
  expires_at  timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone_active
  ON whatsapp_bot_sessions (phone)
  WHERE expires_at > NOW();

-- Clean up expired sessions automatically (pg_cron or manual vacuum handles this,
-- but we add a partial index so queries never touch expired rows)
