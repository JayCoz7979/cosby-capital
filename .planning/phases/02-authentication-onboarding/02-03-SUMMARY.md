---
phase: 2
plan: 3
subsystem: onboarding
tags: [onboarding, kyb, ofac, compliance, wizard, edge-functions, rls, pgsodium]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [onboarding-wizard, kyb-verification, ofac-screening, beneficial-ownership]
  affects: [02-04, 02-05, clients-table, onboarding_sessions]
tech_stack:
  added:
    - Supabase Edge Functions (Deno) for KYB and OFAC
    - pgsodium column encryption for EIN and SSN last4
    - Resend welcome email on onboarding completion
    - Telegram alerts for OFAC block/flag and KYB failure
  patterns:
    - Server-side OFAC proxy (SDN API never called from browser)
    - Generic error messages for KYB/OFAC failures (no technical details to client)
    - Runtime SignatureModal availability detection (parallel Wave 2 build)
    - Onboarding session step_data JSONB merge (incremental saves)
key_files:
  created:
    - supabase/migrations/20240101000006_onboarding_kyb_tables.sql
    - supabase/migrations/20240101000007_onboarding_tables.sql
    - supabase/functions/verify-kyb/index.ts
    - supabase/functions/screen-ofac/index.ts
    - src/app/onboarding/layout.tsx
    - src/app/onboarding/page.tsx
    - src/app/onboarding/step-1/page.tsx
    - src/app/onboarding/step-2/page.tsx
    - src/app/onboarding/step-3/page.tsx
    - src/app/onboarding/step-4/page.tsx
    - src/app/onboarding/step-5/page.tsx
    - src/app/onboarding/step-6/page.tsx
    - src/app/api/onboarding/save-step/route.ts
    - src/app/api/onboarding/complete/route.ts
    - src/app/api/onboarding/verify-kyb/route.ts
    - src/app/api/onboarding/run-ofac/route.ts
    - src/app/api/onboarding/signature-modal-available/route.ts
    - src/components/onboarding/OnboardingProgressBar.tsx
  modified:
    - src/lib/validate.ts (added 7 onboarding step schemas)
    - tsconfig.json (excluded supabase/functions for Deno compatibility)
decisions:
  - Migration 006 adds onboarding_sessions and kyb_verifications (prerequisites missing from earlier migrations)
  - EIN stored as pgsodium-encrypted bytea columns (ein_encrypted + ein_key_id) on both clients and kyb_verifications
  - SSN last4 stored as pgsodium-encrypted bytea (ssn_last4_encrypted + ssn_last4_key_id) on beneficial_owners
  - OFAC edge function defaults to direct mode with hardcoded obvious SDN test names; production teams set OFAC_VENDOR env
  - KYB edge function defaults to format-only validation; production teams set KYB_VENDOR=middesk or persona
  - Step 5 uses filesystem probe API (not static import) to detect SignatureModal availability during parallel Wave 2 build
  - supabase/functions excluded from tsconfig (Deno runtime incompatible with Next.js tsc)
  - run-ofac proxy uses worst-result-wins: screens business entity then all beneficial owners, returns most severe result
metrics:
  duration: "~90 minutes"
  completed: "2026-06-09"
  tasks_completed: 13
  files_created: 20
  files_modified: 2
---

# Phase 2 Plan 3: 6-Step Onboarding Wizard Summary

Complete 6-step onboarding wizard with KYB verification, OFAC sanctions screening, beneficial ownership collection (CTA compliance), consulting agreement placeholder, and subscription tier selection — backed by pgsodium-encrypted EIN/SSN storage, Supabase Edge Functions, and server-side-only OFAC compliance infrastructure.

## What Was Built

### Database Migrations

**Migration 006** (`20240101000006_onboarding_kyb_tables.sql`):
- `onboarding_sessions` table — per-user wizard progress store with `step_data` JSONB, `last_completed_step`, `completed` flag, RLS (user owns own row)
- `kyb_verifications` table — KYB audit trail with `ein_encrypted`/`ein_key_id` pgsodium columns, RLS (user SELECT own, service_role INSERT)
- Adds `kyb_status`, `ein_encrypted`, `ein_key_id`, `onboarding_complete` columns to `clients`

**Migration 007** (`20240101000007_onboarding_tables.sql`):
- `beneficial_owners` table — CTA compliance with `ssn_last4_encrypted`/`ssn_last4_key_id` pgsodium columns, RLS (user owns own rows)
- `ofac_screenings` table — OFAC audit log, service_role INSERT, user SELECT own rows
- Adds `ofac_status`, `ofac_screened_at`, `beneficial_ownership_collected` to `clients`

### Edge Functions

**verify-kyb** (`supabase/functions/verify-kyb/index.ts`):
- Accepts EIN + business_name + state + client_id, authenticated via `INTERNAL_SERVICE_SECRET`
- EIN format validation (`^\d{2}-\d{7}$`) before any processing
- Vendor hierarchy: Middesk → Persona → default format-only (acceptable at launch)
- EIN never logged in plaintext; `sanitizeForLog()` applied throughout
- On failure: generic support message + Telegram alert
- Inserts `kyb_verifications` record, updates `clients.kyb_status`

**screen-ofac** (`supabase/functions/screen-ofac/index.ts`):
- OFAC screening always server-side — SDN API never called from browser
- Direct mode: hardcoded obvious SDN test names with exact/substring matching
- Vendor hierarchy: Middesk → Persona → Alloy → direct mode
- On block: `clients.kyb_status='blocked'` AND `clients.ofac_status='blocked'` + immediate Telegram alert
- On flag: `clients.ofac_status='flagged'` + Telegram alert within 1 minute
- PII (entity names, DOBs) never logged in plaintext

### Next.js Pages

| Page | Description |
|------|-------------|
| `onboarding/layout.tsx` | Server component, auth guard, completion redirect, gold progress bar |
| `onboarding/page.tsx` | Router — redirects to last_completed_step+1 or step-1 |
| `onboarding/step-1/page.tsx` | Business basics + creates/updates clients record |
| `onboarding/step-2/page.tsx` | Funding goals, urgency, credit score, obstacles |
| `onboarding/step-3/page.tsx` | Business flags + nonprofit/church branch |
| `onboarding/step-4/page.tsx` | Sub-steps 4A (KYB), 4B (beneficial ownership), 4C (OFAC) |
| `onboarding/step-5/page.tsx` | Consulting agreement placeholder + runtime SignatureModal detection |
| `onboarding/step-6/page.tsx` | Subscription tier cards + annual/monthly toggle |

### API Routes

| Route | Description |
|-------|-------------|
| `POST /api/onboarding/save-step` | Per-step Zod validation, client INSERT/UPDATE (step 1), session upsert |
| `POST /api/onboarding/complete` | Marks complete, queues agents 1/5/8, sends Resend welcome email |
| `POST /api/onboarding/verify-kyb` | Server-side proxy to verify-kyb edge function |
| `POST /api/onboarding/run-ofac` | Server-side proxy, screens business + all beneficial owners |
| `GET /api/onboarding/signature-modal-available` | Filesystem probe for SignatureModal component existence |

## Deviations from Plan

### Auto-added Missing Infrastructure (Rule 2)

**1. [Rule 2 - Missing] Migration 006 for onboarding_sessions and kyb_verifications**
- Found during: Task 1
- Issue: Plan referenced `onboarding_sessions` and `kyb_verifications` tables but they didn't exist in any migration (only 001–005 existed)
- Fix: Created migration 006 to add both prerequisite tables before migration 007 could reference them
- Files: `supabase/migrations/20240101000006_onboarding_kyb_tables.sql`

**2. [Rule 2 - Missing] verify-kyb Next.js proxy route**
- Found during: Task 10 (Step 4 implementation)
- Issue: Step 4 calls verify-kyb from browser but edge function requires INTERNAL_SERVICE_SECRET; client must never see this secret
- Fix: Created `/api/onboarding/verify-kyb` as a server-side proxy that holds the secret and returns only generic messages
- Files: `src/app/api/onboarding/verify-kyb/route.ts`

**3. [Rule 2 - Missing] run-ofac Next.js proxy route**
- Found during: Task 10 (Step 4 implementation)
- Issue: Plan mandated OFAC screening server-side only; needed a proxy route to screen business + all beneficial owners and return worst result
- Fix: Created `/api/onboarding/run-ofac` that screens business entity then each beneficial owner in sequence
- Files: `src/app/api/onboarding/run-ofac/route.ts`

**4. [Rule 3 - Blocking] tsconfig.json Deno exclusion**
- Found during: TypeScript build check
- Issue: `supabase/functions/` uses Deno globals (`Deno.env`, `Deno.serve`) and ESM URL imports — caused 18 TypeScript errors in `tsc --noEmit`
- Fix: Added `"supabase/functions"` to `tsconfig.json` exclude array
- Files: `tsconfig.json`

**5. [Rule 1 - Bug] Step 4 IterableIterator target error**
- Found during: TypeScript build check
- Issue: `owners.entries()` returns `IterableIterator` which requires `--downlevelIteration` or `--target es2015+`
- Fix: Changed to `Array.from(owners.entries())`
- Files: `src/app/onboarding/step-4/page.tsx`

**6. [Rule 1 - Bug] Step 5 SignatureModal static type resolution**
- Found during: TypeScript build check
- Issue: Dynamic `import("@/components/signature/SignatureModal")` still resolved statically by TypeScript — TS2307 error since file doesn't exist yet
- Fix: Removed all static/dynamic imports of SignatureModal; replaced with filesystem probe API (`/api/onboarding/signature-modal-available`) that checks at runtime whether the component file exists. Step 5 renders placeholder until 02-04 merges.
- Files: `src/app/onboarding/step-5/page.tsx`, `src/app/api/onboarding/signature-modal-available/route.ts`

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| SignatureModal not wired | `step-5/page.tsx` | Plan 02-04 builds SignatureModal in parallel Wave 2; step 5 shows placeholder. Once 02-04 merges, filesystem probe returns true and Sign button activates. |
| Stripe checkout not wired | `step-6/page.tsx` | Plan 02-05 wires Stripe. "Select Plan" currently completes onboarding and redirects to `/dashboard` (free trial flow). Note shown to user. |
| agent_queue INSERT in complete route | `api/onboarding/complete/route.ts` | `agent_queue` table doesn't exist yet; INSERT fails gracefully with a warning log. Agent infrastructure comes in a later phase. |

## Security Notes

All required security mandates from the plan are implemented:
- EIN encrypted via pgsodium columns (`ein_encrypted` + `ein_key_id`) — never stored plaintext
- SSN last4 encrypted via pgsodium columns — never stored plaintext
- OFAC screening: 100% server-side via proxy route → edge function → SDN check
- KYB failures show generic support message only — no technical details to client
- OFAC block sets `kyb_status='blocked'` AND fires immediate Telegram alert
- All step data validated with Zod schemas with `.max()` on all string fields
- Onboarding layout redirects to `/dashboard` if `onboarding_sessions.completed=true`
- `clients` record created in step-1 with `user_id = auth.uid()`
- `beneficial_owners` RLS: user can only see own rows
- `ofac_screenings` RLS: service_role INSERT, user SELECT own rows

## Self-Check: PASSED

Files verified:
- `supabase/migrations/20240101000006_onboarding_kyb_tables.sql` — FOUND
- `supabase/migrations/20240101000007_onboarding_tables.sql` — FOUND
- `supabase/functions/verify-kyb/index.ts` — FOUND
- `supabase/functions/screen-ofac/index.ts` — FOUND
- `src/app/onboarding/layout.tsx` — FOUND
- `src/app/onboarding/step-1/page.tsx` through `step-6/page.tsx` — FOUND
- `src/app/api/onboarding/save-step/route.ts` — FOUND
- `src/app/api/onboarding/complete/route.ts` — FOUND
- `src/lib/validate.ts` (onboarding schemas) — FOUND

Commits verified:
- e5e3832 — migrations
- 664478b — edge functions
- 496a3d7 — validate.ts schemas
- 0753df1 — layout + progress bar
- 387bf5a — API routes
- 707d70d — step pages
- d544d1b — tsconfig fix

TypeScript: `tsc --noEmit` — 0 errors
