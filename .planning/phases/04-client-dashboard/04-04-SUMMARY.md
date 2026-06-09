---
phase: 04-client-dashboard
plan: "04"
subsystem: client-dashboard
tags: [documents, upload, download, signed-url, ownership, confirm-dialog, empty-state, feature-gate, virus-scan]
dependency_graph:
  requires:
    - 04-01 (DashboardShell, feature-gates, route page stubs)
  provides:
    - POST /api/dashboard/documents/upload (MIME + size + hash + ClamAV + storage insert)
    - GET /api/dashboard/documents/download/[id] (signed URL, 50ms ownership check)
    - DELETE /api/dashboard/documents/[id] (50ms ownership check, storage + DB removal)
    - ConfirmDialog component (Radix Dialog, focus-safe, ESC closes)
    - EmptyState component (heading/body/optional CTA)
    - DocumentUploader component (5-state machine, gold progress bar)
    - DocumentRow component (signed URL download, ConfirmDialog delete)
    - /dashboard/documents page fully wired with real data
  affects:
    - SC-4-3: document upload/download with MIME verify, signed URL, ownership check
    - Plans 04-05/04-06 (can reuse ConfirmDialog and EmptyState)
tech_stack:
  added:
    - src/app/api/dashboard/documents/ (3 new route files)
    - src/components/ui/ConfirmDialog.tsx (new shared UI component)
    - src/components/ui/EmptyState.tsx (new shared UI component)
    - src/components/dashboard/DocumentUploader.tsx (new dashboard component)
    - src/components/dashboard/DocumentRow.tsx (new dashboard component)
    - src/app/dashboard/documents/DocumentsPageClient.tsx (new client wrapper)
  patterns:
    - 50ms minimum ownership delay replicated manually (client_documents joins through clients.user_id, not user_id directly)
    - Supabase joined relation cast via unknown (same pattern as Plan 04-03)
    - ClamAV webhook optional — skipped if CLAMAV_WEBHOOK_URL not set (dev mode)
    - SHA-256 hash via crypto.subtle.digest (Web Crypto API — no Node.js dep)
    - Server component passes initialDocs to 'use client' wrapper (DocumentsPageClient)
    - Signed URL download via anchor element with download attribute — never exposes raw storage path
key_files:
  created:
    - src/app/api/dashboard/documents/upload/route.ts
    - src/app/api/dashboard/documents/download/[id]/route.ts
    - src/app/api/dashboard/documents/[id]/route.ts
    - src/components/ui/ConfirmDialog.tsx
    - src/components/ui/EmptyState.tsx
    - src/components/dashboard/DocumentUploader.tsx
    - src/components/dashboard/DocumentRow.tsx
    - src/app/dashboard/documents/DocumentsPageClient.tsx
  modified:
    - src/app/dashboard/documents/page.tsx (placeholder replaced with full implementation)
decisions:
  - client_documents uses client_id (not user_id) — ownership check joins through clients table; 50ms delay applied manually (verifyOwnership cannot be used directly)
  - Supabase joined relation (clients!inner) inferred as array type by TS; cast via unknown intermediary (safe — runtime is single object for FK join)
  - ClamAV scan is optional: if CLAMAV_WEBHOOK_URL not set, scan step is skipped (dev mode); file is removed from storage if scan returns clean=false or scan request fails
  - Dialog.Header does not exist in @radix-ui/react-dialog@1.0.5 — replaced with plain div wrapper
  - ConfirmDialog confirm button has no autoFocus; cancel button renders first and is the natural Tab target
  - DocumentsPageClient (use client) manages docs array; server component passes initialDocs; upload prepends, delete removes by id
metrics:
  duration: "~25 minutes"
  completed: "2026-06-09"
  tasks_completed: 2
  files_created: 8
  files_modified: 1
---

# Phase 4 Plan 04: Document Portal Summary

Full document portal with drag-and-drop uploader (5-state machine), signed-URL download, ownership-checked delete, ConfirmDialog, EmptyState, and three API routes enforcing MIME validation, 10MB limit, SHA-256 hashing, optional ClamAV scan, and 50ms minimum ownership delay.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create document API routes — upload POST, download GET, delete DELETE | 67b3069 | src/app/api/dashboard/documents/upload/route.ts, download/[id]/route.ts, [id]/route.ts |
| 2 | Build ConfirmDialog, EmptyState, DocumentUploader, DocumentRow + wire documents page | 8c6f65c | ConfirmDialog.tsx, EmptyState.tsx, DocumentUploader.tsx, DocumentRow.tsx, DocumentsPageClient.tsx, documents/page.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Supabase joined-relation type mismatch in ownership check routes**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `clients!inner(user_id)` inferred as `{ user_id: any }[]` (array) by Supabase TS types, but ownership check casts to `{ user_id: string }` (single object). TS2352 error on both download and delete routes.
- **Fix:** Cast via `unknown` intermediary (`as unknown as { user_id: string } | null`) — same pattern established in Plan 04-03. Runtime type is correct (FK join returns single object).
- **Files modified:** download/[id]/route.ts, [id]/route.ts
- **Commit:** 67b3069

**2. [Rule 1 - Bug] Dialog.Header does not exist in @radix-ui/react-dialog@1.0.5**
- **Found during:** Task 2 TypeScript verification
- **Issue:** TS2339 — `Dialog.Header` is not exported by the installed version of the package.
- **Fix:** Replaced `<Dialog.Header>` wrapper with a plain `<div>`. Title and Description still use Radix primitives (Dialog.Title, Dialog.Description).
- **Files modified:** src/components/ui/ConfirmDialog.tsx
- **Commit:** 8c6f65c

## Threat Model Compliance

| Threat ID | Status |
|-----------|--------|
| T-04-04-01 | Mitigated — MIME type checked against ALLOWED_MIMES allowlist; extension checked as secondary gate; SHA-256 hash computed server-side |
| T-04-04-02 | Mitigated — file.size checked against 10485760 before storage upload; 400 returned immediately |
| T-04-04-03 | Mitigated — ownership check with 50ms minimum delay on both download and delete routes; 404 (not 403) on failure |
| T-04-04-04 | Mitigated — download route returns `{ url: signed.signedUrl }` only; raw storage path never sent to browser |
| T-04-04-05 | Mitigated — canUploadDocuments() checked server-side in upload route; 403 returned for Starter tier; frontend gate is UX-only |

## Known Stubs

None — plan goal fully achieved. The /dashboard/documents page renders live data from the database. The "Loading documents…" placeholder from Plan 04-01 has been replaced.

## Self-Check: PASSED

Files verified:
- src/app/api/dashboard/documents/upload/route.ts: exists, exports POST
- src/app/api/dashboard/documents/download/[id]/route.ts: exists, exports GET
- src/app/api/dashboard/documents/[id]/route.ts: exists, exports DELETE
- src/components/ui/ConfirmDialog.tsx: exists, exports ConfirmDialog
- src/components/ui/EmptyState.tsx: exists, exports EmptyState
- src/components/dashboard/DocumentUploader.tsx: exists, exports DocumentUploader
- src/components/dashboard/DocumentRow.tsx: exists, exports DocumentRow
- src/app/dashboard/documents/DocumentsPageClient.tsx: exists, exports DocumentsPageClient
- src/app/dashboard/documents/page.tsx: placeholder replaced, imports DocumentsPageClient
- Commits 67b3069, 8c6f65c: present in git log
- npx tsc --noEmit: zero errors
