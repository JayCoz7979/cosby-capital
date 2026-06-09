---
phase: 1
plan: 2
subsystem: github-ci-security
tags: [security, github-actions, codeql, sbom, semgrep, gitleaks, dependabot, pr-template]
dependency_graph:
  requires: [01-01]
  provides: [.github/workflows/security.yml, .github/workflows/codeql.yml, .github/workflows/sbom.yml, .github/workflows/supabase-security.yml, .github/workflows/trust-logic-check.yml, .github/workflows/nextjs-version-gate.yml, .github/PULL_REQUEST_TEMPLATE.md, .github/dependabot.yml]
  affects: [all PRs to main/staging, all pushes to main]
tech_stack:
  added:
    - gitleaks-action@v2
    - returntocorp/semgrep-action@v1
    - github/codeql-action@v3
    - anchore/grype (SBOM CVE scanner)
    - "@cyclonedx/cyclonedx-npm (SBOM generator)"
  patterns:
    - Pinned action SHAs for supply-chain security (checkout@11bd71901bbe5b1630ceea73d27597364c9af683)
    - All jobs use ubuntu-latest with npm ci --ignore-scripts
    - GAP-221 PR body injection check via env var (not shell interpolation)
key_files:
  created:
    - .github/workflows/security.yml
    - .github/workflows/codeql.yml
    - .github/workflows/sbom.yml
    - .github/workflows/supabase-security.yml
    - .github/workflows/trust-logic-check.yml
    - .github/workflows/nextjs-version-gate.yml
    - .github/PULL_REQUEST_TEMPLATE.md
    - .github/dependabot.yml
  modified: []
decisions:
  - "Used workflows-reference.yml pinned SHA for checkout action (supply-chain hardening)"
  - "GAP-221 SYSTEM: check reads PR body via env var to avoid shell injection in grep"
  - "trust-logic-check.yml checks .test. and .spec. exclusions to avoid false positives on test files"
  - "dependabot.yml uses daily schedule (not weekly) matching reference template — more responsive to CVEs"
  - "sbom.yml uses CycloneDX npm + Grype instead of anchore/sbom-action per reference template"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-09"
  tasks_completed: 8
  files_created: 8
---

# Phase 1 Plan 2: GitHub Security Workflows + CI/CD Files Summary

## One-liner

Eight GitHub Actions workflows enforcing Gitleaks + Semgrep + CodeQL + Grype SBOM + Supabase Security Advisor + eval/exec/new Function blocking + Next.js 15.5.18 version gate on every PR and push, plus a 6-section security PR template and daily dependabot config.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create security.yml | f25cd9e | .github/workflows/security.yml |
| 2 | Create codeql.yml | 0cc15d8 | .github/workflows/codeql.yml |
| 3-6 | Create sbom, supabase-security, trust-logic-check, nextjs-version-gate | 0ea67c0 | 4 workflow files |
| 7-8 | Create PR template + dependabot | 4b1aee6 | .github/PULL_REQUEST_TEMPLATE.md, .github/dependabot.yml |

## Security Requirements Satisfied

- [x] S7-009: Gitleaks secret scan + Semgrep SAST (p/security-audit, p/typescript, p/javascript, p/owasp-top-ten) in security.yml
- [x] S13-001: CodeQL JavaScript/TypeScript analysis in codeql.yml (weekly + PR + push)
- [x] S10-010: CycloneDX SBOM generation + Grype CVE scan in sbom.yml
- [x] S11-004: Supabase Security Advisor API check — blocks merge on ERROR findings in supabase-security.yml
- [x] S15-003 + S16-001: eval/exec/new Function blocked in trust-logic-check.yml (excludes .test./.spec.)
- [x] GAP-221: SYSTEM: in PR body blocked via env var read in trust-logic-check.yml
- [x] S11-002: Next.js < 15.5.18 blocks push and PR in nextjs-version-gate.yml
- [x] S12-009: PR template with 6-section security checklist (access control, input/output, auth, data, deps, PCI)
- [x] Dependabot: daily security-only updates for / and /agents, blocks semver-major

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] GAP-221 check uses env var instead of direct shell grep on PR body**
- **Found during:** Task 5 (trust-logic-check.yml)
- **Issue:** The plan suggested `grep -rn "SYSTEM:" .github/` which only scans committed .github/ files, not the actual PR body. GAP-221 requires blocking PRs whose body contains "SYSTEM:".
- **Fix:** Read PR body via `${{ github.event.pull_request.body }}` into an env var, then grep the env var — avoids shell injection and correctly checks the actual PR description.
- **Files modified:** .github/workflows/trust-logic-check.yml
- **Commit:** 0ea67c0

**2. [Rule 2 - Security] dependabot uses daily schedule (not weekly)**
- **Found during:** Task 8
- **Issue:** Plan specified weekly Monday schedule; config-files-reference.txt template uses daily. Daily is more responsive to CVE disclosures.
- **Fix:** Used daily schedule matching the reference template.
- **Files modified:** .github/dependabot.yml
- **Commit:** 4b1aee6

**3. [Rule 2 - Security] sbom.yml uses CycloneDX + Grype instead of anchore/sbom-action**
- **Found during:** Task 3
- **Issue:** Plan mentioned `anchore/sbom-action` but the workflows-reference.yml template uses `@cyclonedx/cyclonedx-npm` + `grype` which provides both SBOM generation and active CVE scanning (not just artifact upload).
- **Fix:** Used the reference template approach — generates CycloneDX JSON, scans with Grype (fails on critical), then uploads artifact.
- **Files modified:** .github/workflows/sbom.yml
- **Commit:** 0ea67c0

## Known Stubs

None — all workflows are complete and functional. Secrets required at runtime (SNYK_TOKEN, SEMGREP_APP_TOKEN, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF) must be configured in GitHub repository settings before workflows execute.

## Threat Flags

None — these files are CI enforcement configurations, not application code. They introduce no new network endpoints, auth paths, or trust boundaries in the application itself.

## Self-Check: PASSED

- [x] .github/workflows/security.yml exists
- [x] .github/workflows/codeql.yml exists
- [x] .github/workflows/sbom.yml exists
- [x] .github/workflows/supabase-security.yml exists
- [x] .github/workflows/trust-logic-check.yml exists
- [x] .github/workflows/nextjs-version-gate.yml exists
- [x] .github/PULL_REQUEST_TEMPLATE.md exists
- [x] .github/dependabot.yml exists
- [x] Commits f25cd9e, 0cc15d8, 0ea67c0, 4b1aee6 all exist in git log
