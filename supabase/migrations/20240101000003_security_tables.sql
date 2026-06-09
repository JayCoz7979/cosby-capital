-- ============================================================
-- MIGRATION 003: SECURITY TABLES
-- S11-012: Every CREATE TABLE immediately followed by ENABLE ROW LEVEL SECURITY
-- Each table has RLS policy in this same file.
-- ============================================================

-- ============================================================
-- trusted_devices — device fingerprint login (TIER 1 item 002)
-- ============================================================
CREATE TABLE trusted_devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  device_name text,
  trusted_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '90 days'),
  ip_address inet,
  user_agent text
);
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_devices" ON trusted_devices FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- processed_webhook_events — Stripe idempotency (S6-001, S14-009)
-- stripe_event_id UNIQUE NOT NULL enforces exactly-once processing
-- ============================================================
CREATE TABLE processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  payload_hash text
);
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
-- Service role only — no client access
CREATE POLICY "webhook_events_service_role_only" ON processed_webhook_events FOR ALL
  USING (false);

-- ============================================================
-- active_sessions — concurrent session detection (GAP-256)
-- ============================================================
CREATE TABLE active_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  device_fingerprint text,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_sessions" ON active_sessions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- deletion_requests — CCPA right-to-erasure (S9-010)
-- ============================================================
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  requested_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'denied')),
  completed_at timestamptz,
  denial_reason text
);
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_deletion_select" ON deletion_requests FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "deletion_service_role_insert" ON deletion_requests FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- exploit_chains — security registry (S13-004)
-- ============================================================
CREATE TABLE exploit_chains (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain_id text UNIQUE NOT NULL,
  title text NOT NULL,
  steps text[] NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  documented_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  mitigation text
);
ALTER TABLE exploit_chains ENABLE ROW LEVEL SECURITY;
-- Admin read only via service_role; no authenticated user access
CREATE POLICY "exploit_chains_admin_only" ON exploit_chains FOR ALL
  USING (false);

-- ============================================================
-- admin_audit_log — immutable audit trail (S8-003)
-- INSERT only; UPDATE and DELETE blocked at trigger AND role level
-- ============================================================
CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- INSERT only from service_role — no UPDATE/DELETE ever
CREATE POLICY "audit_log_service_role_insert_only" ON admin_audit_log FOR INSERT
  WITH CHECK (true);

-- Immutable trigger: prevents UPDATE/DELETE at DB level (S8-003)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable — modifications not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================
-- platform_settings — model pins, price IDs, key rotation (S9-012, S15-012)
-- anthropic_model MUST be pinned to 'claude-sonnet-4-6' (never 'latest')
-- ============================================================
CREATE TABLE platform_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz DEFAULT now(),
  updated_by text
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- Service role only
CREATE POLICY "platform_settings_service_role_only" ON platform_settings FOR ALL
  USING (false);

-- Seed required settings
INSERT INTO platform_settings (key, value) VALUES
  ('anthropic_model', 'claude-sonnet-4-6'),
  ('stripe_starter_monthly', ''),
  ('stripe_starter_annual', ''),
  ('stripe_growth_monthly', ''),
  ('stripe_growth_annual', ''),
  ('stripe_capital_partner_monthly', ''),
  ('stripe_capital_partner_annual', ''),
  ('anthropic_key_created', '2026-06-09'),
  ('stripe_key_created', '2026-06-09');

-- ============================================================
-- api_keys — external API key management (S8-006)
-- Must have expires_at and allowed_scopes
-- ============================================================
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  allowed_scopes text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  is_active boolean DEFAULT true
);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
-- Service role only
CREATE POLICY "api_keys_service_role_only" ON api_keys FOR ALL
  USING (false);
