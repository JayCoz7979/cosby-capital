-- ============================================================
-- MIGRATION 007: BENEFICIAL OWNERS + OFAC SCREENINGS
-- Corporate Transparency Act compliance (beneficial_owners)
-- OFAC/Sanctions screening log (ofac_screenings)
-- Additional OFAC columns on clients table
-- ============================================================

-- ============================================================
-- beneficial_owners — Corporate Transparency Act compliance
-- ============================================================
CREATE TABLE beneficial_owners (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  -- SSN last 4 stored encrypted via pgsodium (A14 — PII encryption)
  ssn_last4_encrypted bytea,
  ssn_last4_key_id uuid,
  address text,
  ownership_percentage numeric CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),
  ofac_screened boolean DEFAULT false,
  ofac_screened_at timestamptz,
  ofac_result text DEFAULT 'pending' CHECK (ofac_result IN ('pending','clear','flagged','blocked')),
  ofac_match_score numeric,
  ofac_notes text
);
ALTER TABLE beneficial_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bo_own" ON beneficial_owners FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

COMMENT ON COLUMN beneficial_owners.ssn_last4_encrypted IS 'SSN last 4 digits encrypted via pgsodium.encrypt() — never store plaintext';
COMMENT ON COLUMN beneficial_owners.ssn_last4_key_id IS 'pgsodium key UUID used to encrypt ssn_last4_encrypted';

-- ============================================================
-- ofac_screenings — OFAC/Sanctions screening audit log
-- ============================================================
CREATE TABLE ofac_screenings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) NOT NULL,
  screening_type text NOT NULL CHECK (screening_type IN ('business','individual')),
  entity_name text NOT NULL,
  entity_dob date,
  result text NOT NULL CHECK (result IN ('clear','flagged','blocked')),
  match_score numeric,
  raw_response jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  disposition text
);
ALTER TABLE ofac_screenings ENABLE ROW LEVEL SECURITY;
-- Clients can read their own screenings
CREATE POLICY "ofac_own_read" ON ofac_screenings FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
-- Only service_role can insert (OFAC screening always runs server-side)
CREATE POLICY "ofac_service_write" ON ofac_screenings FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Add OFAC columns to clients table
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ofac_status text DEFAULT 'pending'
  CHECK (ofac_status IN ('pending','clear','flagged','blocked'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ofac_screened_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS beneficial_ownership_collected boolean DEFAULT false;
