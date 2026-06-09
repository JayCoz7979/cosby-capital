---
id: 02-05
phase: 2
plan: 5
status: complete
completed_at: 2026-06-09
---

# Summary: Plan 02-05 — Stripe Billing

## What Was Built

**DB Migration (000009):**
- `supabase/migrations/20240101000009_stripe_tables.sql` — Stripe columns on clients (stripe_customer_id, stripe_subscription_id, subscription_current_period_end, subscription_cancel_at_period_end), fee_invoices table with RLS

**Stripe Client:**
- `src/lib/stripe.ts` — singleton Stripe instance (server-only guard), PRICE_IDS map from env vars, getPriceId(), getTierFromPriceId() helpers

**API Routes:**
- `src/app/api/stripe/create-checkout/route.ts` — Checkout session for 4 tiers × 2 billing periods
- `src/app/api/stripe/create-portal-session/route.ts` — Billing portal session
- `src/app/api/stripe/subscription-status/route.ts` — Returns tier/status from clients table
- `src/app/api/webhooks/stripe/route.ts` — Production webhook handler

**Config:**
- `middleware.ts` — Subscription tier feature gates for premium dashboard routes
- `.env.example` — Stripe env vars documented (8 price IDs + webhook secret + publishable key)
- `docs/pci-notes.md` — SAQ A compliance notes

**Integration:**
- `src/app/onboarding/step-6/page.tsx` — Wired to Stripe checkout via create-checkout route

## Security Requirements Met

- [x] Webhook: `stripe.webhooks.constructEvent()` is FIRST operation (S6-001)
- [x] Idempotency: `processed_webhook_events` upsert with `onConflict: 'stripe_event_id'` (S14-009)
- [x] Raw body never logged anywhere (PCI compliance)
- [x] 5 event types allowlisted — all others silently ignored
- [x] `src/lib/stripe.ts` has `'server-only'` import guard
- [x] Webhook route excluded from JWT middleware (public webhook path)
- [x] STRIPE_SECRET_KEY only in server-side env vars
- [x] Tier gates redirect to /dashboard?upgrade=true (not 403)

## Phase 2 Status

All 5 plans complete. Phase 2 — Authentication + Onboarding is done.
