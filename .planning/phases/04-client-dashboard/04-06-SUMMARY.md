---
phase: 04-client-dashboard
plan: "06"
subsystem: client-dashboard
tags: [notifications, realtime, supabase-realtime, context, api-route, idor-prevention]
dependency_graph:
  requires:
    - 04-01 (DashboardShell, TopNav, notifications migration + RLS)
    - 04-04 (EmptyState component)
  provides:
    - GET /api/dashboard/notifications (full list + unread_count mode)
    - PATCH /api/dashboard/notifications (mark ids read + mark_all=true)
    - NotificationContext (unreadCount shared between TopNav and NotificationFeed)
    - NotificationFeed (Realtime subscription, reconnection banner, per-item mark-read)
    - NotificationsPageClient (Mark All Read, wraps NotificationFeed)
    - /dashboard/notifications fully wired with server-fetched initial data
    - TopNav bell gold dot driven by live context unreadCount
  affects:
    - SC-4-4: realtime notifications with client_id filter
    - TopNav unread badge now live (was static 0 in Plan 04-01)
tech_stack:
  added:
    - src/app/api/dashboard/notifications/route.ts (new API route)
    - src/components/dashboard/NotificationContext.tsx (new React context)
    - src/components/dashboard/NotificationFeed.tsx (new dashboard component)
    - src/app/dashboard/notifications/NotificationsPageClient.tsx (new client wrapper)
  patterns:
    - Supabase Realtime postgres_changes with client_id filter (SC-4-4)
    - React context (Dispatch<SetStateAction<number>>) for cross-component unread count
    - Server component fetches initial data → passes to 'use client' wrapper (same pattern as DocumentsPageClient)
    - IDOR prevention: all PATCH updates scoped to .eq('client_id', client.id)
    - Reconnection banner with role="status" (non-blocking inline, no push permission)
key_files:
  created:
    - src/app/api/dashboard/notifications/route.ts
    - src/components/dashboard/NotificationContext.tsx
    - src/components/dashboard/NotificationFeed.tsx
    - src/app/dashboard/notifications/NotificationsPageClient.tsx
  modified:
    - src/components/dashboard/DashboardShell.tsx (added NotificationContextProvider wrapper)
    - src/components/dashboard/TopNav.tsx (replaced local fetch with useNotificationContext)
    - src/app/dashboard/notifications/page.tsx (replaced placeholder with full server component)
decisions:
  - NotificationContext setUnreadCount typed as Dispatch<SetStateAction<number>> (not plain setter) to allow functional updaters in NotificationFeed Realtime callback
  - NotificationsPageClient manages notifications array state separately from NotificationFeed to support Mark All Read without prop-drilling; NotificationFeed receives initialNotifications from parent
  - clientId exposed to client component accepted (T-04-06-04) — RLS policy "notifs_own" enforces server-side isolation regardless of filter value
metrics:
  duration: "~20 minutes"
  completed: "2026-06-09"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 4 Plan 06: Realtime Notification System Summary

Realtime notification feed with Supabase postgres_changes subscription filtered by client_id, GET + PATCH API route with IDOR prevention, React context for live unread count on TopNav bell, reconnection banner, and full notification history page with mark-all-read.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create /api/dashboard/notifications GET + PATCH route | b6e899a | src/app/api/dashboard/notifications/route.ts |
| 2 | Build NotificationContext, NotificationFeed, notifications page + wire TopNav | 893476c | NotificationContext.tsx, NotificationFeed.tsx, DashboardShell.tsx, TopNav.tsx, NotificationsPageClient.tsx, notifications/page.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NotificationContext setUnreadCount typed as plain setter broke functional updaters**
- **Found during:** Task 2 TypeScript verification
- **Issue:** Context interface declared `setUnreadCount: (n: number) => void`. NotificationFeed's Realtime callback used `setUnreadCount((prev) => prev + 1)` — a functional updater — which TypeScript rejected (TS2345: argument of type `(prev: any) => any` not assignable to `number`).
- **Fix:** Changed context type to `setUnreadCount: React.Dispatch<React.SetStateAction<number>>`, matching the actual `useState` return type and accepting both direct values and functional updaters.
- **Files modified:** src/components/dashboard/NotificationContext.tsx
- **Commit:** 893476c

## Threat Model Compliance

| Threat ID | Status |
|-----------|--------|
| T-04-06-01 | Mitigated — Realtime channel filter `client_id=eq.${clientId}` + RLS policy "notifs_own" enforces server-side isolation |
| T-04-06-02 | Mitigated — all PATCH UPDATE queries scoped with `.eq('client_id', client.id)`; cannot mark another client's notifications read |
| T-04-06-03 | Mitigated — both GET and PATCH require valid session; 401 returned if missing; client_id resolved from auth.uid() only |
| T-04-06-04 | Accepted — clientId exposed to client component (needed for Realtime filter); RLS enforces server-side isolation regardless of filter value |

## Known Stubs

None — plan goal fully achieved. The /dashboard/notifications page renders live server-fetched data with Realtime updates. The "Loading notifications…" placeholder from Plan 04-01 has been replaced.

## Threat Flags

None — no new trust boundaries introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

Files verified:
- src/app/api/dashboard/notifications/route.ts: exists, exports GET and PATCH
- src/components/dashboard/NotificationContext.tsx: exists, exports NotificationContextProvider and useNotificationContext
- src/components/dashboard/NotificationFeed.tsx: exists, exports NotificationFeed
- src/app/dashboard/notifications/NotificationsPageClient.tsx: exists, exports NotificationsPageClient
- src/components/dashboard/DashboardShell.tsx: wraps content in NotificationContextProvider
- src/components/dashboard/TopNav.tsx: uses useNotificationContext (local fetch removed)
- src/app/dashboard/notifications/page.tsx: server component with serviceClient fetch + NotificationsPageClient
- Commits b6e899a, 893476c: present in git log
- npx tsc --noEmit: zero errors
