---
phase: 2
plan: 4
subsystem: signature
tags: [signature, e-sign, pdf, edge-function, triple-storage, onboarding]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides: [signature-modal, execute-signature-edge-fn, consulting-agreement]
  affects: [onboarding-step-5, client-documents-storage]
tech_stack:
  added:
    - pdf-lib@1.17.1 (Deno esm.sh — generate-pdf edge function)
    - Dancing_Script (next/font/google — signature rendering)
  patterns:
    - IntersectionObserver for scroll enforcement
    - Unicode NFC normalization (homograph attack prevention)
    - AWS Signature V4 (manual implementation for Deno S3 uploads)
    - Google Drive service account JWT auth (Deno-compatible)
    - Server-side timestamp enforcement (E-SIGN Act compliance)
    - Triple-redundant storage with SHA-256 re-verification
key_files:
  created:
    - supabase/migrations/20240101000008_signature_tables.sql
    - src/lib/agreements/consulting-agreement.ts
    - src/components/signature/AgreementViewer.tsx
    - src/components/signature/CheckboxList.tsx
    - src/components/signature/SignatureModal.tsx
    - src/app/api/signature/execute/route.ts
    - src/app/api/onboarding/profile/route.ts
    - supabase/functions/execute-signature/index.ts
    - supabase/functions/generate-pdf/index.ts
  modified:
    - src/app/layout.tsx
    - src/app/onboarding/step-5/page.tsx
decisions:
  - pdf-lib over jsPDF: pdf-lib is a pure JS library with no Node.js dependencies, making it fully Deno-compatible via esm.sh; jsPDF has Node.js polyfill requirements
  - Dancing Script approximated in PDF with Helvetica-Oblique: embedding custom OTF in Deno edge function requires fetching font bytes at runtime; deferred to production TODO comment
  - storage_verified=true tied to Supabase Storage only: S3 and Drive are optional at dev time per plan instructions; verification gate is Supabase upload + SHA-256 re-download match
  - Profile API endpoint added as Rule 2 deviation: SignatureModal Step 3 requires owner_name for identity verification; no existing endpoint exposed this field
metrics:
  duration: ~45 minutes
  completed: "2026-06-09"
  tasks_completed: 9
  tasks_total: 9
  files_created: 9
  files_modified: 2
---

# Phase 2 Plan 4: SignatureModal Component + Execute-Signature Edge Function Summary

## One-liner

Full 6-step E-SIGN Act compliant signature flow: scroll-enforced agreement viewer, 7 acknowledgment checkboxes, Unicode NFC identity verification, Dancing Script signature preview, server-side audit hash, triple-redundant PDF storage (Supabase + S3 + Drive), and executed PDF email delivery.

## What Was Built

### DB Migration (Task 1)
`supabase/migrations/20240101000008_signature_tables.sql` creates the `signatures` table with:
- All audit fields: `signed_by_name`, `signed_by_email`, `signed_at` (server-side only), `signed_ip`, `device_fingerprint_hash`, `document_hash`, `audit_hash`, `document_text_snapshot`
- Triple storage paths: `supabase_path`, `s3_path`, `google_drive_file_id`, `storage_verified`
- Email delivery flags: `client_email_sent`, `admin_email_sent`
- RLS: clients read own rows; only `service_role` can INSERT
- Immutable SQL rules: `no_update_signatures` and `no_delete_signatures` (E-SIGN Act compliance)

### Consulting Agreement (Task 2)
`src/lib/agreements/consulting-agreement.ts` exports:
- `CONSULTING_AGREEMENT_TEXT`: complete 9-section agreement (Services, Success Fee Schedule, No Guarantee, Client Obligations, Limitation of Liability, Confidentiality, Termination, Dispute Resolution, General Provisions)
- Success fee schedule: 5% grants, 3% loans <$100K, 2% $100K–$500K, 1% $500K+
- `ACKNOWLEDGMENT_CHECKBOXES`: 7 required acknowledgments
- `computeDocumentHash()`: SHA-256 via Web Crypto API

### UI Components (Tasks 3–5)
- `AgreementViewer.tsx`: Scrollable viewer with IntersectionObserver bottom-sentinel, gold progress bar, "Scroll to read all" animated hint
- `CheckboxList.tsx`: 7 acknowledgment checkboxes with gold accent, keyboard accessible, `disabled` prop locks until scroll complete
- `SignatureModal.tsx`: Full 6-step modal — step state machine, NFC name comparison, Dancing Script preview via `--font-dancing` CSS variable, fingerprint capture, processing spinner, confirmation with signature ID

### API Route (Task 6)
`src/app/api/signature/execute/route.ts`:
- `signed_at` set exclusively server-side — client value is never accepted
- Unicode NFC normalization on both `signed_name` and `clients.owner_name`
- `audit_hash = SHA-256(document_hash + signed_name + signed_at + client_ip)`
- Minimum 50ms response time (S16-004)
- Delegates to `execute-signature` edge function with `INTERNAL_SERVICE_SECRET` header

### Edge Functions (Tasks 7–8)
`supabase/functions/execute-signature/index.ts`:
- Immutable DB insert, generate-pdf call, Supabase Storage upload (required), S3 upload (optional/graceful), Google Drive upload (optional/graceful)
- SHA-256 re-download verification from Supabase Storage before setting `storage_verified=true`
- Resend email with PDF attachment to both client and `info@cosbycapital.com`
- Telegram alert on storage failure; retry once on Supabase Storage error

`supabase/functions/generate-pdf/index.ts`:
- Uses `pdf-lib@1.17.1` via esm.sh (Deno-compatible, no Node.js dependencies)
- Multi-page rendering with section heading detection, navy/gold branding
- Signature block in Helvetica-Oblique (cursive approximation)
- Full ELECTRONIC SIGNATURE EXECUTION RECORD footer with all audit fields
- Diagonal "EXECUTED COPY — [client_id]" watermark on every page (S14-002)

### Layout + Step 5 (Tasks 9–10)
- `layout.tsx`: `Dancing_Script` added from `next/font/google` with `--font-dancing` CSS variable
- `step-5/page.tsx`: Replaced placeholder with real `SignatureModal` (dynamic import, `ssr:false`); `onComplete` saves step 5 and navigates to `/onboarding/step-6`

## Commits

| Hash | Description |
|------|-------------|
| `7004e6e` | feat(02-04): add signatures table migration with immutable rules |
| `aeec80c` | feat(02-04): add consulting agreement content and document hash utility |
| `01d97e3` | feat(02-04): add AgreementViewer and CheckboxList signature UI components |
| `406a1be` | feat(02-04): add SignatureModal 6-step electronic signature component |
| `7d3fd11` | feat(02-04): add execute-signature API route and profile endpoint |
| `1ca743e` | feat(02-04): add execute-signature and generate-pdf Supabase edge functions |
| `27ec17f` | feat(02-04): add Dancing Script font and wire SignatureModal into onboarding step 5 |

## Deviations from Plan

### Auto-added Missing Critical Functionality

**1. [Rule 2 - Missing endpoint] Added GET /api/onboarding/profile**
- **Found during:** Task 5 (SignatureModal Step 3 implementation)
- **Issue:** SignatureModal Step 3 needs `owner_name` (for typed-name validation) and `email` (pre-fill). No existing API endpoint exposed these fields. Without it, identity verification would silently skip name matching.
- **Fix:** Created `src/app/api/onboarding/profile/route.ts` — auth-gated GET returning `{ owner_name, email }` from the client record.
- **Files modified:** `src/app/api/onboarding/profile/route.ts` (new file)
- **Commit:** `7d3fd11`

## Known Stubs

| File | Description |
|------|-------------|
| `supabase/functions/execute-signature/index.ts` | `document_text_snapshot` for `consulting_agreement` stores a reference string rather than the full text. The `document_hash` cryptographically binds the record to the exact document text; full text embedding is a TODO for production compliance hardening. |
| `supabase/functions/generate-pdf/index.ts` | Dancing Script font approximated with Helvetica-Oblique in PDF. TODO comment marks where to embed actual OTF bytes via `pdfDoc.embedFont()` for production. |
| Non-consulting document types in `execute-signature` | `grant_writing_auth`, `lender_intro_auth`, etc. store placeholder `document_text_snapshot`. Full text will be added when those signature flows are built in later plans. |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: internal-ssrf | `supabase/functions/execute-signature/index.ts` | Edge function calls `generate-pdf` via `${SUPABASE_URL}/functions/v1/generate-pdf` — URL is env-controlled, not user-supplied. Low risk but worth noting for production security review. |

## Required Environment Variables

New variables needed before production deployment:

| Variable | Used in | Notes |
|----------|---------|-------|
| `INTERNAL_SERVICE_SECRET` | API route + both edge functions | Shared secret for internal service-to-service auth |
| `RESEND_API_KEY` | execute-signature | Email delivery; graceful skip if absent (warning logged) |
| `AWS_ACCESS_KEY_ID` | execute-signature | S3 triple storage; graceful skip if absent |
| `AWS_SECRET_ACCESS_KEY` | execute-signature | S3 signing |
| `AWS_REGION` | execute-signature | Defaults to `us-east-1` |
| `AWS_S3_BUCKET` | execute-signature | S3 bucket name |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | execute-signature | Drive triple storage; graceful skip if absent |

## Self-Check: PASSED

Files verified present:
- `supabase/migrations/20240101000008_signature_tables.sql` — FOUND
- `src/lib/agreements/consulting-agreement.ts` — FOUND
- `src/components/signature/AgreementViewer.tsx` — FOUND
- `src/components/signature/CheckboxList.tsx` — FOUND
- `src/components/signature/SignatureModal.tsx` — FOUND
- `src/app/api/signature/execute/route.ts` — FOUND
- `src/app/api/onboarding/profile/route.ts` — FOUND
- `supabase/functions/execute-signature/index.ts` — FOUND
- `supabase/functions/generate-pdf/index.ts` — FOUND

Commits verified: 7004e6e, aeec80c, 01d97e3, 406a1be, 7d3fd11, 1ca743e, 27ec17f — all present in git log.
