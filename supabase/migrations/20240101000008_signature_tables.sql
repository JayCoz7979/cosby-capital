-- Migration: 20240101000008_signature_tables
-- Creates the signatures table with immutable rules (no UPDATE, no DELETE).
-- Legal basis: E-SIGN Act (15 U.S.C. § 7001) and Alabama UETA.

CREATE TABLE signatures (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  client_id uuid references clients(id) not null,
  document_type text not null check (document_type in (
    'consulting_agreement',
    'grant_writing_auth',
    'grant_submission_auth',
    'lender_intro_auth',
    'success_fee_acknowledgment',
    'monthly_report_auth',
    'croa_agreement'
  )),
  document_version text not null default 'v1.0',
  -- Signed by info
  signed_by_name text not null,
  signed_by_email text not null,
  signed_at timestamptz not null, -- set server-side only — never client-supplied
  -- Audit trail
  signed_ip text,
  signed_user_agent text,
  device_fingerprint_hash text,
  document_hash text not null,    -- SHA-256 of document text
  audit_hash text not null,       -- SHA-256 of (document_hash + signed_by_name + signed_at + signed_ip)
  document_text_snapshot text not null, -- full document text at time of signing
  -- Storage confirmation
  supabase_path text,
  s3_path text,
  google_drive_file_id text,
  storage_verified boolean default false,
  -- Email delivery
  client_email_sent boolean default false,
  admin_email_sent boolean default false
);

ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Clients can read their own signatures
CREATE POLICY "sig_own_read" ON signatures FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- Only the service role may insert (API route calls edge function which uses service_role)
CREATE POLICY "sig_service_write" ON signatures FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Immutable: prevent any tampering with executed signature records
-- (E-SIGN Act compliance — audit trail must remain intact)
CREATE RULE no_update_signatures AS ON UPDATE TO signatures DO INSTEAD NOTHING;
CREATE RULE no_delete_signatures AS ON DELETE TO signatures DO INSTEAD NOTHING;

-- Index for efficient client lookups
CREATE INDEX idx_signatures_client_id ON signatures(client_id);
CREATE INDEX idx_signatures_created_at ON signatures(created_at DESC);
