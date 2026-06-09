---
phase: 3
plan: 4
subsystem: agents
tags: [agent, lender-matching, claude, cron, email, ftc-disclosure, compliance, security]
dependency_graph:
  requires: [03-01]
  provides: [capital-lender-matcher agent]
  affects: [lender_matches table, compliance_log, agent_logs, agent_emails, agent_trigger_queue]
tech_stack:
  added: [node-cron, zod, @anthropic-ai/sdk, resend, @supabase/supabase-js]
  patterns: [circuit-breaker, trigger-queue-polling, upsert-on-conflict, ftc-disclosure, s10-002-sanitize, s14-002-scan]
key_files:
  created:
    - agents/capital-lender-matcher/package.json
    - agents/capital-lender-matcher/score.js
    - agents/capital-lender-matcher/match-reasons.js
    - agents/capital-lender-matcher/index.js
  modified: []
decisions:
  - score threshold set to 40 matching DB function contract
  - top 5 lenders shown in email body, top 10 used for Claude match-reason generation
  - match_reasons stored as array per lender_matches row
  - FTC disclosure paragraph embedded directly in email body (not footer) per legal requirement
  - compliance_log.contained_loan_terms hardcoded false after every send (zero-tolerance invariant)
metrics:
  completed: "2026-06-09"
  tasks: 5
  files: 4
---

# Phase 3 Plan 4: Agent 5 capital-lender-matcher Summary

## One-liner

Node.js agent scores active lenders via `score_lender_match()` RPC, generates Claude match reasons with absolute zero loan-term output policy, and emails FTC-compliant lender match notifications on new signup and Monday 6am UTC.

## What Was Built

### agents/capital-lender-matcher/score.js
Fetches all `is_active = true` lenders, calls `score_lender_match(p_client_id, p_lender_id)` RPC for each, filters to score >= 40, and returns sorted descending. Per-lender score errors are logged and skipped without aborting the run.

### agents/capital-lender-matcher/match-reasons.js
- Wraps all client data in `sanitizeForPrompt()` (S10-002) before Claude call
- System prompt contains 5 explicit prohibitions: no rates, APR, points, loan terms, payment schedules
- `scanOutputConfidentiality()` called on every Claude response (S14-002)
- If flags found: `sendAlert()` to Telegram + error logged + `Error` thrown — output never stored or sent
- Circuit breaker (threshold=3, reset=120s) wraps Claude API calls
- Parses JSON array `[{lender_name, reason}]` from response, returns empty array on parse failure

### agents/capital-lender-matcher/index.js
- Zod schema validates all 20 client fields before processing
- Guards: `subscription_status = 'active'` AND `onboarding_completed = true`
- Upserts `lender_matches` with `onConflict: 'client_id,lender_id'` — no duplicates
- Updates `match_reasons` array per lender after Claude generation
- Email includes FTC affiliate disclosure + "research only / no loan terms negotiated" disclaimer
- Subject: "Your funding matches are ready — N sources found"
- `logAndSend()` called with `requiresClientApproval: false` (immediate send)
- `compliance_log` row inserted with `contained_loan_terms: false` after every email
- `agent_logs` row inserted on every run (matches count, trigger type, duration)
- `cron.schedule('0 6 * * 1', runAllClients)` — Monday 6am UTC for all active clients
- `cron.schedule('*/5 * * * *', processTriggerQueue)` — trigger queue poll
- Startup trigger queue poll runs immediately on process start
- Trigger queue: processing → done on success; retry_count++ → failed after 3 retries

### agents/capital-lender-matcher/package.json
Standard agent package with `@anthropic-ai/sdk`, `@supabase/supabase-js`, `node-cron`, `resend`, `zod`.

## Security Controls Verified

| Control | Implementation |
|---------|----------------|
| S10-002 sanitizeForPrompt | All 6 client fields wrapped before Claude call |
| S14-002 scanOutputConfidentiality | Called on every Claude response; abort+alert if flags |
| Zero loan terms in system prompt | 5 explicit prohibitions in system prompt |
| FTC affiliate disclosure | Embedded in bodyHtml on every lender match email |
| Disclaimer | "Research and introduction service only. We do not negotiate loan terms." |
| Zod validation | ClientSchema.parse() on every client before processing |
| Subscription guard | subscription_status=active AND onboarding_completed=true checked |
| Upsert deduplication | onConflict: 'client_id,lender_id' on all lender_matches upserts |
| Compliance log | contained_loan_terms: false written after every send |
| Circuit breaker | threshold=3, resetTimeoutMs=120000 on Claude API |

## Success Criteria Verification

1. Agent polls trigger queue every 5 minutes — `cron.schedule('*/5 * * * *', ...)` + startup poll
2. Monday 6am UTC cron runs all active clients — `cron.schedule('0 6 * * 1', runAllClients)`
3. Zero loan terms in Claude output — scanOutputConfidentiality + abort + Telegram if detected
4. FTC disclosure in every email — embedded in bodyHtml before logAndSend
5. compliance_log.contained_loan_terms = false after every send
6. Upsert onConflict client_id,lender_id — no duplicates
7. Trigger queue entries marked done after successful run

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced beyond what the plan specified.

## Self-Check: PASSED

- agents/capital-lender-matcher/package.json — present in git HEAD (541e1fa ancestry)
- agents/capital-lender-matcher/score.js — present in git HEAD
- agents/capital-lender-matcher/match-reasons.js — present in git HEAD
- agents/capital-lender-matcher/index.js — present in git HEAD
- All four files confirmed via `git ls-files agents/capital-lender-matcher/`
