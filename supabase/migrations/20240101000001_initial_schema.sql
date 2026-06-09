-- ============================================================
-- MIGRATION 001: INITIAL SCHEMA
-- Cosby Capital — Full Supabase Schema
-- S11-012: Every CREATE TABLE immediately followed by ENABLE ROW LEVEL SECURITY
-- ============================================================

-- EXTENSIONS (required before tables)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. CLIENTS
-- ============================================================
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Business profile
  business_name text NOT NULL,
  owner_name text NOT NULL,
  email text NOT NULL,
  phone text,
  website text,
  business_type text,
  industry text,
  naics_code text,
  years_in_business integer,
  num_employees integer,
  annual_revenue numeric,
  state text,
  county text,
  city text,
  zip text,

  -- Funding profile
  funding_goal numeric,
  funding_purpose text,
  funding_urgency text,
  credit_score_range text,
  has_collateral boolean DEFAULT false,
  collateral_description text,
  has_existing_debt boolean DEFAULT false,
  existing_debt_amount numeric,

  -- Flags
  is_minority_owned boolean DEFAULT false,
  is_woman_owned boolean DEFAULT false,
  is_veteran_owned boolean DEFAULT false,
  is_rural_business boolean DEFAULT false,
  is_nonprofit boolean DEFAULT false,

  -- Subscription
  subscription_tier text DEFAULT 'starter',
  subscription_status text DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,

  -- Onboarding
  onboarding_completed boolean DEFAULT false,
  onboarding_step integer DEFAULT 1
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. LENDERS
-- ============================================================
CREATE TABLE lenders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  name text NOT NULL,
  lender_type text NOT NULL,
  website text,
  phone text,
  email text,
  description text,

  -- Geography
  states_served text[],
  national boolean DEFAULT false,

  -- Loan parameters
  min_loan_amount numeric,
  max_loan_amount numeric,
  min_interest_rate numeric,
  max_interest_rate numeric,
  loan_terms_months_min integer,
  loan_terms_months_max integer,

  -- Eligibility criteria
  min_credit_score integer,
  min_years_in_business integer,
  min_annual_revenue numeric,
  requires_collateral boolean DEFAULT false,
  accepts_startups boolean DEFAULT false,
  accepts_bad_credit boolean DEFAULT false,

  -- Loan types offered
  loan_types text[],

  -- Industries served
  industries_served text[],
  industries_excluded text[],

  -- Special programs
  minority_programs boolean DEFAULT false,
  women_programs boolean DEFAULT false,
  veteran_programs boolean DEFAULT false,
  rural_programs boolean DEFAULT false,
  nonprofit_eligible boolean DEFAULT false,

  -- Match scoring weight
  match_priority integer DEFAULT 5,

  is_active boolean DEFAULT true
);
ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. GRANTS
-- ============================================================
CREATE TABLE grants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  name text NOT NULL,
  grantor text NOT NULL,
  grantor_type text,
  source_url text,
  description text,

  -- Award
  min_award_amount numeric,
  max_award_amount numeric,
  is_recurring boolean DEFAULT false,
  recurrence_notes text,

  -- Deadlines
  application_open_date date,
  application_deadline date,
  next_cycle_estimated date,
  is_rolling_deadline boolean DEFAULT false,

  -- Eligibility
  eligible_states text[],
  eligible_industries text[],
  eligible_business_types text[],
  min_years_in_business integer DEFAULT 0,
  max_employees integer,
  max_annual_revenue numeric,
  requires_minority_owned boolean DEFAULT false,
  requires_woman_owned boolean DEFAULT false,
  requires_veteran_owned boolean DEFAULT false,
  requires_rural boolean DEFAULT false,
  requires_nonprofit boolean DEFAULT false,

  -- Purpose
  eligible_purposes text[],

  -- Tier access
  available_to_tiers text[] DEFAULT ARRAY['growth','capital_partner','done_for_you'],

  -- Status
  is_active boolean DEFAULT true,
  last_verified_date date
);
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. LENDER MATCHES
-- ============================================================
CREATE TABLE lender_matches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,

  lender_id uuid REFERENCES lenders(id),
  match_score numeric,
  match_reasons text[],
  disqualifiers text[],
  recommended_loan_type text,
  estimated_loan_range_min numeric,
  estimated_loan_range_max numeric,

  status text DEFAULT 'new',
  client_notes text,
  agent_notes text,

  contacted_at timestamptz,
  applied_at timestamptz,
  decision_at timestamptz,
  decision text,
  funded_amount numeric,
  success_fee_due numeric,
  success_fee_paid boolean DEFAULT false
);
ALTER TABLE lender_matches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. GRANT MATCHES
-- ============================================================
CREATE TABLE grant_matches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,

  grant_id uuid REFERENCES grants(id),
  match_score numeric,
  match_reasons text[],
  eligibility_flags text[],
  recommended_action text,

  status text DEFAULT 'new',
  writing_assigned boolean DEFAULT false,
  writing_assigned_at timestamptz,
  submitted_at timestamptz,
  decision_at timestamptz,
  decision text,
  awarded_amount numeric,
  success_fee_due numeric,
  success_fee_paid boolean DEFAULT false,

  client_notes text,
  agent_notes text,
  internal_notes text
);
ALTER TABLE grant_matches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. APPLICATIONS
-- ============================================================
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  application_type text NOT NULL,
  grant_match_id uuid REFERENCES grant_matches(id),
  lender_match_id uuid REFERENCES lender_matches(id),

  title text,
  status text DEFAULT 'draft',
  amount_requested numeric,
  amount_awarded numeric,

  submitted_at timestamptz,
  decision_at timestamptz,
  next_followup_at timestamptz,

  documents_required text[],
  documents_submitted text[],
  notes text
);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. CREDIT ROADMAPS
-- ============================================================
CREATE TABLE credit_roadmaps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  current_score_range text,
  target_score integer,
  target_date date,

  steps jsonb,
  agent_summary text,
  last_updated_by text DEFAULT 'capital-grant-finder-agent'
);
ALTER TABLE credit_roadmaps ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. OPPORTUNITY DIGESTS
-- ============================================================
CREATE TABLE opportunity_digests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,

  digest_type text,
  new_lender_matches integer DEFAULT 0,
  new_grant_matches integer DEFAULT 0,
  upcoming_deadlines jsonb,
  summary_html text,
  sent_at timestamptz,
  email_status text DEFAULT 'pending'
);
ALTER TABLE opportunity_digests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. AGENT LOGS
-- ============================================================
CREATE TABLE agent_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  agent_name text NOT NULL,
  client_id uuid REFERENCES clients(id),
  action text,
  result text,
  metadata jsonb,
  error text,
  duration_ms integer
);
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. CAPITAL LEADS (pre-signup)
-- ============================================================
CREATE TABLE capital_leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  name text,
  email text NOT NULL,
  phone text,
  business_name text,
  funding_need text,
  referral_source text,
  email_verified boolean DEFAULT false,
  verification_token text,
  converted_to_client boolean DEFAULT false,
  converted_at timestamptz
);
ALTER TABLE capital_leads ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. SUCCESS FEE TIERS
-- ============================================================
CREATE TABLE success_fee_tiers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  fee_type text NOT NULL,
  min_amount numeric NOT NULL,
  max_amount numeric,
  fee_percentage numeric NOT NULL,
  label text,
  is_active boolean DEFAULT true
);
ALTER TABLE success_fee_tiers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. CONSULTING AGREEMENTS
-- ============================================================
CREATE TABLE consulting_agreements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,

  agreement_version text DEFAULT 'v1.0',
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,

  loan_fee_schedule jsonb,
  grant_fee_schedule jsonb,

  ack_consultant_not_broker boolean DEFAULT false,
  ack_no_loan_terms_negotiated boolean DEFAULT false,
  ack_performance_bonus_structure boolean DEFAULT false,
  ack_no_guarantee_of_funding boolean DEFAULT false,
  ack_client_applies_directly boolean DEFAULT false,
  ack_terms_of_service boolean DEFAULT false,

  agreement_text_snapshot text,

  is_valid boolean DEFAULT true
);
ALTER TABLE consulting_agreements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 13. SIGNATURE DOCUMENTS (master templates)
-- ============================================================
CREATE TABLE signature_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  document_type text NOT NULL UNIQUE,
  document_version text NOT NULL DEFAULT 'v1.0',
  document_title text NOT NULL,
  document_html text NOT NULL,
  document_text_hash text NOT NULL,
  required_for_tiers text[] DEFAULT ARRAY['starter','growth','capital_partner','done_for_you'],
  is_active boolean DEFAULT true
);
ALTER TABLE signature_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. SIGNATURE REQUESTS (per-client, per-document)
-- ============================================================
CREATE TABLE signature_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_id uuid REFERENCES signature_documents(id),
  document_snapshot_html text NOT NULL,
  document_snapshot_hash text NOT NULL,
  status text DEFAULT 'pending',
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  sent_at timestamptz,
  reminder_sent_at timestamptz,
  metadata jsonb
);
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 15. SIGNATURES (executed signature records)
-- ============================================================
CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  signature_request_id uuid REFERENCES signature_requests(id),
  client_id uuid REFERENCES clients(id),
  signer_type text NOT NULL DEFAULT 'client',
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_title text,

  -- Audit trail
  signed_at timestamptz NOT NULL,
  signed_ip text NOT NULL,
  signed_user_agent text NOT NULL,
  signed_device_fingerprint text,
  signed_geolocation text,

  -- Signature data
  typed_name text NOT NULL,
  signature_font text DEFAULT 'Dancing Script',
  initials text,

  -- Tamper-evident hashes
  document_hash_at_signing text NOT NULL,
  audit_hash text NOT NULL,

  -- Executed PDF
  fully_executed_pdf_path text,
  fully_executed_pdf_hash text,

  -- Delivery tracking
  emailed_to_client boolean DEFAULT false,
  emailed_to_client_at timestamptz,
  emailed_to_company boolean DEFAULT false,
  emailed_to_company_at timestamptz
);
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 16. CLIENT DOCUMENTS
-- ============================================================
CREATE TABLE client_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_category text NOT NULL,
  file_name text NOT NULL,
  folder_path text NOT NULL,
  file_path_supabase text,
  file_path_s3 text,
  file_path_gdrive text,
  file_size_bytes integer,
  file_hash text NOT NULL,
  signed_at timestamptz,
  signature_id uuid REFERENCES signatures(id),
  uploaded_by text DEFAULT 'system',
  description text,
  is_executed boolean DEFAULT false,
  storage_supabase_verified boolean DEFAULT false,
  storage_s3_verified boolean DEFAULT false,
  storage_gdrive_verified boolean DEFAULT false,
  storage_verified boolean GENERATED ALWAYS AS
    (storage_supabase_verified AND storage_s3_verified AND storage_gdrive_verified) STORED,
  storage_verified_at timestamptz
);
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MATCH SCORING FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION score_lender_match(
  p_client_id uuid,
  p_lender_id uuid
) RETURNS numeric AS $$
DECLARE
  c clients%rowtype;
  l lenders%rowtype;
  score numeric := 0;
BEGIN
  SELECT * INTO c FROM clients WHERE id = p_client_id;
  SELECT * INTO l FROM lenders WHERE id = p_lender_id;

  -- Credit score check (hard disqualifier)
  IF l.min_credit_score IS NOT NULL THEN
    CASE c.credit_score_range
      WHEN '750+' THEN score := score + 25;
      WHEN '700-750' THEN score := score + 20;
      WHEN '650-700' THEN IF l.min_credit_score <= 650 THEN score := score + 15; END IF;
      WHEN '600-650' THEN IF l.min_credit_score <= 600 THEN score := score + 10; END IF;
      WHEN '500-600' THEN IF l.min_credit_score <= 580 THEN score := score + 5; ELSE RETURN 0; END IF;
      WHEN '<500' THEN IF l.accepts_bad_credit THEN score := score + 2; ELSE RETURN 0; END IF;
      ELSE score := score + 10;
    END CASE;
  ELSE
    score := score + 15;
  END IF;

  -- Years in business
  IF l.min_years_in_business IS NOT NULL AND c.years_in_business IS NOT NULL THEN
    IF c.years_in_business >= l.min_years_in_business THEN
      score := score + 15;
    ELSE
      IF l.accepts_startups THEN score := score + 5;
      ELSE RETURN 0; END IF;
    END IF;
  ELSE
    score := score + 10;
  END IF;

  -- Revenue match
  IF l.min_annual_revenue IS NOT NULL AND c.annual_revenue IS NOT NULL THEN
    IF c.annual_revenue >= l.min_annual_revenue THEN score := score + 15;
    ELSE score := score - 10; END IF;
  ELSE
    score := score + 10;
  END IF;

  -- Loan amount range
  IF l.min_loan_amount IS NOT NULL AND l.max_loan_amount IS NOT NULL AND c.funding_goal IS NOT NULL THEN
    IF c.funding_goal BETWEEN l.min_loan_amount AND l.max_loan_amount THEN
      score := score + 20;
    ELSIF c.funding_goal < l.min_loan_amount THEN
      score := score + 5;
    ELSE
      score := score + 10;
    END IF;
  ELSE
    score := score + 15;
  END IF;

  -- Geography
  IF l.national OR c.state = ANY(l.states_served) THEN
    score := score + 10;
  ELSE
    RETURN 0;
  END IF;

  -- Special programs bonus
  IF c.is_minority_owned AND l.minority_programs THEN score := score + 5; END IF;
  IF c.is_woman_owned AND l.women_programs THEN score := score + 5; END IF;
  IF c.is_veteran_owned AND l.veteran_programs THEN score := score + 5; END IF;
  IF c.is_rural_business AND l.rural_programs THEN score := score + 5; END IF;
  IF c.is_nonprofit AND l.nonprofit_eligible THEN score := score + 5; END IF;

  -- Priority weight
  score := score * (l.match_priority::numeric / 5);

  RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION score_grant_match(
  p_client_id uuid,
  p_grant_id uuid
) RETURNS numeric AS $$
DECLARE
  c clients%rowtype;
  g grants%rowtype;
  score numeric := 0;
BEGIN
  SELECT * INTO c FROM clients WHERE id = p_client_id;
  SELECT * INTO g FROM grants WHERE id = p_grant_id;

  -- Geography check (hard disqualifier)
  IF NOT (g.eligible_states @> ARRAY['ALL'] OR c.state = ANY(g.eligible_states)) THEN
    RETURN 0;
  END IF;
  score := score + 20;

  -- Business type
  IF g.eligible_business_types IS NULL OR array_length(g.eligible_business_types, 1) = 0
     OR c.business_type = ANY(g.eligible_business_types) THEN
    score := score + 15;
  ELSE
    RETURN 0;
  END IF;

  -- Years in business
  IF g.min_years_in_business IS NULL OR c.years_in_business >= g.min_years_in_business THEN
    score := score + 10;
  ELSE
    RETURN 0;
  END IF;

  -- Revenue ceiling
  IF g.max_annual_revenue IS NULL OR c.annual_revenue <= g.max_annual_revenue THEN
    score := score + 10;
  ELSE
    RETURN 0;
  END IF;

  -- Employee count
  IF g.max_employees IS NULL OR c.num_employees <= g.max_employees THEN
    score := score + 10;
  END IF;

  -- Required flags
  IF g.requires_minority_owned AND NOT c.is_minority_owned THEN RETURN 0; END IF;
  IF g.requires_woman_owned AND NOT c.is_woman_owned THEN RETURN 0; END IF;
  IF g.requires_veteran_owned AND NOT c.is_veteran_owned THEN RETURN 0; END IF;
  IF g.requires_rural AND NOT c.is_rural_business THEN RETURN 0; END IF;
  IF g.requires_nonprofit AND NOT c.is_nonprofit THEN RETURN 0; END IF;

  -- Bonus for matching special status
  IF c.is_minority_owned AND g.requires_minority_owned THEN score := score + 10; END IF;
  IF c.is_woman_owned AND g.requires_woman_owned THEN score := score + 10; END IF;
  IF c.is_veteran_owned AND g.requires_veteran_owned THEN score := score + 10; END IF;

  -- Deadline bonus
  IF g.application_deadline IS NOT NULL THEN
    IF g.application_deadline BETWEEN now()::date AND (now() + interval '30 days')::date THEN
      score := score + 15;
    ELSIF g.application_deadline BETWEEN now()::date AND (now() + interval '90 days')::date THEN
      score := score + 8;
    END IF;
  END IF;

  RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION calculate_success_fee(
  p_fee_type text,
  p_funded_amount numeric
) RETURNS TABLE (
  fee_percentage numeric,
  fee_amount numeric,
  tier_label text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.fee_percentage,
    ROUND((p_funded_amount * t.fee_percentage / 100)::numeric, 2) AS fee_amount,
    t.label AS tier_label
  FROM success_fee_tiers t
  WHERE t.fee_type = p_fee_type
    AND t.is_active = true
    AND p_funded_amount >= t.min_amount
    AND (t.max_amount IS NULL OR p_funded_amount < t.max_amount)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_pending_signatures(p_client_id uuid)
RETURNS TABLE (
  request_id uuid,
  document_type text,
  document_title text,
  created_at timestamptz,
  expires_at timestamptz,
  days_until_expiry integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.id,
    sr.document_type,
    sd.document_title,
    sr.created_at,
    sr.expires_at,
    EXTRACT(day FROM sr.expires_at - now())::integer
  FROM signature_requests sr
  JOIN signature_documents sd ON sd.id = sr.document_id
  WHERE sr.client_id = p_client_id
    AND sr.status = 'pending'
    AND sr.expires_at > now()
  ORDER BY sr.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_client_documents(p_client_id uuid)
RETURNS TABLE (
  document_id uuid,
  document_type text,
  document_category text,
  file_name text,
  folder_path text,
  signed_at timestamptz,
  is_executed boolean,
  storage_verified boolean,
  has_supabase boolean,
  has_s3 boolean,
  has_gdrive boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cd.id,
    cd.document_type,
    cd.document_category,
    cd.file_name,
    cd.folder_path,
    cd.signed_at,
    cd.is_executed,
    cd.storage_verified,
    cd.file_path_supabase IS NOT NULL,
    cd.file_path_s3 IS NOT NULL,
    cd.file_path_gdrive IS NOT NULL
  FROM client_documents cd
  WHERE cd.client_id = p_client_id
  ORDER BY COALESCE(cd.signed_at, cd.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER lenders_updated_at BEFORE UPDATE ON lenders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER grants_updated_at BEFORE UPDATE ON grants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER credit_roadmaps_updated_at BEFORE UPDATE ON credit_roadmaps FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED: SUCCESS FEE TIERS
-- ============================================================
INSERT INTO success_fee_tiers (fee_type, min_amount, max_amount, fee_percentage, label) VALUES
  ('loan', 0,        50000,    10.0, 'Up to $50K'),
  ('loan', 50000,    250000,    7.0, '$50K - $250K'),
  ('loan', 250000,   1000000,   5.0, '$250K - $1M'),
  ('loan', 1000000,  NULL,      2.0, 'Over $1M'),
  ('grant', 0,       25000,    10.0, 'Up to $25K'),
  ('grant', 25000,   100000,    8.0, '$25K - $100K'),
  ('grant', 100000,  500000,    6.0, '$100K - $500K'),
  ('grant', 500000,  NULL,      4.0, 'Over $500K');

-- ============================================================
-- SEED: LENDER DATABASE (Alabama + National)
-- ============================================================
INSERT INTO lenders (name, lender_type, website, description, national, states_served,
  min_loan_amount, max_loan_amount, min_credit_score, min_years_in_business,
  accepts_startups, accepts_bad_credit, loan_types, minority_programs, women_programs,
  veteran_programs, rural_programs, nonprofit_eligible, is_active)
VALUES
  ('SBA 7(a) Program', 'sba_preferred', 'https://sba.gov/funding-programs/loans/7a-loans',
   'The SBA flagship loan program. Funds almost any business purpose up to $5M.',
   true, ARRAY['ALL'], 50000, 5000000, 650, 2, false, false,
   ARRAY['sba_7a','term_loan','line_of_credit'], true, true, true, true, false, true),

  ('SBA 504 Program', 'sba_preferred', 'https://sba.gov/funding-programs/loans/504-loans',
   'Long-term, fixed-rate financing for major fixed assets like real estate and equipment.',
   true, ARRAY['ALL'], 125000, 5000000, 680, 2, false, false,
   ARRAY['sba_504','real_estate','equipment'], true, true, true, false, false, true),

  ('SBA Microloan Program', 'microloan', 'https://sba.gov/funding-programs/loans/microloans',
   'Up to $50K for startups and small businesses. Great for businesses with thin credit.',
   true, ARRAY['ALL'], 500, 50000, 575, 0, true, true,
   ARRAY['microloans'], true, true, true, true, true, true),

  ('USDA Business & Industry Loan', 'sba_preferred', 'https://rd.usda.gov/programs-services/business-programs/business-industry-loan-guarantees',
   'Loan guarantees for rural businesses. Excellent for Tanner, AL and rural Alabama businesses.',
   false, ARRAY['AL','TN','MS','GA'], 200000, 25000000, 660, 1, false, false,
   ARRAY['term_loan','real_estate','equipment'], false, false, false, true, false, true),

  ('Alabama Small Business Development Center', 'cdfi', 'https://asbdc.org',
   'State SBDC provides loan matching and business counseling across Alabama.',
   false, ARRAY['AL'], 10000, 500000, 600, 0, true, false,
   ARRAY['term_loan','microloans'], true, true, true, true, false, true),

  ('Pathway Lending (CDFI)', 'cdfi', 'https://pathwaylending.org',
   'CDFI serving the Southeast. Flexible lending for underserved businesses.',
   false, ARRAY['AL','TN','MS'], 25000, 750000, 580, 0, true, true,
   ARRAY['term_loan','equipment','line_of_credit'], true, true, true, true, true, true),

  ('LiftFund CDFI', 'cdfi', 'https://liftfund.com',
   'Mission-driven CDFI serving minorities and women-owned businesses across the South.',
   false, ARRAY['AL','TX','GA','FL','TN'], 500, 1000000, 550, 0, true, true,
   ARRAY['microloans','term_loan','sba_7a'], true, true, true, false, false, true),

  ('Kabbage (American Express)', 'online', 'https://kabbage.com',
   'Fast online lender. Lines of credit up to $250K based on business cash flow.',
   true, ARRAY['ALL'], 2000, 250000, 640, 1, false, false,
   ARRAY['line_of_credit'], false, false, false, false, false, true),

  ('Fundbox', 'online', 'https://fundbox.com',
   'Revolving line of credit for businesses with consistent invoicing or revenue.',
   true, ARRAY['ALL'], 1000, 150000, 600, 0, true, false,
   ARRAY['line_of_credit'], false, false, false, false, false, true),

  ('OnDeck Capital', 'online', 'https://ondeck.com',
   'Short-term loans and lines of credit. Fast funding, flexible qualification.',
   true, ARRAY['ALL'], 5000, 250000, 625, 1, false, false,
   ARRAY['term_loan','line_of_credit'], false, false, true, false, false, true),

  ('Bluevine', 'online', 'https://bluevine.com',
   'Business checking + lines of credit up to $250K. Revenue-based qualification.',
   true, ARRAY['ALL'], 6000, 250000, 625, 2, false, false,
   ARRAY['line_of_credit'], false, false, false, false, false, true),

  ('Credibly', 'online', 'https://credibly.com',
   'Revenue-based financing and working capital for businesses with challenged credit.',
   true, ARRAY['ALL'], 5000, 400000, 500, 0, true, true,
   ARRAY['revenue_based','term_loan'], false, false, false, false, false, true),

  ('National Community Investment Fund', 'cdfi', 'https://ncif.org',
   'CDFI focused on underserved communities and minority-owned enterprises.',
   true, ARRAY['ALL'], 50000, 5000000, 600, 1, false, false,
   ARRAY['term_loan','real_estate'], true, false, false, true, true, true),

  ('Heartland Capital Fund (Alabama)', 'cdfi', 'https://heartlandcapitalfund.org',
   'Alabama-based CDFI serving rural and underserved communities.',
   false, ARRAY['AL'], 5000, 250000, 560, 0, true, true,
   ARRAY['microloans','term_loan'], true, true, true, true, true, true),

  ('Wells Fargo Small Business', 'bank', 'https://wellsfargo.com/biz',
   'Traditional bank lending. Best for established businesses with strong credit.',
   true, ARRAY['ALL'], 10000, 5000000, 700, 2, false, false,
   ARRAY['sba_7a','term_loan','line_of_credit','equipment','real_estate'], false, false, false, false, false, true),

  ('Regions Bank (Alabama)', 'bank', 'https://regions.com/small-business',
   'Alabama-headquartered bank with strong SBA preferred lender status.',
   false, ARRAY['AL','TN','GA','FL','MS'], 25000, 5000000, 680, 2, false, false,
   ARRAY['sba_7a','sba_504','term_loan','real_estate','equipment'], false, false, true, true, false, true),

  ('PNC Bank Small Business', 'bank', 'https://pnc.com/small-business',
   'National bank with SBA preferred lender status and diverse loan programs.',
   true, ARRAY['ALL'], 20000, 5000000, 680, 2, false, false,
   ARRAY['sba_7a','sba_504','term_loan','line_of_credit'], false, false, false, false, false, true),

  ('Lendio (Marketplace)', 'online', 'https://lendio.com',
   'Loan marketplace that matches businesses to 75+ lenders with one application.',
   true, ARRAY['ALL'], 500, 5000000, 560, 0, true, true,
   ARRAY['term_loan','sba_7a','line_of_credit','equipment','microloans','revenue_based'], true, true, true, true, false, true),

  ('Nav (Credit + Lending Platform)', 'online', 'https://nav.com',
   'Business credit monitoring + lender matching platform. Great for building credit.',
   true, ARRAY['ALL'], 1000, 5000000, 500, 0, true, true,
   ARRAY['term_loan','line_of_credit','microloans','sba_7a'], false, false, false, false, false, true),

  ('Accion Opportunity Fund', 'cdfi', 'https://accionopportunityfund.org',
   'CDFI focused on underserved entrepreneurs. Offers coaching alongside capital.',
   true, ARRAY['ALL'], 5000, 250000, 575, 0, true, true,
   ARRAY['microloans','term_loan'], true, true, true, false, false, true);

-- ============================================================
-- SEED: GRANT DATABASE (Federal + Alabama)
-- ============================================================
INSERT INTO grants (name, grantor, grantor_type, source_url, description,
  min_award_amount, max_award_amount, is_recurring, eligible_states,
  eligible_business_types, available_to_tiers, is_active, last_verified_date)
VALUES
  ('SBA Small Business Innovation Research (SBIR)', 'U.S. Small Business Administration', 'federal',
   'https://sbir.gov', 'Federal R&D grants for small businesses developing innovative tech.',
   50000, 2000000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','S-Corp'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('SBA Small Business Technology Transfer (STTR)', 'U.S. Small Business Administration', 'federal',
   'https://sbir.gov/sttr', 'Similar to SBIR but requires university partnership.',
   50000, 2000000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','S-Corp'], ARRAY['capital_partner','done_for_you'], true, '2025-01-01'),

  ('USDA Rural Business Development Grant', 'USDA Rural Development', 'federal',
   'https://rd.usda.gov/programs-services/business-programs/rural-business-development-grants',
   10000, 500000, true, ARRAY['AL','TN','MS','GA'],
   ARRAY['LLC','Nonprofit','Corp','Sole Prop'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('USDA Value-Added Producer Grant', 'USDA Agricultural Marketing Service', 'federal',
   'https://ams.usda.gov/grants', 'For agricultural businesses adding value to products.',
   75000, 250000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','Sole Prop'], ARRAY['capital_partner','done_for_you'], true, '2025-01-01'),

  ('Alabama SBDC Business Boost Grant', 'Alabama SBDC / ADECA', 'state_alabama',
   'https://asbdc.org', 'Alabama state grants for small businesses via SBDC network.',
   2500, 25000, true, ARRAY['AL'],
   ARRAY['LLC','Corp','Sole Prop','S-Corp'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('Alabama Department of Commerce Rural Development Grant', 'Alabama Department of Commerce', 'state_alabama',
   'https://madeinalabama.com', 'Grants for rural Alabama businesses creating jobs.',
   10000, 100000, true, ARRAY['AL'],
   ARRAY['LLC','Corp','S-Corp'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('EDA Build to Scale Grant', 'U.S. Economic Development Administration', 'federal',
   'https://eda.gov/funding/programs/build-to-scale',
   'Federal grants for scaling entrepreneurial ecosystems and innovation.',
   500000, 3000000, true, ARRAY['ALL'],
   ARRAY['Nonprofit','LLC','Corp'], ARRAY['capital_partner','done_for_you'], true, '2025-01-01'),

  ('Minority Business Development Agency (MBDA) Grants', 'U.S. Dept of Commerce', 'federal',
   'https://mbda.gov', 'Grants and business center support for minority-owned businesses.',
   5000, 200000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','Sole Prop','S-Corp'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('Amber Grant for Women', 'WomensNet', 'foundation',
   'https://ambergrantsforwomen.com', 'Monthly $10K grant for women-owned businesses.',
   10000, 10000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','Sole Prop','S-Corp','Nonprofit'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('FedEx Small Business Grant', 'FedEx', 'corporate',
   'https://smallbusiness.fedex.com/grant', 'Annual grant contest for small businesses. Up to $50K.',
   15000, 50000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','Sole Prop'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('Halstead Grant (Jewelry/Handmade)', 'Halstead', 'corporate',
   'https://halsteadbead.com/halstead-grant', 'Annual grant for small jewelry/handmade businesses.',
   7500, 7500, true, ARRAY['ALL'],
   ARRAY['LLC','Sole Prop'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('NASE Growth Grant', 'National Association for the Self-Employed', 'foundation',
   'https://nase.org/benefits/business-grants', 'Quarterly grants for self-employed and microbusiness owners.',
   4000, 4000, true, ARRAY['ALL'],
   ARRAY['Sole Prop','LLC'], ARRAY['starter','growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('IFundWomen General Grant', 'IFundWomen', 'foundation',
   'https://ifundwomen.com', 'Grants and coaching for women entrepreneurs.',
   500, 10000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','Sole Prop'], ARRAY['growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('Hello Alice Small Business Grant', 'Hello Alice', 'foundation',
   'https://helloalice.com/grants', 'Rotating grant opportunities for diverse small business owners.',
   1000, 50000, true, ARRAY['ALL'],
   ARRAY['LLC','Corp','Sole Prop','S-Corp'], ARRAY['starter','growth','capital_partner','done_for_you'], true, '2025-01-01'),

  ('Community Development Block Grant (CDBG)', 'U.S. HUD / State of Alabama', 'federal',
   'https://hud.gov/program_offices/comm_planning/cdbg', 'Block grants for community economic development.',
   25000, 750000, true, ARRAY['AL'],
   ARRAY['Nonprofit','LLC'], ARRAY['capital_partner','done_for_you'], true, '2025-01-01');

-- ============================================================
-- SEED: SIGNATURE DOCUMENTS
-- ============================================================
INSERT INTO signature_documents
  (document_type, document_version, document_title, document_html, document_text_hash,
   required_for_tiers, is_active)
VALUES
  ('consulting_agreement', 'v1.0',
   'Business Consulting & Capital Advisory Agreement',
   '<p>See full agreement text in CosbyCapital_Consulting_Agreement_TOS.docx</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['starter','growth','capital_partner','done_for_you'], true),

  ('croa_credit_repair', 'v1.0',
   'Credit Repair Services Agreement (CROA Compliant)',
   '<p>CROA compliant credit repair agreement — build full text per CROA requirements</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['done_for_you'], true),

  ('grant_writing_service', 'v1.0',
   'Grant Writing Service Authorization',
   '<p>Authorization to research, draft, and prepare grant applications on client behalf</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['growth','capital_partner','done_for_you'], true),

  ('grant_submission_auth', 'v1.0',
   'Grant Submission Authorization',
   '<p>One-time authorization to submit a specific grant application to grantor on client behalf</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['growth','capital_partner','done_for_you'], true),

  ('lender_intro_auth', 'v1.0',
   'Lender Introduction Authorization',
   '<p>One-time authorization to introduce client to a specific lender on their behalf</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['growth','capital_partner','done_for_you'], true),

  ('success_fee_acknowledgment', 'v1.0',
   'Success Fee Acknowledgment & Payment Authorization',
   '<p>Acknowledgment of consulting performance fee due upon confirmed funding receipt</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['growth','capital_partner','done_for_you'], true),

  ('report_release_auth', 'v1.0',
   'Monthly Report Release Authorization',
   '<p>Authorization to receive monthly capital progress reports from Cosby Capital</p>',
   'PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256',
   ARRAY['starter','growth','capital_partner','done_for_you'], true);
