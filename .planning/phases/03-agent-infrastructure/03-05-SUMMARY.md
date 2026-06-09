---
phase: 3
plan: 5
subsystem: agents
tags: [credit-coach, claude, cron, zod, compliance, educational]
dependency_graph:
  requires: [03-01]
  provides: [capital-credit-coach agent]
  affects: [credit_roadmaps, agent_logs, agent_emails, compliance_log, agent_trigger_queue]
tech_stack:
  added: [node-cron, zod]
  patterns: [trigger-queue-poll, circuit-breaker, idempotency-check, compliance-log]
key_files:
  created:
    - agents/capital-credit-coach/package.json
    - agents/capital-credit-coach/roadmap.js
    - agents/capital-credit-coach/index.js
  modified: []
decisions:
  - "Agent fires on signup only via agent_trigger_queue — no weekly cron (credit roadmaps are one-time onboarding deliverables)"
  - "Idempotency: query credit_roadmaps before generating — skip if record exists for client_id"
  - "S14-002 scan happens before DB save — if loan terms detected, Telegram alert + throw (never persisted)"
  - "compliance_log insert is non-fatal (catch + warn) to not block email delivery on log failures"
metrics:
  duration: ~10min
  completed: 2026-06-09
  tasks_completed: 5
  files_created: 3
---

# Phase 3 Plan 5: Agent 8 capital-credit-coach Summary

## One-liner

Signup-triggered educational credit roadmap agent using Claude with 580/600/625/650/700 lender-tier thresholds, full S10-002/S14-002 compliance, and circuit breaker protection.

## What Was Built

Three files comprising the `capital-credit-coach` agent service:

**`agents/capital-credit-coach/package.json`** — Service manifest with pinned dependencies: `@anthropic-ai/sdk@0.24.3`, `node-cron@3.0.3`, `zod@3.22.4`, `resend@2.1.0`, `@supabase/supabase-js@2.39.3`.

**`agents/capital-credit-coach/roadmap.js`** — Claude integration layer:
- `sanitizeForPrompt()` on all six client fields (S10-002)
- `scanOutputConfidentiality()` on all Claude output before parsing (S14-002) — throws + sends Telegram alert if loan terms detected
- `CircuitBreaker` with threshold=3, resetTimeout=120s wraps every Claude call
- System prompt enforces EDUCATIONAL ONLY, no rates/APR/guarantees
- User prompt injects lender unlock thresholds (580/600/625/650/700) from `SCORE_THRESHOLDS` constant
- Requests 6-step JSON roadmap with `current_score_context`, `target_score`, `estimated_timeline_months`, `steps[]`, `quick_wins[]`
- JSON extraction via regex match on `{...}` to handle any surrounding text

**`agents/capital-credit-coach/index.js`** — Main entry point:
- Zod `ClientSchema` validates all client fields before use
- `runForClient()`: fetches client, validates paid+active tier, checks onboarding_completed, idempotency check against `credit_roadmaps`, generates roadmap, saves to DB (`steps` as jsonb, `agent_summary` = `current_score_context`), sends email via `logAndSend()`, inserts compliance_log, inserts agent_logs
- `processTriggerQueue()`: polls `agent_trigger_queue` WHERE `agent_name = 'capital-credit-coach'` AND `status = 'pending'`, processes up to 10 at a time, marks `processing` → `done`/`failed`, retries up to 3 times on error
- `node-cron` schedule: `*/5 * * * *` (every 5 minutes)
- Startup poll runs immediately on process start

## Task 4: onboarding/complete verification

`src/app/api/onboarding/complete/route.ts` already includes agent 8 in the `agentTriggers` array (`[1, 5, 8]`). No change needed. Plan 03-03 handles `agent_trigger_queue` wiring.

## Security Compliance

| Rule | Implementation |
|------|----------------|
| S10-002 | `sanitizeForPrompt()` on all 6 client fields before prompt assembly |
| S14-002 | `scanOutputConfidentiality()` on raw Claude text — abort + Telegram alert if flags |
| ABSOLUTE ZERO | System prompt explicitly prohibits rates/APR/points; output scan catches any leakage |
| Educational disclaimer | Included in every email body (italic footer paragraph) |
| Idempotency | Checks `credit_roadmaps` for existing `client_id` record before generation |
| Compliance log | Every sent email logged to `compliance_log` with `contained_loan_terms: false` |

## Email

- Subject: `Your Business Credit Roadmap is ready`
- Includes: score context, first step preview, quick wins list, CTA button to `/dashboard/credit`
- Disclaimer: "These are educational recommendations. Cosby Capital does not take action on your behalf for credit repair. For credit repair services, consult a licensed credit counselor."
- `requiresClientApproval: false` — sends immediately via Resend

## Deviations from Plan

None — plan executed exactly as written. The `.catch(() => null)` pattern for the idempotency query was used instead of `.catch(() => ({ data: null }))` to match Promise chaining style (functionally equivalent).

## Known Stubs

None — all data flows are wired to live Supabase tables and the Claude API. No placeholder or hardcoded values in the output path.

## Threat Flags

None — this agent introduces no new network endpoints. It is a background Node.js service that reads from `agent_trigger_queue` and writes to `credit_roadmaps`, `agent_emails`, `compliance_log`, and `agent_logs`. All trust boundaries are internal Supabase service_role operations.

## Self-Check

- [x] `agents/capital-credit-coach/package.json` exists
- [x] `agents/capital-credit-coach/roadmap.js` exists
- [x] `agents/capital-credit-coach/index.js` exists
- [x] Commit `541e1fa` exists: `feat(03-05): Agent 8 capital-credit-coach...`
