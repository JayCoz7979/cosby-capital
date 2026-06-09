# Phase 1 — Security + Infrastructure Foundation

**Goal:** Establish a hacker-proof Next.js foundation before any client features. All Tier 1 security issues resolved. Zero critical/high npm audit findings. RLS verified on all tables.

**Reference:** `phase1-build-sequence.md`, `CosbyCapital_Master_Build_Prompt_v14_FINAL.txt` (Sections 1-50, 156, 201, 204, 205), `CosbyCapital_Top15pct_Issues.txt` (TIER 1 items 001-008 + sessions 6-19 Day 1 items).

---

## Wave 1 — Project Scaffold + Config Files (no dependencies)

### Task 1.1 — Tailwind + PostCSS config
**Type:** create  
**File:** `tailwind.config.ts`, `postcss.config.mjs`  
**Details:** Brand colors (navy #0A1628, gold #C9A84C), Playfair Display + DM Sans font vars.

### Task 1.2 — App source structure
**Type:** create  
**Files:**
- `src/app/layout.tsx` — root layout with font vars, Sentry, PostHog init
- `src/app/globals.css` — Tailwind directives + CSS vars
- `src/app/page.tsx` — placeholder redirect to /dashboard or landing
- `src/app/not-found.tsx` — custom 404 page

### Task 1.3 — GitHub security files
**Type:** create  
**Files:**
- `.github/workflows/security.yml` — Snyk + Gitleaks + Semgrep on PRs
- `.github/workflows/codeql.yml` — CodeQL analysis
- `.github/workflows/sbom.yml` — SBOM generation (S10-010)
- `.github/workflows/supabase-security.yml` — Supabase Security Advisor check on PR
- `.github/workflows/trust-logic-check.yml` — blocks PRs with eval/exec/new Function (S15-003)
- `.github/workflows/nextjs-version-gate.yml` — block deploy if Next.js < 15.5.18 (S11-002)
- `.github/PULL_REQUEST_TEMPLATE.md` — security checklist template
- `.github/dependabot.yml` — auto dependency updates
- `public/.well-known/security.txt` — responsible disclosure
- `vercel.json` — Vercel config with spend limits

### Task 1.4 — Supabase migration: initial schema
**Type:** create  
**Files:**
- `supabase/config.toml` — Supabase project config
- `supabase/migrations/20240101000001_initial_schema.sql` — full schema from cosby_capital_schema.sql
- `supabase/migrations/20240101000002_rls_policies.sql` — all RLS policies
- `supabase/migrations/20240101000003_additional_tables.sql` — trusted_devices, processed_webhook_events, active_sessions, deletion_requests, exploit_chains, admin_audit_log, platform_settings, api_keys

---

## Wave 2 — Security Utilities (depends on project scaffold)

### Task 2.1 — lib/logger.ts
**Type:** create  
**Details:** `sanitizeForLog()` strips card data, SSN, EIN, API keys from log output. Wraps console with structured JSON logging. All console.log calls in app must use this. PII scrubbing for Sentry (S14-003).

### Task 2.2 — lib/sanitize.ts
**Type:** create  
**Details:**
- `sanitizeForPrompt(input)` — strips prompt injection patterns, limits to 8000 tokens, wraps output in XML delimiters for agent use
- `scanOutputConfidentiality(output)` — detects EIN/SSN/API keys/PII in agent output before store/send (S9-005)
- `sanitizeForEmail(html)` — DOMPurify wrapper for agent email content (S8-011)

### Task 2.3 — lib/auth.ts
**Type:** create  
**Details:**
- `verifyOwnership(userId, resourceId, table)` — BOLA check with 50ms minimum response time (S16-004), returns 404 not 403
- `requireTier(tier, session)` — server-side subscription gate
- `verifyJwt(req)` — explicit JWT algorithm lock (never 'none') (A02)
- `createSupabaseServerClient()` — SSR-safe Supabase client

### Task 2.4 — lib/validate.ts
**Type:** create  
**Details:** Common Zod schemas with `.max()` on every string field (GAP-255). Schemas for: client profile, grant match, lender match, document upload, API routes. `validateRedirect()` allowlist function (GAP-258/259).

### Task 2.5 — lib/api-error.ts
**Type:** create  
**Details:** Central error handler for all API routes (GAP-257). Returns generic messages, no stack traces to client. Logs full error server-side via logger.ts.

### Task 2.6 — lib/supabase.ts
**Type:** create  
**Details:** Supabase client factories for server (service_role, server-only), browser (anon key), and middleware. Cookie-based session handling with `sameSite: 'strict', secure: true, httpOnly: true`.

---

## Wave 3 — Middleware + App Shell (depends on Wave 2)

### Task 3.1 — middleware.ts
**Type:** create  
**Details:**
- JWT verification on all protected routes
- Admin IP allowlist check → returns 404 (not 403) for non-allowlisted IPs
- Security headers injected on every response (with CSP nonce)
- Content-Length > 65536 → 413 (GAP-255)
- CORS allowlist (S13-008)
- No NODE_ENV bypass conditions (S12-003)
- Stripe webhook route excluded from auth matcher
- Explicit route matcher — all routes covered

### Task 3.2 — src/app/layout.tsx (full)
**Type:** create  
**Details:** Root layout with Playfair Display + DM Sans fonts (Google Fonts), Sentry init wrapper, PostHog provider, Cloudflare Turnstile script (SRI hash), footer with "Powered by Cosby AI Solutions" on every page.

### Task 3.3 — src/app/globals.css
**Type:** create  
**Details:** Tailwind directives, CSS custom properties for brand colors, font variables.

---

## Wave 4 — Supabase Additional Tables + RLS (depends on Wave 1)

### Task 4.1 — Migration: security tables
**Type:** create  
**File:** `supabase/migrations/20240101000003_security_tables.sql`  
**Tables with RLS in same file (S11-012):**
- `trusted_devices` — device fingerprint login protection
- `processed_webhook_events` — Stripe idempotency (S6-001, S14-009)
- `active_sessions` — concurrent session detection (GAP-256)
- `deletion_requests` — CCPA data deletion (S9-010)
- `exploit_chains` — documented exploit chain registry (S13-004)
- `admin_audit_log` — REVOKE DELETE/UPDATE + trigger (S8-003)
- `platform_settings` — model pins, price IDs, key rotation dates (S9-012, S15-012)
- `api_keys` — expires_at + allowed_scopes (S8-006)

### Task 4.2 — Migration: pg_cron + extensions
**Type:** create  
**File:** `supabase/migrations/20240101000004_extensions.sql`  
**Details:** REVOKE ALL ON SCHEMA cron FROM authenticated (GAP-216). Enable pgsodium for PII encryption (A14). Honeypot fields on grants/lenders tables (S8-005).

---

## Verification

- [ ] `npm audit --audit-level=high` → zero findings
- [ ] `grep -rn "NEXT_PUBLIC_" src/ | grep -v "SUPABASE_URL\|ANON_KEY\|STRIPE_PUBLISHABLE\|POSTHOG\|TURNSTILE_SITE\|VAPI_PUBLIC"` → zero results (no secret leaks)
- [ ] All migration files: every CREATE TABLE has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in same file
- [ ] middleware.ts matcher covers all non-public routes
- [ ] `grep -rn "eval(\|exec(\|new Function(" src/ agents/` → zero results (S16-001)
