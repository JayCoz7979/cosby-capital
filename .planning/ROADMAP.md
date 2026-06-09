# Roadmap: Cosby Capital

## Overview

Building Cosby Capital from a secure Next.js foundation through 18 autonomous AI agents, full client dashboard, revenue features, and scale intelligence — in 7 phases totaling ~360 dev-days.

## Phases

- [ ] **Phase 1: Security + Infrastructure Foundation** - Hacker-proof Next.js scaffold, all security configs, shared utilities, Supabase migrations
- [ ] **Phase 2: Authentication + Onboarding** - Supabase Auth with 2FA, device fingerprint, 6-step onboarding wizard, KYB/OFAC, e-signature, Stripe
- [ ] **Phase 3: Agent Infrastructure + Core Agents** - Shared agent utilities, 5 core agents on Railway, no public domains
- [ ] **Phase 4: Client Dashboard** - Grants, lenders, credit, approvals, documents, notifications dashboard
- [ ] **Phase 5: Landing Page + Admin + Launch Prep** - Public site, admin panel, pen test readiness, go-live
- [ ] **Phase 6: Revenue Features** - Grant writing, lender intros, fee collection, all funding tracks
- [ ] **Phase 7: Scale + Intelligence** - Credit repair, social engine, BI reporting, white-label, community

## Phase Details

### Phase 1: Security + Infrastructure Foundation
**Goal**: Hacker-proof Next.js 15.5.18 foundation — all security configs, shared utilities, Supabase migration system, GitHub security workflows. Zero critical npm audit findings. All tables have RLS verified.
**Depends on**: Nothing (first phase)
**Success Criteria** (what must be TRUE):
  1. `npm audit --audit-level=high` returns zero findings
  2. All Supabase tables have RLS enabled + policies in same migration file
  3. next.config.js security headers score A+ on securityheaders.com
  4. No API keys or secrets in any NEXT_PUBLIC_ env vars
  5. All shared utilities exist: lib/logger.ts, lib/sanitize.ts, lib/auth.ts, lib/validate.ts, lib/api-error.ts
  6. middleware.ts covers all routes, returns 404 (not 403) for admin on non-allowlisted IPs
**Plans**: 4 plans

Plans:
- [x] 01-01: Project scaffold — package.json, tsconfig, Tailwind, PostCSS, next.config.js with full security headers
- [x] 01-02: GitHub security files — workflows (security, CodeQL, SBOM, Supabase, trust-check, version-gate), PR template, dependabot, security.txt, vercel.json
- [x] 01-03: Supabase migrations — initial schema, RLS policies, security tables (trusted_devices, processed_webhook_events, active_sessions, deletion_requests, admin_audit_log, platform_settings, api_keys, exploit_chains)
- [x] 01-04: Shared security utilities + middleware — lib/logger.ts, lib/sanitize.ts, lib/auth.ts, lib/validate.ts, lib/api-error.ts, lib/supabase.ts, middleware.ts, src/app layout

### Phase 2: Authentication + Onboarding
**Goal**: Secure user registration through paid subscription activation with full compliance.
**Depends on**: Phase 1
**Success Criteria** (what must be TRUE):
  1. User can register, verify email, and log in with 2FA (TOTP)
  2. New device triggers OTP verification (device fingerprint protection)
  3. All 6 onboarding steps complete with KYB, OFAC screening, and consulting agreement e-signature
  4. Stripe subscription activates correctly for all 4 tiers (monthly + annual)
  5. PCI SAQ A documentation complete
**Plans**: 5 plans

Plans:
- [ ] 02-01: Supabase Auth setup + auth pages (login, signup with Turnstile, forgot-password, verify-email)
- [ ] 02-02: Device fingerprint + trusted_devices + OTP flow
- [ ] 02-03: 6-step onboarding wizard (basics → goals → flags → KYB/OFAC → e-signature → Stripe)
- [ ] 02-04: SignatureModal component + execute-signature edge function + PDF generation
- [ ] 02-05: Stripe billing — 4 tiers × 2 periods, webhook handler, customer portal

### Phase 3: Agent Infrastructure + Core Agents
**Goal**: 5 core agents deployed on Railway with no public HTTP domains, circuit breakers, shared utilities.
**Depends on**: Phase 1
**Success Criteria** (what must be TRUE):
  1. All 5 core agents deployed with no public domain (Supabase-only communication)
  2. Agent 14 (healthcheck) deployed and monitoring all other agents
  3. All agents use sanitizeForPrompt(), scanOutputConfidentiality(), Zod validation, circuit breaker
  4. Agent emails require client_approved=true before sending
**Plans**: TBD

### Phase 4: Client Dashboard
**Goal**: Full client dashboard with grants, lenders, credit, approvals, documents, and realtime notifications.
**Depends on**: Phase 2, Phase 3
**Success Criteria** (what must be TRUE):
  1. Client can view grant matches sorted by score with filter + search
  2. Client can request lender introductions via approval queue
  3. Client can upload/download documents (virus scan, MIME verify, signed URL with ownership check)
  4. Realtime notifications work with client_id filter
  5. Funding Readiness Score visible on dashboard
**Plans**: TBD

### Phase 5: Landing Page + Admin + Launch Prep
**Goal**: Public site live, admin panel secured, all Tier 1 security issues resolved, go-live ready.
**Depends on**: Phase 2, Phase 3, Phase 4
**Success Criteria** (what must be TRUE):
  1. Landing page live with pre-qual estimator, VAPI widget, and all legal pages
  2. Admin panel accessible only from allowlisted IPs (returns 404 otherwise)
  3. SSL Labs A+, securityheaders.com A+, DMARC p=reject verified
  4. All 75 pen test readiness checklist items pass
  5. npm audit zero critical/high
**Plans**: TBD

### Phase 6: Revenue Features
**Goal**: Grant writing, lender intros, fee collection, and all 15 funding tracks live.
**Depends on**: Phase 5
**Success Criteria** (what must be TRUE):
  1. Grant writing flow complete with quality scoring and version history
  2. Fee collection with dunning (Agent 16) operational
  3. At least 10 funding tracks implemented
**Plans**: TBD

### Phase 7: Scale + Intelligence
**Goal**: Credit repair, social marketing, BI reporting, white-label, community — full platform at scale.
**Depends on**: Phase 6
**Success Criteria** (what must be TRUE):
  1. All 18 agents deployed and operational
  2. Load test passes (100 concurrent users, all scenarios)
  3. Full end-to-end test: signup → onboarding → agents → matches → approval → intro → funded → fee collected
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security + Infrastructure Foundation | 1/4 | In progress | - |
| 2. Authentication + Onboarding | 0/5 | Not started | - |
| 3. Agent Infrastructure + Core Agents | 0/TBD | Not started | - |
| 4. Client Dashboard | 0/TBD | Not started | - |
| 5. Landing Page + Admin + Launch Prep | 0/TBD | Not started | - |
| 6. Revenue Features | 0/TBD | Not started | - |
| 7. Scale + Intelligence | 0/TBD | Not started | - |
