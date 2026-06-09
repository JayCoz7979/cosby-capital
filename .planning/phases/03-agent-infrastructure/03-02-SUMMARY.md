---
phase: 3
plan: 2
subsystem: agents
tags: [healthcheck, monitoring, cron, telegram, supabase, anthropic]
dependency_graph:
  requires: [03-01]
  provides: [platform-health-monitoring]
  affects: [platform_health_log, agent_logs]
tech_stack:
  added: [node-cron@3.0.3]
  patterns: [cron-scheduling, Promise.allSettled, graceful-catch]
key_files:
  created:
    - agents/capital-healthcheck/package.json
    - agents/capital-healthcheck/index.js
    - agents/capital-healthcheck/checks/supabase.js
    - agents/capital-healthcheck/checks/services.js
    - agents/capital-healthcheck/checks/agents.js
  modified: []
decisions:
  - Anthropic API health check uses POST with empty messages array — 400 means reachable/auth valid, 401 means key invalid
  - get_tables_without_rls RPC wrapped in .catch(() => ({ data: null })) since the DB function may not exist yet
  - Promise.allSettled used so one failing check never blocks others from running
  - Daily 5am UTC report runs independently from the 15-min health check cron
metrics:
  duration: "~10 minutes"
  completed: "2026-06-09"
  tasks_completed: 6
  files_created: 5
---

# Phase 3 Plan 2: Agent 14 capital-healthcheck Summary

**One-liner:** node-cron health monitor running every 15min + daily 5am UTC Telegram report, covering Supabase connectivity, RLS audit, Anthropic API, email queue, env vars, and agent last-run staleness.

## What Was Built

`agents/capital-healthcheck/` is a standalone Node.js service (no HTTP server) that:

1. **Runs every 15 minutes** via `node-cron '*/15 * * * *'` — executes all checks in parallel via `Promise.allSettled`, writes every result to `platform_health_log`, and sends a HMAC-signed Telegram alert if any check is `fail` or `critical`.
2. **Runs a daily report at 5am UTC** — queries `platform_health_log` for the past 24h of non-OK events, fetches total client count, and sends a Telegram summary.
3. **Runs once on startup** — so Railway deploy gives immediate health signal.

### Checks implemented

| Check | File | Trigger |
|---|---|---|
| `supabase_connectivity` | checks/supabase.js | DB ping via `platform_settings` |
| `rls_audit` | checks/supabase.js | `get_tables_without_rls` RPC (gracefully skipped if missing) |
| `stale_signatures` | checks/supabase.js | `signature_requests` pending > 5 days |
| `suspended_invoices` | checks/supabase.js | `fee_invoices` suspended + unpaid |
| `anthropic_api` | checks/services.js | POST to /v1/messages — 400=up, 401=key issue |
| `email_queue` | checks/services.js | `agent_emails` unsent + no approval required + >1h old |
| `env_vars` | checks/services.js | 8 required vars present check |
| `agent_capital-grant-finder` | checks/agents.js | last `agent_logs` run within 10.5 days |
| `agent_capital-lender-matcher` | checks/agents.js | last `agent_logs` run within 10.5 days |
| `agent_capital-credit-coach` | checks/agents.js | last `agent_logs` run within 10.5 days |

## Commits

| Hash | Message |
|---|---|
| c811c78 | feat(03-02): Agent 14 capital-healthcheck — every 15min + daily 5am Telegram report |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- agents/capital-healthcheck/package.json — FOUND
- agents/capital-healthcheck/index.js — FOUND
- agents/capital-healthcheck/checks/supabase.js — FOUND
- agents/capital-healthcheck/checks/services.js — FOUND
- agents/capital-healthcheck/checks/agents.js — FOUND
- Commit c811c78 — FOUND
