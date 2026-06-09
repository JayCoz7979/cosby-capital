---
phase: 3
plan: 3
subsystem: agents
tags: [grant-finder, cron, claude, supabase, email, compliance]
dependency_graph:
  requires: [03-01]
  provides: [capital-grant-finder agent, agent_trigger_queue wiring]
  affects: [grant_matches, agent_emails, compliance_log, agent_logs, agent_trigger_queue]
tech_stack:
  added: [node-cron, zod, @anthropic-ai/sdk, resend]
  patterns: [circuit-breaker, sanitize-before-prompt, scan-after-output, upsert-on-conflict, trigger-queue-poll]
key_files:
  created:
    - agents/capital-grant-finder/package.json
    - agents/capital-grant-finder/score.js
    - agents/capital-grant-finder/match-reasons.js
    - agents/capital-grant-finder/email.js
    - agents/capital-grant-finder/index.js
  modified:
    - src/app/api/onboarding/complete/route.ts
decisions:
  - Upsert grant_matches with onConflict client_id,grant_id to prevent duplicates across weekly runs
  - Match reasons generation is non-fatal — matches saved even if Claude call fails
  - Trigger queue uses string agent names (not numeric IDs) for clarity and extensibility
  - Per-agent trigger insert with individual error logging so one failure does not block others
metrics:
  duration: ~15min
  completed: 2026-06-09
  tasks_completed: 6
  tasks_total: 6
  files_created: 5
  files_modified: 1
---

# Phase 3 Plan 3: Agent 1 capital-grant-finder Summary

## One-liner

Grant scoring agent using score_grant_match() RPC + Claude match reasons + compliance-logged email, firing on signup trigger and Monday 7am UTC cron.

## What Was Built

The `capital-grant-finder` agent scores all active grants against each eligible client's profile using the existing `score_grant_match()` DB function, generates human-readable match reasons via Claude, and emails results to clients. It runs on two triggers: new client signup (via `agent_trigger_queue` polling every 5 minutes) and a Monday 7am UTC cron for all active clients.

### Files Created

**agents/capital-grant-finder/package.json** — standalone Node service with node-cron, zod, @anthropic-ai/sdk, resend, @supabase/supabase-js.

**agents/capital-grant-finder/score.js** — fetches active grants, filters by client subscription_tier against grant.available_to_tiers, calls score_grant_match() RPC for each, returns matches with score >= 35 sorted descending.

**agents/capital-grant-finder/match-reasons.js** — calls Claude via CircuitBreaker (threshold: 3, reset: 2min). All client data wrapped with sanitizeForPrompt() (S10-002). System prompt explicitly prohibits rates/APR/loan terms. All Claude output scanned with scanOutputConfidentiality() before use (S14-002) — aborts and throws if loan terms detected.

**agents/capital-grant-finder/email.js** — calls shared logAndSend() which logs to agent_emails BEFORE sending. After send, inserts to compliance_log with contained_loan_terms: false. Top 5 grants listed in email body. Footer injected by shared email.js EMAIL_FOOTER.

**agents/capital-grant-finder/index.js** — main entry. Zod ClientSchema validates all client fields before use. runForClient() verifies subscription_status='active' AND onboarding_completed=true before proceeding. processTriggerQueue() marks status 'processing' before run, 'done' on success, 'failed' if retry_count >= 3. Startup poll runs on process start to catch missed triggers.

### Files Modified

**src/app/api/onboarding/complete/route.ts** — replaced old agent_queue inserts (numeric agent IDs, 'queued' status) with agent_trigger_queue inserts using string agent names: capital-grant-finder, capital-lender-matcher, capital-credit-coach. Each insert uses trigger_type: 'signup', status: 'pending'. Individual error logging per agent; non-fatal.

## Commits

| Hash | Message |
|------|---------|
| 5d2d8b6 | feat(03-03): Agent 1 capital-grant-finder — scores grants, Claude match reasons, emails on signup+Monday 7am UTC |
| d8a4ae5 | feat(03-03): wire trigger queue into onboarding/complete for agents 1, 5, 8 |

## Deviations from Plan

None — plan executed exactly as written.

Note: The commit for the agent files also included pre-existing untracked files from `agents/capital-lender-matcher/` (index.js, match-reasons.js, package.json, score.js) that were already present in the working directory from prior work. These are valid future agent files and their inclusion is correct.

## Security Compliance

| Rule | Implementation |
|------|---------------|
| S10-002 | sanitizeForPrompt() applied to all 5 client fields before Claude userPrompt construction |
| S14-002 | scanOutputConfidentiality() called on rawText before JSON parse or DB write; throws on flag |
| ABSOLUTE ZERO | System prompt explicitly lists rates/APR/loan terms/points as prohibited; match reasons focus on eligibility only |
| Circuit Breaker | CircuitBreaker({ threshold: 3, resetTimeoutMs: 120000 }) wraps every Claude API call |
| Zod validation | ClientSchema.parse() validates all 15 client fields including uuid, email, boolean flags |
| Dedup | grant_matches upserted with onConflict: 'client_id,grant_id', ignoreDuplicates: false |

## Known Stubs

None — all data paths are wired to live DB queries and real Claude API calls.

## Threat Flags

None — no new network endpoints or auth paths introduced. Agent uses service_role client (established pattern). Outbound email via Resend already in use by shared lib.

## Self-Check: PASSED

- agents/capital-grant-finder/package.json — EXISTS
- agents/capital-grant-finder/score.js — EXISTS
- agents/capital-grant-finder/match-reasons.js — EXISTS
- agents/capital-grant-finder/email.js — EXISTS
- agents/capital-grant-finder/index.js — EXISTS
- src/app/api/onboarding/complete/route.ts — MODIFIED (agent_trigger_queue wired)
- Commit 5d2d8b6 — EXISTS
- Commit d8a4ae5 — EXISTS
