# ABI OPS production promotion

Date: 2026-08-13

## Summary

- Consolidated the current ERP refactor with the upstream `main` history while preserving the ABI OPS clean-room branding and Core canary boundaries.
- Closed the production-container dependency gap by including the `@third-code-erp/ai` workspace package in the API image build and runtime dependency graph.
- Reconciled the web, API, database schema exports, tenant-safe auth profile lookup, procurement workflow adapters, CAD/document guards, and legacy Togal endpoint closure.
- Updated disposable database integration contracts for tenant-wide audit-chain ordering and canonical semantic audit rows.

## Verification

- `pnpm turbo typecheck` — PASS.
- `pnpm turbo test` — PASS: 62 shared-type files/380 tests, 180 API files/790 tests, and database package suite.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ci/run-wsl1-database-lane.ps1` — PASS: 140 migrations replayed; migration ledger, RLS, privilege, index, trigger, audit, PostgreSQL/Redis integration, and rollback checks passed.
- `pnpm turbo build --force` — PASS: API production bundle and Next.js 15 production build with 85/85 static pages.
- ABI OPS branding, type-safety, App Router boundary, BUILD OPS invariant, workflow action-reference, and gitleaks checks — PASS.

## Release boundaries

- The database release plan reports the disposable database at migration head `20260813220000`; it is read-only and does not claim that production migration SQL has been executed.
- M1 production canary flags remain closed pending the explicit owner-controlled email and approval evidence required by the PRD.
- Hosted production promotion still requires provider identity/credential verification and post-deployment health, readiness, browser, and log evidence.
- WO-06, WO-09, WO-03, and human acceptance gates remain tracked as documented in the PRD and related changesets.

## Post-promotion E2E correction (2026-08-14)

- Replaced the production smoke test's obsolete password fixture with the existing deterministic Supabase magic-link harness when `E2E_MAGIC_LINK_AUTH=1`; the legacy password path remains available for local seeded environments.
- Aligned the route/navigation policy with the existing `admin.rate_card` capability: Commercial may enter the Admin surface for rate-card maintenance, while user and system configuration child routes remain capability-filtered to admin/owner.
- Production Chromium route-walk after the test correction: PASS, 23/23 authenticated routes, no captured blocking page errors.
- Hardened the notifications dropdown to read the browser Supabase session before issuing its API request, eliminating the observed SSR-hydration 401/403 race while preserving the API's unauthenticated 401 response contract.
- Added abort-aware cleanup for notification polling and realtime-triggered fetches so page navigation cannot leave stale unauthenticated requests behind.
- Added a document-cookie readiness check so a newly mounted route waits for SSR auth-cookie reconciliation before its first notification request.
- Hardened the role harness with session-identity assertions, isolated browser contexts per seeded role, and settled browser-navigation checks for client-side forbidden redirects.
