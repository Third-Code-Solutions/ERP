# Account and KYC database CI gate

Date: 2026-09-28

## Change

- Added the account/KYC transactional integration suite to the hosted
  PostgreSQL 17 reproducibility job and the self-hosted WSL database runner.
- Enabled `ACCOUNT_ACTIONS_DATABASE_EXPECTED` only inside the disposable
  database lanes.
- The self-hosted runner now writes a Web integration JSON report and rejects
  skipped, pending, zero-test, or failed execution through the shared Vitest
  report assertion.

## Verification

- PASSED: workflow validation and pinned action reference checks.
- PASSED: PowerShell parser validation for the self-hosted database runner.
- PASSED: normal Web collection of the database-gated suite exits cleanly with
  the explicit expectation absent.
- NOT RUN: either disposable database lane. Both recreate or drop their named
  CI database; no existing local or hosted database was changed.

## Remaining risk

The next disposable PostgreSQL CI execution must provide runtime evidence that
all account/KYC cases execute without skips against the rebuilt schema.
