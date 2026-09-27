# Account and KYC database CI gate

Date: 2026-09-28

## Change

- Added the account/KYC transactional integration suite to the hosted
  PostgreSQL 17 reproducibility job and the self-hosted WSL database runner.
- Enabled `ACCOUNT_ACTIONS_DATABASE_EXPECTED` only inside the disposable
  database lanes.
- The suite accepts GitHub's exact `127.0.0.1:54322/postgres` Supabase CLI
  database only when running inside GitHub Actions; other non-disposable
  database targets remain rejected.
- The self-hosted runner now writes a Web integration JSON report and rejects
  skipped, pending, zero-test, or failed execution through the shared Vitest
  report assertion.

## Verification

- PASSED: workflow validation and pinned action reference checks.
- PASSED: PowerShell parser validation for the self-hosted database runner.
- PASSED: normal Web collection of the database-gated suite exits cleanly with
  the explicit expectation absent.
- FAILED: the first hosted database run rejected GitHub's freshly rebuilt
  loopback `/postgres` database before any account/KYC case executed. The
  target guard was narrowed to admit that exact GitHub Actions database; the
  corrected run remains to be verified.
- NOT RUN: the self-hosted database lane. It recreates its named CI database;
  no existing local or hosted database was changed during this verification.

## Remaining risk

The next disposable PostgreSQL CI execution must provide runtime evidence that
all account/KYC cases execute without skips against the rebuilt schema.
