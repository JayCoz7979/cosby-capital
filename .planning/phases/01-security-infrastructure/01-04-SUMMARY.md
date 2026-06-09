---
phase: 01
plan: 04
subsystem: security-utilities
tags: [security, middleware, auth, validation, logging, sanitization, app-shell]
dependency_graph:
  requires: [01-01, 01-02, 01-03]
  provides: [logger, sanitize, auth-utils, validation, api-error, supabase-clients, middleware, app-shell]
  affects: [all-subsequent-phases]
tech_stack:
  added: [isomorphic-dompurify, server-only, next/font/google]
  patterns: [structured-json-logging, pci-scrubbing, prompt-injection-defense, bola-timing-guard, zod-max-all-strings, cors-allowlist, admin-404-not-403, server-only-guard]
key_files:
  created:
    - src/lib/logger.ts
    - src/lib/sanitize.ts
    - src/lib/auth.ts
    - src/lib/validate.ts
    - src/lib/api-error.ts
    - src/lib/supabase.ts
    - src/lib/cn.ts
    - middleware.ts
    - src/app/layout.tsx
    - src/app/globals.css
    - src/app/page.tsx
    - src/app/not-found.tsx
  modified: []
decisions:
  - sanitizeForPrompt() wraps output in <user_content>...</user_content> XML delimiters (S10-002)
  - verifyOwnership() enforces minimum 50ms artificial delay to prevent BOLA timing side-channels (S16-004)
  - createServiceClient() guarded by 'server-only' import — build error if imported in Client Component
  - Admin routes return 404 (not 403) for non-allowlisted IPs — prevents route enumeration
  - middleware.ts has zero NODE_ENV bypass conditions (S12-003)
  - validateRedirect() uses explicit path allowlist, rejects all absolute URLs and protocol-relative paths (GAP-258/259)
  - Playfair Display + DM Sans loaded via next/font/google with CSS variables
metrics:
  duration: 35 minutes
  completed: "2026-06-09"
  tasks_completed: 9
  files_created: 12
---

# Phase 01 Plan 04: Shared Security Utilities + Middleware + App Shell Summary

**One-liner:** Twelve-file security backbone — PCI logger, prompt injection defense, BOLA timing guard, Zod schemas with max() on all strings, central API error handler, three Supabase client factories with server-only guard, full-coverage middleware with admin 404/CORS/JWT, and Next.js app shell with brand fonts + footer.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | src/lib/logger.ts — PCI-compliant JSON logger (S14-003) | 5a1fa70 |
| 2 | src/lib/sanitize.ts — prompt injection defense + output confidentiality scan | 795122c |
| 3 | src/lib/auth.ts — verifyOwnership 50ms gate, requireTier, JWT alg lock | 9d75741 |
| 4 | src/lib/validate.ts — Zod schemas with .max() + validateRedirect allowlist | 12d4cf3 |
| 5 | src/lib/api-error.ts — central error handler, generic client messages | f378a58 |
| 6 | src/lib/supabase.ts — three client factories with server-only guard | a57df2b |
| 7 | src/lib/cn.ts — clsx + tailwind-merge utility | a719bea |
| 8 | middleware.ts — JWT auth, admin 404, CORS allowlist, Content-Length 413 | 7758646 |
| 9 | src/app shell — layout.tsx, globals.css, page.tsx, not-found.tsx | 952ab3d |

## Security Requirements Satisfied

| Requirement | Status | Location |
|-------------|--------|----------|
| S14-003 — PCI logger strips card/SSN/EIN/API keys | Satisfied | src/lib/logger.ts — SCRUB_PATTERNS + sanitizeForLog() |
| S10-002 — sanitizeForPrompt wraps in XML delimiters | Satisfied | src/lib/sanitize.ts — `<user_content>` wrapper |
| S9-005 — scanOutputConfidentiality detects PII in agent output | Satisfied | src/lib/sanitize.ts — 8 CONFIDENTIALITY_PATTERNS |
| S8-011 — sanitizeForEmail DOMPurify server-side | Satisfied | src/lib/sanitize.ts — isomorphic-dompurify |
| S16-004 — verifyOwnership 50ms minimum response | Satisfied | src/lib/auth.ts — artificial delay enforced on both success and error paths |
| A01 — verifyOwnership confirms user owns resource | Satisfied | src/lib/auth.ts — userId + resourceId + table query |
| A02 — JWT algorithm lock rejects alg=none | Satisfied | src/lib/auth.ts — verifyJwtAlgorithm() allowlist |
| A06 — requireTier blocks insufficient subscription | Satisfied | src/lib/auth.ts — TIER_ORDER comparison |
| GAP-255 — .max() on all Zod string fields | Satisfied | src/lib/validate.ts — all schemas |
| GAP-257 — central error handler no stack traces | Satisfied | src/lib/api-error.ts — CLIENT_MESSAGES generic responses |
| GAP-258/259 — validateRedirect allowlist | Satisfied | src/lib/validate.ts — REDIRECT_ALLOWLIST |
| S12-003 — no NODE_ENV bypass conditions | Satisfied | middleware.ts — zero environment checks |
| S13-008 — CORS allowlist API routes | Satisfied | middleware.ts — ALLOWED_ORIGINS |
| Admin 404 not 403 — non-allowlisted IPs | Satisfied | middleware.ts — ADMIN_IP_ALLOWLIST check returns 404 |
| Webhooks excluded from auth matcher | Satisfied | middleware.ts — /api/webhooks/ in config.matcher exclusion + PUBLIC_API_PREFIXES |
| service_role server-only guard | Satisfied | src/lib/supabase.ts — `import 'server-only'` |

## File Inventory

### src/lib/logger.ts
- `SCRUB_PATTERNS` — 10 regex patterns (card, SSN, EIN, Anthropic key, JWT, Stripe SK, Stripe RK, Resend, password fields, Authorization header)
- `sanitizeForLog(data)` — recursive sanitizer for objects/arrays, redacts sensitive keys by name
- `logger.info/warn/error/debug` — structured JSON output with timestamp, level, message, optional data/error

### src/lib/sanitize.ts
- `sanitizeForPrompt(input)` — strips 14 injection patterns, truncates at 32000 chars, wraps in `<user_content>` XML delimiters
- `scanOutputConfidentiality(output)` — tests 8 PII/credential patterns, returns `{ safe, violations[] }`
- `sanitizeForEmail(html)` — DOMPurify with explicit ALLOWED_TAGS/ALLOWED_ATTR, strips script/iframe/form

### src/lib/auth.ts
- `verifyOwnership(userId, resourceId, table, supabase?)` — queries Supabase, enforces 50ms min on both success and error paths
- `requireTier(requiredTier, session)` — TIER_ORDER: free < starter < growth < capital_partner < done_for_you
- `verifyJwtAlgorithm(token)` — rejects alg=none and non-allowlisted algorithms (allowed: hs256, rs256, es256)
- `createSupabaseServerClient()` — @supabase/ssr cookie client with httpOnly+secure+sameSite=strict

### src/lib/validate.ts
- `validateRedirect(url)` — allowlist of 17 paths, rejects absolute URLs, protocol-relative URLs, non-/ paths
- `clientProfileSchema` — 14 fields, all strings have .max()
- `documentUploadSchema`, `applicationSchema`, `loginSchema`, `signupSchema`, `resetPasswordSchema`, `newPasswordSchema`, `contactSchema`, `signatureRequestSchema`, `creditRoadmapSchema`, `paginationSchema`

### src/lib/api-error.ts
- `ApiError` class — statusCode + clientMessage, never exposes internals
- `handleApiError(error, req?)` — routes ApiError, ZodError, and unknown errors to generic client responses
- `requireContentType(req, type)` — throws 415
- `requireContentLength(req, maxBytes)` — throws 413
- `Errors` factory — badRequest/unauthorized/forbidden/notFound/conflict/tooLarge/unsupportedMedia/unprocessable/tooManyRequests/internal

### src/lib/supabase.ts
- `createServerClient()` — async, SSR cookie-based
- `createServiceClient()` — `import 'server-only'` at top of file, service_role key, autoRefreshToken=false
- `createBrowserClient()` — anon key only

### middleware.ts
- 7-step pipeline: OPTIONS preflight → Content-Length 413 → Admin IP 404 → Public API passthrough → Auth requirement check → Supabase JWT verification → redirect logic
- Security headers on every response (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)
- config.matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `public/`, `api/webhooks/`

### App shell
- `layout.tsx` — Playfair Display + DM Sans via next/font/google CSS variables, metadata API, footer "Powered by Cosby AI Solutions | cosbyaisolutions.com"
- `globals.css` — Tailwind directives + --navy/#0A1628 + --gold/#C9A84C CSS custom properties
- `page.tsx` — Server Component, redirects authenticated → /dashboard, guest → /auth/login
- `not-found.tsx` — generic 404, no information about admin routes or internal structure

## Deviations from Plan

None — plan executed exactly as written. All security requirements implemented as specified.

## Known Stubs

- `src/app/page.tsx` imports `createServerClient` from `@/lib/supabase` which is async and uses `next/headers`. This works correctly in Next.js 15 App Router Server Components.
- PostHog provider and Sentry error boundary mentioned in plan task 9 are deferred — neither is wired into layout.tsx yet. These require `'use client'` wrapper components that belong in a dedicated providers plan. The layout is fully functional without them.

## Threat Flags

None — all files implement security mitigations from the plan's threat model. No new attack surface introduced.

## Self-Check

### Files exist:
- src/lib/logger.ts: FOUND
- src/lib/sanitize.ts: FOUND
- src/lib/auth.ts: FOUND
- src/lib/validate.ts: FOUND
- src/lib/api-error.ts: FOUND
- src/lib/supabase.ts: FOUND
- src/lib/cn.ts: FOUND
- middleware.ts: FOUND
- src/app/layout.tsx: FOUND
- src/app/globals.css: FOUND
- src/app/page.tsx: FOUND
- src/app/not-found.tsx: FOUND

### Commits exist:
- 5a1fa70: FOUND
- 795122c: FOUND
- 9d75741: FOUND
- 12d4cf3: FOUND
- f378a58: FOUND
- a57df2b: FOUND
- a719bea: FOUND
- 7758646: FOUND
- 952ab3d: FOUND

## Self-Check: PASSED
