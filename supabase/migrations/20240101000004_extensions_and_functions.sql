-- ============================================================
-- MIGRATION 004: EXTENSIONS AND SECURITY FUNCTIONS
-- GAP-216: REVOKE cron from authenticated role
-- A14: pgsodium for PII field encryption
-- S8-005: Honeypot columns on grants/lenders
-- ============================================================

-- Extensions (uuid-ossp and pg_trgm already in migration 001;
-- pgsodium and pg_cron added here as security extensions)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- GAP-216: REVOKE cron access from authenticated role
-- Prevents authenticated users from scheduling/viewing cron jobs
-- ============================================================
REVOKE ALL ON SCHEMA cron FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM authenticated;

-- ============================================================
-- S8-005: Honeypot columns on grants and lenders
-- _t (timestamptz) and _honeypot (text) for canary trap detection
-- ============================================================
ALTER TABLE grants ADD COLUMN IF NOT EXISTS _t timestamptz DEFAULT now();
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS _t timestamptz DEFAULT now();
ALTER TABLE grants ADD COLUMN IF NOT EXISTS _honeypot text DEFAULT NULL;
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS _honeypot text DEFAULT NULL;

-- ============================================================
-- Belt-and-suspenders: REVOKE DELETE/UPDATE on admin_audit_log
-- at the role level (trigger in migration 003 is the first layer)
-- ============================================================
REVOKE DELETE ON admin_audit_log FROM authenticated;
REVOKE UPDATE ON admin_audit_log FROM authenticated;
