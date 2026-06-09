---
phase: 2
plan: 2
subsystem: authentication
tags: [device-fingerprint, otp, trusted-devices, step-up-auth, security]
dependency_graph:
  requires: [02-01]
  provides: [device-trust-flow, otp-verification, trusted-devices-api]
  affects: [login-page, auth-flow]
tech_stack:
  added: [crypto.randomInt, crypto.timingSafeEqual, Web Crypto API (SubtleCrypto), Resend email, @radix-ui/react-dialog]
  patterns: [constant-time comparison, OTP hash storage, device fingerprinting, step-up authentication, rate limiting]
key_files:
  created:
    - src/lib/otp.ts
    - src/lib/device-fingerprint.ts
    - supabase/migrations/20240101000005_device_otps.sql
    - src/app/api/auth/check-device/route.ts
    - src/app/api/auth/send-device-otp/route.ts
    - src/app/api/auth/verify-device-otp/route.ts
    - src/components/auth/DeviceTrustModal.tsx
  modified:
    - src/app/auth/login/page.tsx
decisions:
  - OTP stored as SHA-256 hex hash via Node crypto.createHash — never plaintext
  - verifyOtp uses crypto.timingSafeEqual after hashing both sides (S16-004)
  - attempt_count incremented BEFORE comparison to prevent race condition exploitation
  - Migration numbered 000005 (next sequential after 000004) — plan specified 000006 but that skipped a number
  - Device check fails open on error (proceed to dashboard) — step-up security, not hard auth gate
  - send-device-otp always returns sent:true regardless of email/DB outcome (enumeration prevention)
  - DeviceTrustModal prevents ESC/outside-click dismissal — user must verify or refresh
metrics:
  duration: "~45 minutes"
  completed: "2026-06-09"
  tasks_completed: 8
  files_created: 7
  files_modified: 1
---

# Phase 2 Plan 2: Device Fingerprint + Trusted Devices + OTP Flow Summary

## One-liner

Device step-up authentication: SHA-256 OTP hashing with timingSafeEqual constant-time verify, browser fingerprinting via Web Crypto API, and Radix UI modal flow enforcing trusted-device registration before dashboard access.

## What Was Built

### Task 1 — OTP utility (`src/lib/otp.ts`)
- `generateOtp()`: `crypto.randomInt(100000, 1000000)` for cryptographically secure 6-digit codes
- `hashOtp()`: SHA-256 via Node `crypto.createHash` — returns 64-char hex string
- `verifyOtp()`: hashes the provided OTP then compares to stored hash using `crypto.timingSafeEqual` (constant-time, S16-004)

### Task 2 — Device fingerprint (`src/lib/device-fingerprint.ts`)
- Client-only module (`"use client"`)
- Collects: `navigator.userAgent`, `navigator.language`, `screen.width/height/colorDepth`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, canvas fingerprint
- SHA-256 hashed via `crypto.subtle.digest` (Web Crypto API) → 64-char hex string
- SSR-safe guards (`typeof window === "undefined"` checks)

### Task 3 — Migration (`supabase/migrations/20240101000005_device_otps.sql`)
- `device_otps` table: `id, created_at, user_id, fingerprint_hash, otp_hash, expires_at, used, attempt_count`
- RLS enabled; `service_role_only` policy blocks anon/authenticated key access
- 3 indexes: user+fingerprint (partial on `used=false`), expiry cleanup, rate limit counting

### Task 4 — check-device route (`/api/auth/check-device`)
- Requires session; queries `trusted_devices` via service client
- Checks: `user_id`, `fingerprint_hash`, `is_revoked=false`, `expires_at > now()`
- Updates `last_seen_at` on match; logs fingerprint prefix (8 chars) only
- Fails open on DB error (returns `trusted: false`, triggers OTP flow)

### Task 5 — send-device-otp route (`/api/auth/send-device-otp`)
- Rate limit: 3 OTP sends per user per 15 minutes (count query on `device_otps`)
- Inserts OTP hash (never plaintext) with `expires_at = now() + 10 minutes`
- Sends branded HTML email via Resend with gold OTP code block and security warning
- Always returns `{ sent: true }` — prevents email enumeration

### Task 6 — verify-device-otp route (`/api/auth/verify-device-otp`)
- Minimum 50ms response time enforced at every return path (S16-004 pattern from `lib/auth.ts`)
- Fetches latest unused, non-expired OTP for `user_id + fingerprint_hash`
- Increments `attempt_count` BEFORE verification (race condition prevention)
- After 3 attempts: marks OTP `used=true` + returns 429 (brute force lockout)
- On success: marks OTP used, inserts `trusted_devices` with `expires_at = now() + 90 days`

### Task 7 — DeviceTrustModal (`src/components/auth/DeviceTrustModal.tsx`)
- Radix UI Dialog (`@radix-ui/react-dialog` confirmed in package.json)
- Auto-sends OTP on modal open; 60-second resend cooldown with countdown
- Single numeric input (`inputMode="numeric"`, `autoComplete="one-time-code"`, max 6 chars)
- Auto-submits when 6 digits entered
- Masked email display (`j*****@example.com`)
- ESC and outside-click disabled — user must verify
- Error states for invalid code and rate limit

### Task 8 — Login page integration (`src/app/auth/login/page.tsx`)
- After successful `signInWithPassword()` and TOTP check:
  1. `generateFingerprint()` client-side
  2. POST `/api/auth/check-device`
  3. Trusted → `router.push("/dashboard")`
  4. Untrusted → `setShowDeviceModal(true)`
- `onVerified` callback: close modal + redirect to dashboard
- No `NODE_ENV` bypass — check always runs

## Deviations from Plan

### Deviation 1 — Migration number corrected
- **Found during:** Task 3
- **Issue:** Plan specified `20240101000006_device_otps.sql` but the last migration on disk was `000004`. Using `000006` would skip `000005`, breaking sequential ordering.
- **Fix:** Named the file `20240101000005_device_otps.sql` (next sequential number).
- **Files modified:** `supabase/migrations/20240101000005_device_otps.sql`

### Deviation 2 — `hashOtp` made synchronous (Rule 1 — correctness)
- **Found during:** Task 1
- **Issue:** Plan signature showed `hashOtp` as `async Promise<string>` but Node `crypto.createHash` is synchronous. Making it async with no awaitable operation would add unnecessary complexity and confusion for callers.
- **Fix:** Implemented as synchronous `function hashOtp(otp: string): string`. All callers updated accordingly.
- **Impact:** `send-device-otp` and `verify-device-otp` routes call `hashOtp()` without `await` — cleaner and correct.

## Known Stubs

None — all data flows are wired end-to-end: OTP generation → hash storage → email send → verification → trusted_devices insert → login redirect.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-email-endpoint | send-device-otp/route.ts | New server-to-email path via Resend; depends on RESEND_API_KEY env var being set and valid |
| threat_flag: timing-sensitive-endpoint | verify-device-otp/route.ts | Brute force target — mitigated by 50ms floor, attempt_count pre-increment, and 3-attempt lockout |

## Commits

| Hash | Description |
|------|-------------|
| `5b7c8d7` | feat(02-02): add OTP utility and device fingerprint generator |
| `17dd47c` | feat(02-02): add device_otps migration with RLS service_role policy |
| `ff66163` | feat(02-02): add device trust API routes (check, send-otp, verify-otp) |
| `bca6f26` | feat(02-02): add DeviceTrustModal and integrate device check into login flow |

## Self-Check

Files verified present:
- `src/lib/otp.ts` — FOUND
- `src/lib/device-fingerprint.ts` — FOUND
- `supabase/migrations/20240101000005_device_otps.sql` — FOUND
- `src/app/api/auth/check-device/route.ts` — FOUND
- `src/app/api/auth/send-device-otp/route.ts` — FOUND
- `src/app/api/auth/verify-device-otp/route.ts` — FOUND
- `src/components/auth/DeviceTrustModal.tsx` — FOUND
- `src/app/auth/login/page.tsx` — FOUND (modified)

TypeScript: `tsc --noEmit` — PASSED (0 errors)

## Self-Check: PASSED
