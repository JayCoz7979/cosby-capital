-- ============================================================
-- MIGRATION 006: ONBOARDING SESSIONS + KYB VERIFICATIONS
-- Creates onboarding_sessions and kyb_verifications tables.
-- pgsodium used for EIN encryption (A14 — PII field encryption).
-- ============================================================

-- ============================================================
-- onboarding_sessions — per-user wizard progress store
-- ============================================================
CREATE TABLE onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  last_completed_step integer DEFAULT 0,
  step_data jsonb DEFAULT '{}'::jsonb,
  completed boolean DEFAULT false,
  completed_at timestamptz
);
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_own" ON onboarding_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- kyb_verifications — KYB verification audit trail
-- ============================================================
CREATE TABLE kyb_verifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  -- EIN stored encrypted via pgsodium (A14); never stored plaintext
  ein_encrypted bytea,
  ein_key_id uuid,
  business_name text NOT NULL,
  state text,
  vendor text DEFAULT 'internal',
  status text NOT NULL CHECK (status IN ('verified','failed','pending','manual_review')),
  notes text,
  raw_response jsonb,
  verified_at timestamptz
);
ALTER TABLE kyb_verifications ENABLE ROW LEVEL SECURITY;
-- Clients can read their own verifications; writes via service_role only
CREATE POLICY "kyb_own_read" ON kyb_verifications FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "kyb_service_write" ON kyb_verifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Document encryption requirement for EIN fields
COMMENT ON COLUMN kyb_verifications.ein_encrypted IS 'EIN encrypted via pgsodium.encrypt() — never store plaintext EIN';
COMMENT ON COLUMN kyb_verifications.ein_key_id IS 'pgsodium key UUID used to encrypt ein_encrypted';

-- ============================================================
-- Add KYB + onboarding columns to clients table
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyb_status text DEFAULT 'pending'
  CHECK (kyb_status IN ('pending','verified','failed','blocked','manual_review'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyb_verified_at timestamptz;
-- EIN stored encrypted; ein_encrypted holds pgsodium ciphertext.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ein_encrypted bytea;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ein_key_id uuid;
COMMENT ON COLUMN clients.ein_encrypted IS 'EIN encrypted via pgsodium.encrypt() — never store plaintext EIN';
COMMENT ON COLUMN clients.ein_key_id IS 'pgsodium key UUID used to encrypt ein_encrypted';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
