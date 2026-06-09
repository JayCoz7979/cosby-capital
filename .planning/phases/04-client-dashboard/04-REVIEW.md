---
phase: 04-client-dashboard
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - src/app/api/dashboard/approvals/route.ts
  - src/app/api/dashboard/credit/route.ts
  - src/app/api/dashboard/documents/[id]/route.ts
  - src/app/api/dashboard/documents/download/[id]/route.ts
  - src/app/api/dashboard/documents/upload/route.ts
  - src/app/api/dashboard/grants/route.ts
  - src/app/api/dashboard/lender-intro/route.ts
  - src/app/api/dashboard/lenders/route.ts
  - src/app/api/dashboard/notifications/route.ts
  - src/app/api/dashboard/overview/route.ts
  - src/app/dashboard/approvals/ApprovalsPageClient.tsx
  - src/app/dashboard/approvals/page.tsx
  - src/app/dashboard/credit/page.tsx
  - src/app/dashboard/documents/DocumentsPageClient.tsx
  - src/app/dashboard/documents/page.tsx
  - src/app/dashboard/grants/page.tsx
  - src/app/dashboard/layout.tsx
  - src/app/dashboard/lenders/page.tsx
  - src/app/dashboard/notifications/NotificationsPageClient.tsx
  - src/app/dashboard/notifications/page.tsx
  - src/app/dashboard/page.tsx
  - src/components/dashboard/ApprovalStatusPill.tsx
  - src/components/dashboard/DashboardShell.tsx
  - src/components/dashboard/DocumentRow.tsx
  - src/components/dashboard/DocumentUploader.tsx
  - src/components/dashboard/FundingReadinessScore.tsx
  - src/components/dashboard/GrantMatchCard.tsx
  - src/components/dashboard/GrantMatchList.tsx
  - src/components/dashboard/LenderIntroCard.tsx
  - src/components/dashboard/NotificationContext.tsx
  - src/components/dashboard/NotificationFeed.tsx
  - src/components/dashboard/SearchFilterBar.tsx
  - src/components/dashboard/Sidebar.tsx
  - src/components/dashboard/TopNav.tsx
  - src/components/ui/ConfirmDialog.tsx
  - src/components/ui/EmptyState.tsx
  - src/lib/feature-gates.ts
  - supabase/migrations/20240101000011_notifications.sql
  - tailwind.config.ts
findings:
  critical: 5
  warning: 8
  info: 4
  total: 17
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-06-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

This review covers the full Phase 4 client dashboard implementation: 10 API routes, 8 page components, 11 dashboard UI components, 2 utility components, the feature-gates library, a migration, and Tailwind config. The authentication and ownership-verification patterns are generally solid — IDOR protections are present on the sensitive routes. However, five blockers were found spanning a logic bug in the rejection flow, a ClamAV race condition that can leave orphaned malware in storage, a stored-XSS vector in the notification action_url, a grant filter bypass that leaks other clients' data, and a dangerous stale-closure in GrantMatchList. Eight quality/robustness warnings round out the report.

---

## Critical Issues

### CR-01: Reject action writes `client_approved: false` — identical to the unactioned state

**File:** `src/app/api/dashboard/approvals/route.ts:163-166`
**Issue:** The PATCH handler builds `updatePayload` for both `approve` and `reject`. The `approve` branch correctly sets `client_approved: true`. The `reject` branch sets `client_approved: false` — which is the same value already stored in the record (the GET query filters on `client_approved = false`). A rejected item therefore remains visible in the queue and can be re-submitted to the server indefinitely. Nothing distinguishes a "rejected" record from an "untouched" one. Downstream agents consuming `client_approved` will treat rejected emails as still-pending.

**Fix:** Add a separate boolean column `client_rejected` (or use a `client_approval_status` enum), or at minimum set a distinguishing field on rejection. Quick mitigation without a migration:

```typescript
const updatePayload =
  action === 'approve'
    ? { client_approved: true,  client_approved_at: new Date().toISOString() }
    : { client_approved: false, client_rejected: true, client_approved_at: new Date().toISOString() }
```

Then add `.eq('client_rejected', false)` to the GET filter query (line 66) so rejected items no longer appear.

---

### CR-02: ClamAV scan executes after the file is already in storage — infected file is live during the scan window

**File:** `src/app/api/dashboard/documents/upload/route.ts:128-153`
**Issue:** The upload route first stores the file in Supabase Storage (line 118-125), then conditionally calls ClamAV (line 128). During the interval between storage write and scan completion, the file is publicly accessible to anyone with a signed URL. If the scan request throws (network error, timeout) the cleanup path runs, but any window where a separate request fetches a signed URL for the newly-uploaded path will return the malicious file. The correct pattern is: scan the in-memory `buffer` before touching storage.

Additionally, if `CLAMAV_WEBHOOK_URL` is set but the scan service returns a non-JSON body (e.g. a 500 HTML page), `scanRes.json()` throws and the catch block removes the file — but the catch block itself does not guard against a second storage-remove failure, potentially leaving orphaned files.

**Fix:** Move the ClamAV block above the Supabase Storage upload:

```typescript
// ── ClamAV virus scan (before storage upload) ─────────────────────────────
if (process.env.CLAMAV_WEBHOOK_URL) {
  try {
    const scanRes = await fetch(process.env.CLAMAV_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
    })
    const scanResult = (await scanRes.json()) as { clean: boolean }
    if (scanResult.clean === false) {
      return NextResponse.json({ error: 'File blocked by security scanner.' }, { status: 422 })
    }
  } catch (scanErr) {
    logger.error('documents/upload: ClamAV scan failed', scanErr)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

// ── Upload to Supabase Storage ────────────────────────────────────
const { data: storageData, error: storageError } = await serviceClient.storage
  .from('client-documents')
  .upload(storagePath, buffer, { contentType: file.type, upsert: false })
```

---

### CR-03: Unsanitized `action_url` from the database rendered as a Next.js `<Link href>` — stored XSS / open redirect

**File:** `src/components/dashboard/NotificationFeed.tsx:179-183`
**Issue:** `n.action_url` is fetched from the `notifications` table and rendered directly as the `href` prop of a `<Link>` element with no validation. Any admin or background process that inserts a notification with `action_url = 'javascript:alert(1)'` (or similar) will execute arbitrary JavaScript in the client's browser when the link is clicked. Even without a malicious actor, a misconfigured agent inserting an absolute external URL could silently redirect users away from the application domain.

The `notifications` table has no CHECK constraint on `action_url` format (migration line 14 defines it as bare `text`).

**Fix:** Validate `action_url` before rendering. Use a server-side allowlist pattern and/or sanitize on the client:

```typescript
// In NotificationFeed.tsx — validate before render
function isSafeActionUrl(url: string | null): boolean {
  if (!url) return false
  // Only allow relative paths or same-origin absolute URLs
  try {
    if (url.startsWith('/')) return true
    const parsed = new URL(url)
    return parsed.origin === window.location.origin
  } catch {
    return false
  }
}

// In JSX:
{n.action_url && isSafeActionUrl(n.action_url) && (
  <Link href={n.action_url} ...>View details</Link>
)}
```

Also add a `CHECK (action_url IS NULL OR action_url ~ '^/')` constraint to the migration to enforce server-side storage of relative paths only.

---

### CR-04: Grant `grantor_type` filter uses PostgREST foreign-table filter — does not filter rows, returns all rows with `grants = null`

**File:** `src/app/api/dashboard/grants/route.ts:87`
**Issue:** The filter is applied as:
```typescript
query = query.filter('grants.grantor_type', 'eq', typeParam)
```
In Supabase PostgREST, filtering on a joined table column with `.filter()` does not exclude parent rows — it NULLs out the join when the condition fails. The result is that all `grant_matches` rows for the client are returned regardless of `grantor_type`, with `grants: null` on non-matching rows. The frontend receives rows with `null` grant data and renders them as "Unknown Grant", leaking the count of all matches regardless of the selected filter. Pagination (`total_count`) is also wrong because it counts all rows.

**Fix:** Use an inner join filter via the embedded resource syntax, or apply the filter on a column that exists on `grant_matches` directly (e.g. store `grantor_type` denormalized), or use a PostgREST `!inner` join:

```typescript
let query = serviceClient
  .from('grant_matches')
  .select(
    'id, match_score, ..., grants!inner(id, name, grantor, grantor_type, ...)',
    { count: 'exact' }
  )
  .eq('client_id', client.id)
  .order(orderColumn, { ascending })
  .range(rangeFrom, rangeTo)

if (typeParam && typeParam !== 'all') {
  query = query.eq('grants.grantor_type', typeParam)
}
```

The `!inner` qualifier ensures rows without a matching grant are excluded, and the `.eq()` on the joined table works correctly with an inner join.

---

### CR-05: Stale closure in `GrantMatchList.handleFilter` and `handleSort` — pagination state diverges from server state

**File:** `src/components/dashboard/GrantMatchList.tsx:69-85`
**Issue:** Both `handleFilter` and `handleSort` are wrapped in `useCallback` with intentional dependency suppression (`eslint-disable-next-line react-hooks/exhaustive-deps`). `handleFilter` closes over `sortOrder` from its creation render; `handleSort` closes over `filterType`. If the user changes both filter and sort in quick succession, the second callback fires with a stale value of the complementary state and sends the wrong parameters to the API. For example: user clicks "State" filter (triggering a fetch with `type=state, sort=score_desc`), then immediately clicks "Score Ascending" — `handleSort` was created before the filter was updated and fires with `filterType='all'` instead of `filterType='state'`, requesting the wrong data set.

The `eslint-disable` comments acknowledge this is known but the suppression is incorrect — the fix is to use `useRef` for the current values or use `setState` functional updaters.

**Fix:** Lift the current filter/sort into refs so callbacks always read current values:

```typescript
const filterTypeRef = React.useRef(filterType)
const sortOrderRef = React.useRef(sortOrder)

// Update refs on state change
useEffect(() => { filterTypeRef.current = filterType }, [filterType])
useEffect(() => { sortOrderRef.current = sortOrder }, [sortOrder])

const handleFilter = useCallback((type: string) => {
  setFilterType(type)
  fetchMatches(0, type, sortOrderRef.current)
}, []) // fetchMatches should also be stable via useCallback or useRef

const handleSort = useCallback((sort: string) => {
  setSortOrder(sort)
  fetchMatches(0, filterTypeRef.current, sort)
}, [])
```

---

## Warnings

### WR-01: `approvals/route.ts` PATCH — `update` not scoped to `client_id`, relies only on prior ownership check

**File:** `src/app/api/dashboard/approvals/route.ts:168-172`
**Issue:** The ownership check (lines 146-160) verifies the row belongs to the client before the update. The update itself (lines 168-171) is issued as `.eq('id', id)` only — without `.eq('client_id', client.id)`. If there is any TOCTOU window (unlikely with a service client, but still a defense-in-depth gap) the update could touch a row the client doesn't own. A compromised `id` variable between the two operations would bypass the ownership gate.

**Fix:** Add the client_id scope to the update query:
```typescript
const { error: updateError } = await serviceClient
  .from('agent_emails')
  .update(updatePayload)
  .eq('id', id)
  .eq('client_id', client.id)  // defense-in-depth
```

---

### WR-02: `lender-intro/route.ts` — duplicate-intro check does not scope by `lender_id`, blocks all lenders after first request

**File:** `src/app/api/dashboard/lender-intro/route.ts:106-119`
**Issue:** The existing-intro query checks:
```typescript
.eq('client_id', client.id)
.eq('email_type', 'lender_intro')
.eq('requires_admin_approval', true)
```
This finds *any* lender intro email for this client — not one for the specific lender being requested. After a client requests an introduction to their first lender, every subsequent intro request for any other lender returns 409. The page-level comment in `lenders/page.tsx` (line 62-66) acknowledges this bug and defers a fix to a future plan ("store lender_id in agent_emails metadata"), but the API returns a misleading 409 "Introduction already requested for this lender" error message that is factually incorrect for the second+ lender.

**Fix:** Either (a) store `lender_id` on the `agent_emails` row at insert time and scope the duplicate check to that lender, or (b) return a more accurate error message ("An introduction is already pending for your account") until the schema is fixed. Option (a) is the correct long-term fix:

```typescript
// In the insert (line 132), add:
lender_id: lenderMatch.lender_id,

// In the duplicate check (line 108), add:
.eq('lender_id', lenderMatch.lender_id)
```

---

### WR-03: `DocumentUploader.tsx` — `res.json()` called after the response body has already been consumed in the scanning state

**File:** `src/components/dashboard/DocumentUploader.tsx:95-103`
**Issue:** When the upload succeeds:
1. Line 95: `setUploadProgress(100)`
2. Line 96: `setUploadState('scanning')`
3. Line 99: `await new Promise(r => setTimeout(r, 1500))` — waits 1.5 seconds
4. Line 101: `setUploadState('complete')`
5. Line 103: `const doc = (await res.json()) as UploadedDoc`

The `fetch` response body stream can only be read once. After the 1.5-second delay, the response object's body stream may have already been closed by the browser's garbage collector or the response's `bodyUsed` flag will be `true` if it was partially consumed. More critically, the UI transitions to "complete" state (line 101) *before* calling `res.json()` (line 103) and `onUploadComplete(doc)` (line 104). If `res.json()` fails, the UI shows "complete" but the parent list never receives the new document — the document appears to have been uploaded but doesn't show in the list until page refresh.

**Fix:** Parse the response body *before* the artificial scanning delay:

```typescript
setUploadProgress(100)
setUploadState('scanning')
const doc = (await res.json()) as UploadedDoc  // parse immediately while body is fresh

// Simulate scan delay
await new Promise((r) => setTimeout(r, 1500))

setUploadState('complete')
onUploadComplete(doc)
```

---

### WR-04: `notifications/route.ts` PATCH — `ids` array elements are not validated as UUIDs before being passed to `.in()`

**File:** `src/app/api/dashboard/notifications/route.ts:148-166`
**Issue:** The PATCH handler validates that `ids` is a non-empty array but does not validate the type or format of individual elements. The cast `ids as string[]` on line 158 assumes all elements are strings. A request body like `{ "ids": [1, 2, 3] }` or `{ "ids": ["'; DROP TABLE notifications;--"] }` passes validation. While Supabase's PostgREST client uses parameterized queries (preventing SQL injection), a non-string element will cause a runtime type error at the database layer that will surface as an unhandled 500 rather than a clean 400.

**Fix:** Validate each element is a UUID-formatted string:

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string' && UUID_RE.test(id))) {
  return NextResponse.json({ error: 'ids must be a non-empty array of UUIDs' }, { status: 400 })
}
```

---

### WR-05: `documents/page.tsx` — auth failure redirects to `/login` instead of `/auth/login`

**File:** `src/app/dashboard/documents/page.tsx:28`
**Issue:** The session check on line 27-29 redirects to `/login`, but all other pages in this codebase redirect to `/auth/login`. The `layout.tsx` redirects to `/auth/login?redirect=/dashboard`. The `/login` route likely does not exist and will produce a 404, leaving the user on a broken page rather than the login flow.

**Fix:**
```typescript
redirect('/auth/login?redirect=/dashboard/documents')
```

---

### WR-06: Score computation is duplicated verbatim in two files with no shared source of truth

**File:** `src/app/dashboard/page.tsx:19-94` and `src/app/api/dashboard/overview/route.ts:28-112`
**Issue:** The three functions `scoreTierLabel`, `computeScore`, and `buildScoreFactors` are copy-pasted identically between the dashboard page server component and the overview API route. When scoring logic changes (e.g., adding a new credit bracket or a new factor), both files must be updated. The comment in `page.tsx` line 17 acknowledges this: "mirrors route.ts logic — kept in sync". Copy-paste synchronization is a reliability failure waiting to happen.

**Fix:** Extract to a shared module, e.g. `src/lib/funding-score.ts`, and import from both locations.

---

### WR-07: `EmptyState` renders a `<Button onClick>` inside a component declared without `'use client'` — will crash in server context

**File:** `src/components/ui/EmptyState.tsx:51-53`
**Issue:** `EmptyState` has no `'use client'` directive and is described in the JSDoc as "renders as a server component." However, when `cta.onClick` is provided (without `cta.href`), it renders:
```tsx
<Button variant="primary" onClick={cta.onClick}>
```
Passing an `onClick` handler is a client-only operation. If `EmptyState` is rendered in a server component with an `onClick` CTA, Next.js will throw at runtime: "Event handlers cannot be passed to Client Component props." The component is used with `onClick` in `DocumentsPageClient.tsx` (a client component), which works today. But the false labeling as "server component" will mislead future developers who attempt to use the `onClick` variant from a server component.

**Fix:** Add `'use client'` to `EmptyState.tsx`, or split into two components (`EmptyStateServer` with href-only CTA, `EmptyStateClient` with onClick support).

---

### WR-08: `ConfirmDialog` — `onConfirm()` is called before `onOpenChange(false)`, causing dialog to remain open if `onConfirm` throws

**File:** `src/components/ui/ConfirmDialog.tsx:81-84` and `src/components/ui/ConfirmDialog.tsx:98-102`
**Issue:** Both the destructive and default confirm buttons call `onConfirm()` then `onOpenChange(false)`. If `onConfirm` is an async function that throws (as `handleConfirmDelete` in `DocumentRow.tsx` can — it catches internally, but callers are not guaranteed to), `onOpenChange(false)` never executes and the dialog stays open. Additionally, `DocumentRow.handleConfirmDelete` is async but `ConfirmDialog.onConfirm` is typed as `() => void`, so the async nature is silently discarded — the dialog closes before the delete completes.

**Fix:** Make `onConfirm` typed as `() => void | Promise<void>` and wrap the call:

```typescript
onClick={async () => {
  await onConfirm()
  onOpenChange(false)
}}
```

Also add a loading state to the confirm button to prevent double-clicks during the async operation.

---

## Info

### IN-01: `feature-gates.ts` — `canRequestLenderIntro` and `canUploadDocuments` accept `SubscriptionTier` but callers cast `string` without validation

**File:** `src/lib/feature-gates.ts:26-44`
**Issue:** The feature-gate functions have type signatures accepting `SubscriptionTier`, but several API routes cast the raw database value without checking validity: `client.subscription_tier as SubscriptionTier` (upload route line 68), or pass it directly. If the database contains an unexpected tier string (e.g., a legacy value or typo), `PAID_TIERS.includes(tier)` silently returns `false` — denying access. This is safe-to-fail but could produce confusing support tickets for valid paying customers.

**Fix:** Add a runtime guard or a type assertion helper:
```typescript
function isValidTier(t: unknown): t is SubscriptionTier {
  return ['starter', 'growth', 'capital_partner', 'done_for_you'].includes(t as string)
}
```

---

### IN-02: `notifications` migration — partial index on `read = false` will become stale as notifications are marked read

**File:** `supabase/migrations/20240101000011_notifications.sql:21-22`
**Issue:** The partial index `WHERE read = false` optimizes unread queries but provides no benefit for read notification queries (e.g., fetching notification history in the feed). The API and feed both query all notifications ordered by `created_at`. A full index on `(client_id, created_at DESC)` would cover both the unread-count query and the history query.

**Fix:** Add a second index for the history query pattern:
```sql
CREATE INDEX idx_notifications_client_created ON notifications (client_id, created_at DESC);
```

---

### IN-03: `DocumentRow.tsx` — download failure shows `console.error` but no user-facing error state

**File:** `src/components/dashboard/DocumentRow.tsx:67-69`
**Issue:** When the download API call fails, the error is logged to the console but the user sees no feedback — the button simply stops spinning. The user doesn't know whether to retry.

**Fix:** Add an error state similar to `DocumentUploader`:
```typescript
const [downloadError, setDownloadError] = React.useState<string | null>(null)
// ...
if (!res.ok) {
  setDownloadError('Download failed. Please try again.')
  return
}
```

---

### IN-04: `lenders/page.tsx` — existing intro dedup marks ALL lenders as requested when ANY intro exists

**File:** `src/app/dashboard/lenders/page.tsx:64-67`
**Issue:** This is the page-level consequence of WR-02. The comment on line 62-66 correctly documents the problem and defers it. Flagging here for completeness so it appears in the review record alongside WR-02 as a paired fix target.

**Fix:** Address in conjunction with WR-02 — store `lender_id` on `agent_emails` rows and scope the dedup lookup per lender.

---

_Reviewed: 2026-06-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
