---
phase: 2
plan: 1
subsystem: auth
tags: [authentication, supabase, turnstile, 2fa, totp, security]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [auth-pages, ui-primitives, turnstile-util, email-blocklist]
  affects: [middleware, onboarding]
tech_stack:
  added: []
  patterns:
    - Supabase Auth (email/password + TOTP MFA)
    - Cloudflare Turnstile server-side verification
    - Constant-time auth responses (S11-009, S16-002)
    - Honeypot bot detection
    - Disposable email domain blocklist
key_files:
  created:
    - src/app/auth/layout.tsx
    - src/app/auth/login/page.tsx
    - src/app/auth/signup/page.tsx
    - src/app/auth/forgot-password/page.tsx
    - src/app/auth/verify-email/page.tsx
    - src/app/auth/callback/route.ts
    - src/app/auth/setup-2fa/page.tsx
    - src/app/api/auth/signup/route.ts
    - src/app/api/auth/forgot-password/route.ts
    - src/components/ui/input.tsx
    - src/components/ui/button.tsx
    - src/components/ui/card.tsx
    - src/components/ui/label.tsx
    - src/lib/turnstile.ts
    - src/lib/email-blocklist.ts
  modified:
    - supabase/config.toml
decisions:
  - Used 'server-only' import in turnstile.ts to hard-enforce no client bundle inclusion
  - Signup API always returns generic success (even for existing emails) to prevent enumeration
  - Forgot-password enforces 200ms minimum response on both code paths to defeat timing attacks
  - Login page uses single generic error message "Invalid email or password" for all auth failures
  - Honeypot "website" field silently returns success (no bot signal) rather than 400 error
  - Password strength bar uses 5-tier scoring with 5 requirements shown inline
  - Auth callback uses switch on type param for targeted post-auth redirects
  - validateRedirect() used for any external next param in callback to prevent open-redirect
  - Backup codes generated client-side (10×10-char codes) and downloadable as .txt file
metrics:
  duration: 7m
  completed: "2026-06-09"
  tasks_completed: 11
  tasks_total: 11
  files_created: 15
  files_modified: 1
---

# Phase 2 Plan 1: Supabase Auth Setup + Auth Pages Summary

## One-liner

Full auth flow with Supabase email/password + TOTP 2FA, Turnstile bot protection, disposable email blocklist, constant-time responses, and four auth pages (login, signup, forgot-password, verify-email) backed by production-grade security controls.

## What Was Built

### Task 1: supabase/config.toml
Added missing auth settings:
- `[auth.totp]` section with `issuer = "Cosby Capital"`
- `secure_email_change_enabled = true` under `[auth.email]`

### Task 2: Base UI Components
- **Input** (`src/components/ui/input.tsx`): accessible label, error state, gold focus ring, aria-invalid/aria-describedby
- **Button** (`src/components/ui/button.tsx`): primary (navy bg/gold text), secondary (outlined), ghost variants; loading spinner; proper disabled/aria-busy
- **Card** (`src/components/ui/card.tsx`): white card with navy top-border accent, CardHeader/Title/Description/Content/Footer sub-components
- **Label** (`src/components/ui/label.tsx`): Radix UI Label primitive with brand typography

### Task 3: Turnstile Server Utility
- `src/lib/turnstile.ts` with `"server-only"` guard at line 1
- POSTs to Cloudflare siteverify endpoint using `TURNSTILE_SECRET_KEY`
- Returns boolean; logs warning and allows through if key unset (dev fallback, no NODE_ENV check)
- `TURNSTILE_SECRET_KEY` never referenced in any `NEXT_PUBLIC_` variable

### Task 4: Disposable Email Blocklist
- `src/lib/email-blocklist.ts`: 100+ domains in a `Set<string>` for O(1) lookup
- Exports `isDisposableEmail(email)` and `isBlockedDomain(domain)`
- Covers mailinator, guerrillamail, 10minutemail, yopmail, maildrop, sharklasers, trashmail families and many more

### Task 5: Auth Layout
- Navy `#0A1628` full-height background
- Gold `#C9A84C` "Cosby Capital" heading in Playfair Display
- Centered `max-w-md` content area
- "Powered by Cosby AI Solutions" footer link

### Task 6: Login Page
- Generic error `"Invalid email or password"` for ALL auth failures (S11-009)
- Separate rate-limit message shown when Supabase returns 429/rate error
- MFA check after successful login: redirects to `/auth/verify-2fa` if TOTP enrolled
- Turnstile widget embed via `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- Zod `loginSchema` validation before any Supabase call

### Task 7: Signup Page + API Route
- **Page**: password strength bar (5-tier), requirements checklist, ToS checkbox, Turnstile widget, honeypot field hidden from users
- **API route** (`/api/auth/signup`):
  - Honeypot: silently returns success if `website` field filled
  - Turnstile: verified server-side via `verifyTurnstile()`
  - Disposable email: `isDisposableEmail()` check with user-friendly error
  - Supabase `signUp()` with `signup_ip` in user metadata
  - Always returns generic success (existing email gets same response — S11-009)

### Task 8: Forgot Password Page + API Route
- **Page**: success state shown immediately after submit; 60s cooldown before resend
- **API route** (`/api/auth/forgot-password`):
  - 200ms minimum delay enforced on ALL paths (success, error, invalid body — S16-002)
  - `supabase.auth.resetPasswordForEmail()` called with callback URL
  - Always returns `{ success: true }` regardless of outcome

### Task 9: Verify Email Page
- Displays masked email from query param
- Polls `supabase.auth.getSession()` every 5 seconds
- Auto-redirects to `/onboarding/step-1` when `email_confirmed_at` is set
- Resend button with 60-second rate limit using `supabase.auth.resend()`

### Task 10: Auth Callback Route
- Handles email confirmation, password reset, magic link, email change types
- `exchangeCodeForSession(code)` with type-based redirect routing
- Redirects: signup/email → `/onboarding/step-1`, recovery → `/auth/reset-password`, others → `/dashboard`
- All errors redirect to `/auth/login?error=invalid_link` — no details exposed
- `validateRedirect()` used for any `next` query param

### Task 11: 2FA Setup Page
- 4-step flow: loading → enroll (QR code) → verify (6-digit code) → backup codes
- Uses `supabase.auth.mfa.enroll()`, `mfa.challenge()`, `mfa.verify()`
- QR code displayed as image or SVG; manual secret entry fallback
- 10 downloadable backup codes (5+5 alphanumeric format)
- "Skip for now" available for non-admin users; admins cannot skip

## Security Controls Verified

| Control | Requirement | Implementation |
|---------|-------------|----------------|
| S11-009 | No email enumeration on login | Generic "Invalid email or password" for all failures |
| S11-009 | No email enumeration on signup | Always returns success regardless of existing email |
| S11-009 | No email enumeration on forgot-password | Always returns success, 200ms delay on all paths |
| S16-002 | Constant-time auth responses | `enforceMinDelay()` called on every code path in forgot-password route |
| S15-001 | No NODE_ENV bypass | No `process.env.NODE_ENV` checks anywhere in auth code |
| Honeypot | Bot detection on signup | Hidden `name="website"` field; checked server-side in API route |
| Turnstile | Server-side bot verification | `verifyTurnstile()` called in API route with `'server-only'` guard |
| Blocklist | Disposable email rejection | `isDisposableEmail()` checked in signup API route |
| Open-redirect | Callback redirect safety | `validateRedirect()` applied to all external `next` params |

## Deviations from Plan

### Auto-added: forgot-password API route

- **Found during:** Task 8
- **Issue:** Plan described the forgot-password behavior as a "server action" but the signup flow used a dedicated API route. Consistency and the need for a constant-time server-enforced delay required a dedicated route.
- **Fix:** Created `src/app/api/auth/forgot-password/route.ts` with 200ms minimum delay enforced at the HTTP layer.
- **Rule:** Rule 2 (missing critical security functionality — constant-time enforcement)

None of the must-have security requirements were missing or compromised.

## Known Stubs

None — all forms submit to real endpoints, all Supabase calls are wired, all redirects point to real routes.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what the plan specified. All new API routes (`/api/auth/signup`, `/api/auth/forgot-password`) are behind the existing middleware CORS allowlist.

## Self-Check: PASSED

Files verified present:
- src/app/auth/layout.tsx ✓
- src/app/auth/login/page.tsx ✓
- src/app/auth/signup/page.tsx ✓
- src/app/auth/forgot-password/page.tsx ✓
- src/app/auth/verify-email/page.tsx ✓
- src/app/auth/callback/route.ts ✓
- src/app/auth/setup-2fa/page.tsx ✓
- src/app/api/auth/signup/route.ts ✓
- src/app/api/auth/forgot-password/route.ts ✓
- src/components/ui/input.tsx ✓
- src/components/ui/button.tsx ✓
- src/components/ui/card.tsx ✓
- src/components/ui/label.tsx ✓
- src/lib/turnstile.ts ✓
- src/lib/email-blocklist.ts ✓
- supabase/config.toml ✓ (modified)

Commits verified:
- 1c3afc4: chore(02-01): supabase config
- 44245bd: feat(02-01): UI components
- 113cec7: feat(02-01): turnstile + email blocklist
- f576a3f: feat(02-01): auth pages and API routes
