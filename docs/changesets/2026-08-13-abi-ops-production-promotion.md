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
