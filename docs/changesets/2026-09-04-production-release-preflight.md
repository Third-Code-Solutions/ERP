# Production release preflight

## Scope and decision

Package the locally verified platform boundary and route repairs on
`agent-01/erp-route-platform-remediation` for a draft PR. Do not merge or promote
this release while its database dependency is absent. Preserve unrelated working
changes and local operational-memory notes outside the public code publication.

## Fresh production preflight

- PASSED: GitHub authentication, repository push access and target identification.
- PASSED: branch starts at the fetched production baseline `0a248bc08c37`.
- PASSED: Vercel project target and existing READY production deployment identified.
- BLOCKED: `node --env-file=apps/web/.env.local scripts/plan-database-release.mjs --require-current`
  exits 1, status `review_required`: 157 of 158 migrations applied. Read-only SQL
  independently confirms the platform assignment table is absent.
- Pending migration: `20260904020000_platform_owner_administration_boundary.sql`;
  SHA-256 `07843a9e554fc11d87d67252cca1f49a935ef59bfc16ff0b643e858c02fa05fd`.
- NOT RUN: production migration, owner bootstrap, Core/worker/Web promotion and
  authenticated post-release acceptance. No production deployment is claimed.

The lifecycle-aware API queries columns introduced by this migration, so deploying
the new application before the database would break authenticated requests.
ADR-020/027 and the database release runbook require a separately reviewed database
release. No alternate deployment tool or disabled check is used to bypass it.
Database restoration remains canceled; no recovery purchase or drill is requested.
Production email configuration remains a separate provider prerequisite.

## Local verification carried forward

No application source changed during this packaging preflight. The completed
implementation checks are recorded in the route-ID and platform-remediation
changesets: Web 1,771 unit tests plus two explicitly executed database integration
tests; API 1,025 tests; disposable database 442 tests; lint, types, Web/Core builds;
real-browser route and platform checks; tenant fixture cleanup. Ordinary-lane
integration skips are not represented as passes. Coverage does not certify every
external-provider workflow or the entire original product brief.

## Review

Packaging checks passed: staged whitespace validation, three documentation/release
workflow regression tests, and checksum-pinned Gitleaks 8.30.1 on the staged diff
(411,924 bytes, no leaks). Eleven new files received whitespace-only cleanup.
An empty stale Git index lock was preserved under a timestamped name after two
process inspections found no running Git process; no index or source was removed.

Release review checked UUID rejection and its regressions, development pool
lifecycle and production separation, platform identity/tenant lifecycle admission,
validated server-only Core requests, middleware denial, and guarded deployment
ordering. The known release-blocking finding is the missing database dependency.
The application remains a draft release until that boundary is resolved.
