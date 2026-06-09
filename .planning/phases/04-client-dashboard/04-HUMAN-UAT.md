---
status: partial
phase: 04-client-dashboard
source: [04-VERIFICATION.md]
started: 2026-06-09T00:00:00.000Z
updated: 2026-06-09T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Auth guard redirect
expected: Visiting /dashboard while logged out redirects to /auth/login (or /login)
result: [pending]

### 2. FTC disclosure always visible
expected: The FTC paragraph ("Cosby Capital may receive compensation...") is visible on every LenderIntroCard in all states — idle, loading, success (Pending Review pill), and when upgrade prompt is shown
result: [pending]

### 3. Supabase migration push (SC-4-4 prerequisite)
expected: Run `supabase link --project-ref <ref> && supabase db push` to apply migration 000011 (notifications table + RLS). Without this, realtime notifications cannot be tested against a live database.
result: [pending]

### 4. Realtime notification delivery
expected: Insert a row into the notifications table (via Supabase Studio or SQL) with the correct client_id — row appears in the NotificationFeed without a page refresh, and the gold dot appears on the TopNav bell icon
result: [pending]

### 5. TopNav gold dot lifecycle
expected: Gold dot appears on bell icon when unread notifications > 0; clicking Mark All Read triggers PATCH mark_all=true and dot disappears
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
