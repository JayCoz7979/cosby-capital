---
id: 03-01
phase: 3
plan: 1
status: complete
completed_at: 2026-06-09
commit: bcd334a
---
# Summary: Plan 03-01 — Shared Agent Utilities

## What Was Built

- `agents/package.json` — workspace root with `capital-*` workspaces glob, node >=20 engine pin
- `agents/.gitignore` — excludes node_modules, .env files, dist
- `agents/lib/sanitize.js` — `sanitizeForPrompt()` + `scanOutputConfidentiality()` (S10-002, S14-002)
- `agents/lib/logger.js` — `sanitizeForLog()` + structured JSON logger (S10-001)
- `agents/lib/circuit-breaker.js` — CircuitBreaker class (closed/open/half-open states, configurable threshold + timeout)
- `agents/lib/telegram.js` — HMAC-SHA256 signed Telegram alerts via TELEGRAM_SIGNING_SECRET
- `agents/lib/anthropic.js` — Anthropic client, model pinned to `claude-sonnet-4-6`, baseURL locked to `https://api.anthropic.com`
- `agents/lib/supabase.js` — service_role Supabase client using SUPABASE_SERVICE_KEY (never anon key)
- `agents/lib/email.js` — Resend wrapper: logs to `agent_emails` BEFORE sending, appends mandatory footer
- `supabase/migrations/20240101000010_agent_tables.sql` — 4 tables with RLS: `agent_emails`, `compliance_log`, `platform_health_log`, `agent_trigger_queue`

## Security Requirements Met

- [x] sanitizeForPrompt() wraps all user data in `<user_content>...</user_content>` XML delimiters (S10-002)
- [x] scanOutputConfidentiality() detects loan term patterns (APR, interest rate, points, %) + SSN + EIN + credit score (S14-002)
- [x] sanitizeForLog() redacts SSN, EIN, card numbers (13-19 digits), Anthropic API keys, JWTs from all log output (S10-001)
- [x] All 4 migration tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (S11-012)
- [x] anthropic.js hardcodes baseURL = 'https://api.anthropic.com' (endpoint lock)
- [x] anthropic.js pins model to 'claude-sonnet-4-6' — never 'latest'
- [x] supabase.js uses SUPABASE_SERVICE_KEY (service_role), not anon key; autoRefreshToken + persistSession disabled
- [x] telegram.js HMAC-signs every payload with TELEGRAM_SIGNING_SECRET before sending
- [x] email.js inserts to agent_emails table BEFORE calling Resend API (log-first rule)
- [x] compliance_log RLS policy `USING (false)` — service_role only, clients cannot read audit log
- [x] agent_trigger_queue RLS policy `USING (false)` — system-internal, no client access
- [x] idx_trigger_queue_pending partial index on (agent_name, status) WHERE status = 'pending'

## Migration Tables Created

| Table | RLS | Policy | Notes |
|---|---|---|---|
| agent_emails | enabled | clients read own via user_id | approval queue for agent emails |
| compliance_log | enabled | service_role only (USING false) | tracks contained_loan_terms boolean |
| platform_health_log | enabled | service_role only (USING false) | written by Agent 14 |
| agent_trigger_queue | enabled | service_role only (USING false) | polled every 5 min by agents; partial index on pending |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] agents/package.json exists
- [x] agents/.gitignore exists
- [x] agents/lib/sanitize.js exists
- [x] agents/lib/logger.js exists
- [x] agents/lib/circuit-breaker.js exists
- [x] agents/lib/telegram.js exists
- [x] agents/lib/anthropic.js exists
- [x] agents/lib/supabase.js exists
- [x] agents/lib/email.js exists
- [x] supabase/migrations/20240101000010_agent_tables.sql exists
- [x] Commit bcd334a exists with all 10 files
