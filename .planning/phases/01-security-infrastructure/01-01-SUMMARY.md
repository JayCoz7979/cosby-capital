---
phase: 1
plan: 1
subsystem: scaffold
tags: [security, config, dependencies, next.js]
dependency_graph:
  requires: []
  provides: [package.json, next.config.js, .gitignore, .gitleaks.toml, vercel.json, security.txt]
  affects: [all subsequent plans]
tech_stack:
  added:
    - next@15.5.18
    - react@19.0.6
    - "@supabase/ssr@0.12.0"
    - "@sentry/nextjs@10.57.0"
    - lucide-react@0.400.0
    - vitest@3.2.6
    - "@playwright/test@1.60.0"
  patterns:
    - Exact version pinning (no ^ or ~) for supply chain security
    - HTTP security header suite in next.config.js
    - Secret detection rules in .gitleaks.toml
key_files:
  created:
    - package.json
    - tsconfig.json
    - tailwind.config.ts
    - postcss.config.mjs
    - next.config.js
    - .gitignore
    - .gitleaks.toml
    - .env.example
    - vercel.json
    - public/.well-known/security.txt
  modified: []
decisions:
  - "Upgraded @supabase/ssr from 0.1.0 to 0.12.0 to fix cookie CVE (GHSA-pxg6-pf52-xh8x)"
  - "Upgraded lucide-react from 0.309.0 to 0.400.0 for React 19 peer dep compatibility"
  - "Removed non-existent @radix-ui/react-badge package (no such npm package)"
  - "Upgraded @sentry/nextjs to 10.57.0 to fix rollup path traversal CVE (GHSA-mw96-cpmx-2vgc)"
  - "Upgraded vitest to 3.2.6 to fix arbitrary file read/execute CVE (GHSA-5xrq-8626-4rwp)"
  - "Used --legacy-peer-deps for Radix UI React 18 peer dep declarations (React 19 is backward compatible)"
  - "Initialized git repository in C:/projects/cosby-capital"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-09"
  tasks_completed: 4
  files_created: 10
---

# Phase 1 Plan 1: Project Scaffold + Security Config Files Summary

## One-liner

Next.js 15.5.18 project scaffold with exact pinned deps, full HTTP security header suite, 8-rule gitleaks secret detection, Vercel maxDuration:30 config, and RFC 9116 security.txt.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Verify/create scaffold + security config files | f1af3e4 | package.json, next.config.js, .gitignore, .gitleaks.toml, .env.example, tsconfig.json, tailwind.config.ts, postcss.config.mjs |
| 2 | Create vercel.json | 3537e70 | vercel.json |
| 3 | Create public/.well-known/security.txt | c313802 | public/.well-known/security.txt |
| 4 | npm install + audit | 7a33c29 | package-lock.json |

## Security Requirements Verified

- [x] `package.json`: next@15.5.18, react@19.0.6, react-dom@19.0.6 — exact pins, no ^ or ~
- [x] `next.config.js`: `poweredByHeader: false` (S13-010)
- [x] `next.config.js`: HSTS `max-age=63072000; includeSubDomains; preload`
- [x] `next.config.js`: `X-Frame-Options: DENY`
- [x] `next.config.js`: Full CSP suite (default-src, script-src, style-src, connect-src, frame-ancestors)
- [x] `.gitignore`: includes `.claude/`, `.claude.json`, `.codegraph/` (S10-004)
- [x] `.gitleaks.toml`: 8 rules — anthropic-api-key, supabase-service-role, railway-api-token, resend-api-key, stripe-restricted-key, internal-service-secret, claude-config-file, codegraph-dir
- [x] `vercel.json`: maxDuration:30 on all API functions (S8-009)
- [x] `public/.well-known/security.txt`: RFC 9116 compliant, expires 2027-06-09

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed non-existent @radix-ui/react-badge package**
- **Found during:** Task 4 (npm install)
- **Issue:** `@radix-ui/react-badge@1.0.4` returned 404 — this package does not exist on npm. Badge is not a separate Radix UI primitive; it's typically a styled div or generated via shadcn/ui.
- **Fix:** Removed from package.json dependencies
- **Files modified:** package.json
- **Commit:** f1af3e4

**2. [Rule 1 - Bug] Upgraded lucide-react for React 19 compatibility**
- **Found during:** Task 4 (npm install)
- **Issue:** lucide-react@0.309.0 declares peer dep `react: "^16.5.1 || ^17.0.0 || ^18.0.0"` — incompatible with React 19.0.6
- **Fix:** Upgraded to lucide-react@0.400.0 which adds `^19.0.0` to peer deps
- **Files modified:** package.json
- **Commit:** f1af3e4

**3. [Rule 2 - Security] Upgraded @supabase/ssr to fix cookie CVE**
- **Found during:** Task 4 (npm audit)
- **Issue:** @supabase/ssr@0.1.0 depends on cookie<0.7.0 (GHSA-pxg6-pf52-xh8x) — cookie name/path/domain out-of-bounds characters
- **Fix:** Upgraded to @supabase/ssr@0.12.0 (latest stable, fixes cookie dep)
- **Files modified:** package.json
- **Commit:** f1af3e4

**4. [Rule 2 - Security] Upgraded @sentry/nextjs to fix rollup path traversal CVE**
- **Found during:** Task 4 (npm audit)
- **Issue:** @sentry/nextjs@7.99.0 depends on vulnerable rollup (GHSA-mw96-cpmx-2vgc — Arbitrary File Write via Path Traversal)
- **Fix:** Upgraded to @sentry/nextjs@10.57.0
- **Files modified:** package.json
- **Commit:** f1af3e4

**5. [Rule 2 - Security] Upgraded vitest to fix arbitrary file read/execute CVE**
- **Found during:** Task 4 (npm audit)
- **Issue:** vitest<3.2.6 — when Vitest UI server is listening, arbitrary files can be read and executed (GHSA-5xrq-8626-4rwp, critical)
- **Fix:** Upgraded to vitest@3.2.6
- **Files modified:** package.json
- **Commit:** f1af3e4

**6. [Rule 1 - Bug] Initialized git repository**
- **Found during:** Task 1
- **Issue:** No git repository existed in C:/projects/cosby-capital — all files were untracked
- **Fix:** Ran `git init` and configured git user
- **Commit:** f1af3e4 (root commit)

## Deferred Issues

| Issue | Package | Reason | Action |
|-------|---------|--------|--------|
| postcss XSS (GHSA-qx2v-qp2m-jg93) | next@15.5.18 internal | Fix requires downgrading next to 9.3.3 — unacceptable. Upstream Next.js issue. | Wait for next.js patch release |
| tar path traversal (multiple CVEs) | @mapbox/node-pre-gyp via bcrypt | tar only runs during native build; `--ignore-scripts` prevents execution entirely. Not a runtime risk. | Acceptable with --ignore-scripts enforced |

## Known Stubs

None — this plan creates configuration files only, no UI components or data flows.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. All changes are configuration files.

## Self-Check: PASSED

- [x] package.json exists at C:/projects/cosby-capital/package.json
- [x] next.config.js exists with poweredByHeader:false and HSTS
- [x] .gitignore exists with .claude/, .claude.json, .codegraph/
- [x] .gitleaks.toml exists with 8 rules including anthropic-api-key
- [x] vercel.json exists with maxDuration:30
- [x] public/.well-known/security.txt exists
- [x] Commits f1af3e4, 3537e70, c313802, 7a33c29 all exist in git log
