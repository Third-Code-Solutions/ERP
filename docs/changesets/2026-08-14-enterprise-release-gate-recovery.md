# Enterprise release-gate recovery — 2026-08-14

## Scope

Increment 1 of the enterprise hardening run. This slice fixes the reviewed
authenticated user-read privilege contract in the disposable Postgres replay and
makes the CI database lane manually runnable against a pushed branch. It does not
purge, move, or rewrite hosted data.

## Root-cause evidence

- Main CI run `31773973544` failed Unit Tests because the Web DB boundary allowlist
  on `main` did not classify the new inspection-photo write route. The current
  branch already contains that allowlist correction and its focused test passes.
- The same run failed Database Reproducibility at `authenticated can read but
  cannot mutate tenant user rows`; the observed ACL result was false for SELECT,
  INSERT, UPDATE and DELETE. The role-authority migration revoked browser DML but
  did not make the authenticated SELECT grant explicit.
- Local full database replay was NOT RUN because Supabase CLI is absent and Docker
  Desktop's local engine could not be started from this non-elevated session.

## Changes

- Added additive migration `20260814150000_preserve_users_read_authority.sql`:
  authenticated SELECT remains available; client INSERT/UPDATE/DELETE remain
  revoked.
- Tightened the CI-only role fixture to grant user SELECT only to authenticated and
  explicitly revoke anonymous/public user-table privileges.
- Added a fail-fast CI ACL assertion immediately after the fixture is applied.
- Added `workflow_dispatch` to CI so the exact branch replay can be executed and
  observed before any promotion.
- Extended `verify-database-repro.mjs` to require and statically validate the new
  migration contract.

## Rollback

Revert this changeset commit before applying the additive migration to a hosted
target. If the migration has already been applied, revoke only the authenticated
SELECT grant after confirming the replacement read path and preserve the existing
DML revokes; do not delete or alter user rows.

## Verification

- PASS — `pnpm test:web-db-boundary`
- PASS — `pnpm test:build-ops-invariants`
- PASS — `node scripts/verify-database-repro.mjs --files-only`
- PASS — `node scripts/run-actionlint.mjs`
- PASS — `pnpm test:doc-authority`
- NOT RUN — disposable Postgres 17 replay; Docker engine unavailable locally
- PENDING — GitHub Actions CI replay on this branch
