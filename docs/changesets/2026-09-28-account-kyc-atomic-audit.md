# Account and KYC audit atomicity

Date: 2026-09-28

Base revision: `2d80e043ac7583ed209702f1b158d28be91ae06e`

## Change

- Account creation and KYC decisions now append their audit event in the same database transaction as the business write. A failed append rolls the write back.
- KYC review locks the tenant-owned account row, preserves omitted notes, and leaves an identical retry unchanged.
- Both server actions emit structured `trace_id`, `tenant_id`, `actor_id`, `action`, and `outcome` fields without recording customer input in logs.

## Verification

- PASSED: focused action tests, 11/11.
- PASSED: disposable PostgreSQL 17.6 migration replay, 177/177, followed by account/KYC integration tests, 4/4. These cover audit rollback, KYC retry behavior, and cross-tenant rejection.
- PASSED: Web TypeScript check and source ESLint check after the final edit.
- The newly created disposable test database was removed after verification; the existing local database was not changed.
- NOT RUN: authenticated browser submission and production mutation. No hosted data, configuration, or deployment was changed.

## Remaining release gates

The separate identity lifecycle, full role/tenant matrix, departmental workflow, recovery, and capacity findings from the readiness audit remain open.
