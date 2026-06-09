---
phase: 01
plan: 03
subsystem: database
tags: [supabase, migrations, rls, security, schema]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [supabase-schema, rls-policies, security-tables, stripe-idempotency, audit-log]
  affects: [all-subsequent-phases]
tech_stack:
  added: [supabase-migrations, pgsodium, pg_cron, pg_trgm]
  patterns: [rls-per-table, immutable-audit-trigger, honeypot-columns, service-role-isolation]
key_files:
  created:
    - supabase/config.toml
    - supabase/migrations/20240101000001_initial_schema.sql
    - supabase/migrations/20240101000002_rls_policies.sql
    - supabase/migrations/20240101000003_security_tables.sql
    - supabase/migrations/20240101000004_extensions_and_functions.sql
  modified: []
decisions:
  - S11-012 enforced: every CREATE TABLE immediately followed by ALTER TABLE ... ENABLE ROW LEVEL SECURITY in same file
  - agent_logs and capital_leads use USING(false) — service_role bypasses RLS, no authenticated user access
  - anthropic_model pinned to claude-sonnet-4-6 in platform_settings seed (never 'latest')
  - admin_audit_log uses two-layer immutability: trigger BEFORE UPDATE/DELETE + REVOKE at role level
  - compliance_log table from source schema omitted (no RLS pattern defined); deferred to admin-facing phase
metrics:
  duration: 25 minutes
  completed: "2026-06-09"
  tasks_completed: 6
  files_created: 5
---

# Phase 01 Plan 03: Supabase Migrations — Full Schema + Security Tables Summary

**One-liner:** Four-migration Supabase stack — 16 source tables + 8 security tables, all with RLS enabled, immutable audit log, Stripe idempotency, and pgsodium/pg_cron with GAP-216 cron REVOKE.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 2 | supabase/config.toml | 971b27c |
| 3 | Migration 001 — initial schema (16 tables + seeds + functions) | f23d9db |
| 4 | Migration 002 — RLS policies for all 16 tables | 8fb3677 |
| 5 | Migration 003 — 8 security tables with RLS + immutable trigger | ae03789 |
| 6 | Migration 004 — extensions, cron REVOKE, honeypot columns | e6a4d5d |

## Migration Inventory

### Migration 001 — Initial Schema
Tables (each with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE`):
- clients, lenders, grants, lender_matches, grant_matches
- applications, credit_roadmaps, opportunity_digests
- agent_logs, capital_leads, success_fee_tiers
- consulting_agreements, signature_documents, signature_requests
- signatures, client_documents

Functions: score_lender_match, score_grant_match, calculate_success_fee, get_pending_signatures, get_client_documents, update_updated_at

Seeds: 20 lenders (Alabama + national), 15 grants (federal + Alabama), 8 fee tiers, 7 signature document templates

### Migration 002 — RLS Policies
Policy pattern per table:
- clients: `auth.uid() = user_id` (full CRUD)
- lenders, grants, success_fee_tiers, signature_documents: public SELECT (`USING (true)`)
- lender_matches, grant_matches, applications, credit_roadmaps, opportunity_digests, consulting_agreements, signature_requests: `client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())`
- signatures, client_documents: SELECT-only for client (no client INSERT/UPDATE/DELETE)
- agent_logs, capital_leads: `USING (false)` — service_role only

### Migration 003 — Security Tables
| Table | Purpose | Key Constraint |
|-------|---------|----------------|
| trusted_devices | Device fingerprint login | expires_at 90-day default |
| processed_webhook_events | Stripe idempotency | stripe_event_id UNIQUE NOT NULL |
| active_sessions | Concurrent session detection | expires_at NOT NULL |
| deletion_requests | CCPA erasure requests | status CHECK constraint |
| exploit_chains | Security registry | chain_id UNIQUE, severity CHECK |
| admin_audit_log | Immutable audit trail | Trigger blocks UPDATE/DELETE |
| platform_settings | Model pins + Stripe IDs | anthropic_model = claude-sonnet-4-6 |
| api_keys | External API key management | expires_at + allowed_scopes[] |

### Migration 004 — Extensions and Security Functions
- Extensions: pgsodium (PII encryption), pg_cron (scheduled jobs)
- GAP-216: `REVOKE ALL ON SCHEMA cron FROM authenticated`
- GAP-216: `REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM authenticated`
- S8-005: `_t timestamptz` and `_honeypot text` columns on grants and lenders
- Belt-and-suspenders: `REVOKE DELETE, UPDATE ON admin_audit_log FROM authenticated`

## Security Requirements Satisfied

| Requirement | Status | Location |
|-------------|--------|----------|
| S11-012 — RLS in same file as CREATE TABLE | Satisfied | All 4 migrations |
| S6-001 — Stripe idempotency | Satisfied | Migration 003, stripe_event_id UNIQUE NOT NULL |
| S8-003 — Immutable audit log | Satisfied | Migration 003, trigger + REVOKE |
| S8-005 — Honeypot columns | Satisfied | Migration 004, _t + _honeypot |
| S8-006 — api_keys expires_at + scopes | Satisfied | Migration 003 |
| S9-010 — CCPA deletion requests | Satisfied | Migration 003 |
| S13-004 — Exploit chain registry | Satisfied | Migration 003 |
| S15-012 — platform_settings model pin | Satisfied | Migration 003, claude-sonnet-4-6 |
| GAP-216 — REVOKE cron FROM authenticated | Satisfied | Migration 004 |
| GAP-256 — active_sessions table | Satisfied | Migration 003 |
| A14 — pgsodium extension | Satisfied | Migration 004 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] compliance_log table RLS**
- **Found during:** Task 3 (writing migration 001)
- **Issue:** Source schema defines `compliance_log` table without any RLS policy or `ENABLE ROW LEVEL SECURITY` statement. Including it in migration 001 without RLS would violate S11-012.
- **Fix:** compliance_log excluded from migration 001. Added to deferred-items for admin-facing phase where service_role access pattern is defined. All other source tables included.
- **Files modified:** N/A (exclusion, not addition)

## Known Stubs

- `platform_settings` Stripe price ID values seeded as empty strings (`''`). These must be updated with real Stripe price IDs before subscription flows can function. This is intentional — IDs are environment-specific and will be set via the admin panel or env vars in a later plan.
- `signature_documents` html and hash values contain `PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256`. Legal copy integration is tracked in the legal/compliance phase.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: service_role_isolation | migrations/20240101000002_rls_policies.sql | agent_logs and capital_leads use USING(false) — any service_role key leak grants full table access; key rotation schedule in platform_settings mitigates |
| threat_flag: pgsodium_key_management | migrations/20240101000004_extensions_and_functions.sql | pgsodium extension added but key derivation setup (pgsodium.create_key) not yet configured — PII columns will not be encrypted until key material is provisioned |

## Self-Check

### Files exist:
- supabase/config.toml: FOUND
- supabase/migrations/20240101000001_initial_schema.sql: FOUND
- supabase/migrations/20240101000002_rls_policies.sql: FOUND
- supabase/migrations/20240101000003_security_tables.sql: FOUND
- supabase/migrations/20240101000004_extensions_and_functions.sql: FOUND

### Commits exist:
- 971b27c: FOUND
- f23d9db: FOUND
- 8fb3677: FOUND
- ae03789: FOUND
- e6a4d5d: FOUND

## Self-Check: PASSED
