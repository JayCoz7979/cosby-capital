---
phase: 01-security-infrastructure
verified: 2026-06-09T00:00:00Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "npm audit --audit-level=high returns zero findings"
    status: failed
    reason: "2 high-severity tar CVEs present (GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-qffp-2rhf-9h46, GHSA-9ppj-qmqm-q256) via @mapbox/node-pre-gyp <= 1.0.11. The npm audit command exits with code 1. A fix is available via npm audit fix (no breaking change for tar)."
    artifacts:
      - path: "package.json / package-lock.json"
        issue: "@mapbox/node-pre-gyp <= 1.0.11 depends on tar <= 7.5.10, which has multiple high-severity path traversal CVEs. A non-breaking fix is available: npm audit fix"
    missing:
      - "Run npm audit fix to resolve tar CVEs via non-breaking upgrade"
      - "Or add a documented npm audit resolution/override with a linked issue number if intentionally deferred"

  - truth: "All Supabase tables have RLS enabled + policies in same migration file"
    status: failed
    reason: "Migration 001 (20240101000001_initial_schema.sql) creates 16 tables and runs ALTER TABLE ... ENABLE ROW LEVEL SECURITY for each, but contains ZERO CREATE POLICY statements. The policies for those 16 tables are in Migration 002 (20240101000002_rls_policies.sql). The success criterion requires both RLS enable AND policies in the same file. Only the 8 security tables in Migration 003 satisfy this requirement."
    artifacts:
      - path: "supabase/migrations/20240101000001_initial_schema.sql"
        issue: "16 tables have ENABLE ROW LEVEL SECURITY but no CREATE POLICY statements — tables are RLS-enabled but unprotected between migration 001 and migration 002 application"
      - path: "supabase/migrations/20240101000002_rls_policies.sql"
        issue: "Policies exist here but are separated from their CREATE TABLE statements by a migration boundary"
    missing:
      - "Either merge RLS policies into migration 001 alongside each CREATE TABLE, or document that the two-migration pattern is intentional and the window between migrations is acceptable (since migrations run transactionally)"
---

# Phase 01: Security Infrastructure Verification Report

**Phase Goal:** Hacker-proof Next.js 15.5.18 foundation — all security configs, shared utilities, Supabase migration system, GitHub security workflows. Zero critical npm audit findings. All tables have RLS verified.
**Verified:** 2026-06-09
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm audit --audit-level=high` returns zero findings | FAILED | npm audit exits code 1; 2 high-severity tar CVEs via @mapbox/node-pre-gyp. `tar <= 7.5.10` triggers findings: GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-qffp-2rhf-9h46, GHSA-9ppj-qmqm-q256. A non-breaking fix is available via `npm audit fix`. |
| 2 | All Supabase tables have RLS enabled + policies in same migration file | FAILED | Migration 001 enables RLS on 16 tables but has zero CREATE POLICY statements. Policies live in Migration 002. Only Migration 003's 8 security tables have both ENABLE + CREATE POLICY in the same file. |
| 3 | next.config.js security headers include HSTS, X-Frame-Options, CSP, poweredByHeader:false | VERIFIED | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` at line 10. `X-Frame-Options: DENY` at line 13. Full CSP with default-src, script-src, style-src, connect-src, frame-ancestors at lines 45-61. `poweredByHeader: false` at line 66. |
| 4 | No API keys or secrets in any NEXT_PUBLIC_ env vars | VERIFIED | All 7 NEXT_PUBLIC_ variables in .env.example are legitimately public: SUPABASE_URL, SUPABASE_ANON_KEY (Supabase public key by design), STRIPE_PUBLISHABLE_KEY, POSTHOG_KEY, POSTHOG_HOST, TURNSTILE_SITE_KEY, VAPI_PUBLIC_KEY. All actual secrets (SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, etc.) are SERVER ONLY env vars. |
| 5 | All shared utilities exist: logger.ts, sanitize.ts, auth.ts, validate.ts, api-error.ts, supabase.ts | VERIFIED | All 6 files exist at src/lib/ and are substantive implementations — no stubs. |
| 6 | middleware.ts returns 404 (not 403) for admin on non-allowlisted IPs, has no NODE_ENV bypasses | VERIFIED | Line 140: `const res = new NextResponse(null, { status: 404 })` for non-allowlisted admin IPs. Zero occurrences of `NODE_ENV` anywhere in middleware.ts. |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `next.config.js` | HSTS + X-Frame-Options + CSP + poweredByHeader:false | VERIFIED | All 4 required headers present, substantive values |
| `middleware.ts` | Admin 404, no NODE_ENV bypass | VERIFIED | 7-step pipeline, admin IP check at step 3 returns 404, no environment checks |
| `src/lib/logger.ts` | PCI-compliant structured logger | VERIFIED | 10 SCRUB_PATTERNS including card/SSN/EIN/API keys, sanitizeForLog() recursive, structured JSON output |
| `src/lib/sanitize.ts` | Prompt injection defense + output scan | VERIFIED | 13 INJECTION_PATTERNS, sanitizeForPrompt() with XML delimiters, scanOutputConfidentiality() with 8 patterns, sanitizeForEmail() via isomorphic-dompurify |
| `src/lib/auth.ts` | verifyOwnership 50ms gate, requireTier, JWT alg lock | VERIFIED | 50ms minimum enforced on both success and error paths, TIER_ORDER comparison, HS256/RS256/ES256 allowlist |
| `src/lib/validate.ts` | Zod schemas with .max() on all strings, validateRedirect allowlist | VERIFIED | All string fields have .max(), 17-path REDIRECT_ALLOWLIST, rejects absolute URLs and protocol-relative paths |
| `src/lib/api-error.ts` | Central error handler, no stack traces to client | VERIFIED | CLIENT_MESSAGES generic responses, ZodError handled with 422, unknown errors return generic 500 |
| `src/lib/supabase.ts` | Three client factories, server-only guard on service client | VERIFIED | `import 'server-only'` at file level before createServiceClient(), three distinct clients for three contexts |
| `supabase/migrations/20240101000001_initial_schema.sql` | 16 tables with RLS enabled AND policies | FAILED | 16 tables have ENABLE ROW LEVEL SECURITY but ZERO CREATE POLICY statements |
| `supabase/migrations/20240101000002_rls_policies.sql` | Policies for migration 001 tables | EXISTS | Policies exist but are separated from CREATE TABLE by a migration file boundary |
| `supabase/migrations/20240101000003_security_tables.sql` | 8 security tables with RLS + policies in same file | VERIFIED | All 8 tables: ENABLE ROW LEVEL SECURITY immediately followed by CREATE POLICY in same file |
| `package.json / package-lock.json` | npm audit --audit-level=high = zero findings | FAILED | tar <= 7.5.10 (via @mapbox/node-pre-gyp) has 4 high-severity CVEs; exit code 1 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| middleware.ts | /admin routes | ADMIN_IP_ALLOWLIST check | VERIFIED | Lines 137-143: pathname.startsWith('/admin') check, returns 404 on IP mismatch |
| middleware.ts | /api/* routes | ALLOWED_ORIGINS CORS | VERIFIED | Lines 78-96: handleCors() checks against 3-entry ALLOWED_ORIGINS array |
| src/lib/supabase.ts | server-only guard | `import 'server-only'` | VERIFIED | Line 55: `import 'server-only'` at module level before createServiceClient definition |
| src/lib/auth.ts | 50ms timing guard | setTimeout after DB query | VERIFIED | Lines 54-57 (success path) and lines 63-67 (error path) both enforce MIN_OWNERSHIP_RESPONSE_MS |

### Data-Flow Trace (Level 4)

Not applicable — Phase 01 creates configuration files and shared utilities, no dynamic data rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| middleware.ts: admin 404 | Inspect source lines 137-143 | `new NextResponse(null, { status: 404 })` confirmed | PASS |
| middleware.ts: no NODE_ENV | `grep NODE_ENV middleware.ts` | Zero matches | PASS |
| next.config.js: poweredByHeader | Inspect line 66 | `poweredByHeader: false` confirmed | PASS |
| next.config.js: HSTS | Inspect lines 9-11 | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` confirmed | PASS |
| npm audit high findings | `npm audit --audit-level=high` | Exit code 1, 2 high-severity findings (tar CVEs) | FAIL |

### Probe Execution

No probes declared or conventional probe scripts found for this phase.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| S13-010 | poweredByHeader:false | SATISFIED | next.config.js line 66 |
| S11-012 | RLS in same file as CREATE TABLE | PARTIAL | Migration 003 satisfies; Migration 001 does not (policies in Migration 002) |
| S14-003 | PCI logger strips card/SSN/EIN/API keys | SATISFIED | src/lib/logger.ts SCRUB_PATTERNS + sanitizeForLog() |
| S10-002 | sanitizeForPrompt wraps in XML delimiters | SATISFIED | src/lib/sanitize.ts sanitizeForPrompt() wraps in `<user_content>` |
| S16-004 | verifyOwnership 50ms minimum response | SATISFIED | src/lib/auth.ts both success and error paths enforce 50ms |
| A02 | JWT algorithm lock rejects alg=none | SATISFIED | src/lib/auth.ts verifyJwtAlgorithm() allowlist |
| S12-003 | No NODE_ENV bypass conditions | SATISFIED | middleware.ts has zero environment checks |
| S13-008 | CORS allowlist for API routes | SATISFIED | middleware.ts ALLOWED_ORIGINS + handleCors() |
| GAP-255 | .max() on all Zod string fields | SATISFIED | src/lib/validate.ts all schemas |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| supabase/migrations/20240101000001_initial_schema.sql | `PLACEHOLDER_HASH_REPLACE_WITH_ACTUAL_SHA256` in signature_documents seed | WARNING | Legal document hashes are placeholder values. Not a blocker for security infrastructure phase — legal copy integration is a future phase deliverable. |
| supabase/migrations/20240101000003_security_tables.sql | `stripe_starter_monthly` and other Stripe price IDs seeded as empty string `''` | INFO | Intentional stub per SUMMARY.md — IDs are environment-specific and will be set in admin panel later. |

No `TBD`, `FIXME`, or `XXX` markers found in phase files.

### Human Verification Required

None — all success criteria are programmatically verifiable.

### Gaps Summary

**Two gaps block goal achievement:**

**Gap 1 — npm audit high findings (BLOCKER)**
`npm audit --audit-level=high` exits with code 1. The `tar` package at version <= 7.5.10 (reached via `@mapbox/node-pre-gyp`) has 4 high-severity CVEs:
- GHSA-34x7-hfp2-rc4v: Hardlink Path Traversal / Arbitrary File Creation
- GHSA-8qq5-rm4j-mr97: Arbitrary File Overwrite via Symlink Poisoning
- GHSA-qffp-2rhf-9h46: Hardlink Path Traversal via Drive-Relative Linkpath
- GHSA-9ppj-qmqm-q256: Symlink Path Traversal via Drive-Relative Linkpath

The SUMMARY.md documented these as "acceptable with --ignore-scripts enforced" but the success criterion is a binary exit-code test. `npm audit fix` can resolve the tar CVEs without breaking changes. The postcss/next CVEs are moderate severity (not high) and do not trigger `--audit-level=high` by themselves.

**Gap 2 — RLS policies not in same migration file as CREATE TABLE (BLOCKER)**
Migration 001 creates 16 tables and enables RLS on each, but contains no `CREATE POLICY` statements. Between the application of Migration 001 and Migration 002, all 16 tables have RLS enabled but **no policies** — meaning all rows are invisible to authenticated users and inaccessible even to service_role via PostgREST during that window. The ROADMAP success criterion explicitly requires "policies in same migration file." Migration 003 correctly implements this pattern for its 8 security tables.

Note: If migrations always run atomically as a batch (no partial application), this may be a documentation/interpretation gap rather than a runtime security gap. The verifier cannot determine deployment atomicity from code inspection alone. A human decision is needed on whether to accept this or restructure migrations 001+002 into a single file.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
