# Supabase read-only release advisor audit

## Outcome

PARTIALLY VERIFIED. Target project identity, migration ledger, provider branch
state, advisors, and recent Postgres logs were inspected without mutation.

## Verification

- PASS — target project `aqqrtkmtcsfkbyyqxowv` is active and healthy on
  PostgreSQL 17.6.1.121.
- PASS — provider migration ledger reports 55 migrations with head
  `20260729233017`, matching the current local applied ledger; this does not
  match the provider-linked `origin/main` source, which contains 124 migration
  files.
- BLOCKED — default branch status is `MIGRATIONS_FAILED`; provider preview is
  healthy but `with_data=false`, so no staging or recovery proof exists.
- BLOCKED — security advisors report 14 findings: 3 informational
  RLS-without-policy findings and 11 warnings, including the public `vector`
  extension, executable `SECURITY DEFINER` functions, and disabled leaked
  password protection.
- BLOCKED — performance advisors report 242 findings: 148 unindexed foreign
  keys, 92 unused indexes, one duplicate-index finding, and one Auth
  connection-setting finding.
- BLOCKED — recent logs include duplicate PO-number enforcement errors and two
  `array_agg` errors.
- BLOCKED — current read-only catalog reconciliation confirms the missing
  `business_calendar_holidays` table and only 71 audit triggers across 86
  tenant-scoped tables. The affected tenant contains 12 synthetic E2E rows
  sharing `po_number = 'PO-0002'`; four have delivery schedules and none have
  receipts or supplier bills. Row-level evidence and the required approval
  choices are recorded in
  `docs/blockers/2026-08-12-purchase-order-number-reconciliation.md`.
- PASS — no production DDL, migration, insert, update, delete, or tenant move
  was performed.

## Related web hardening

The unauthenticated middleware boundary now includes all dashboard modules plus
protected print/report surfaces (`/cortex`, `/finance`, `/inventory`,
`/inspection`, and `/weekly-report`). Browser E2E covers every protected root,
not only dashboard, projects, and pipeline.

Authenticated profile hydration now uses the caller's Supabase SSR client and
RLS instead of a service-role lookup. Regression tests assert no admin client is
constructed for this request path.

Health/readiness middleware bypass now retains baseline security headers, with
browser E2E assertions for both monitoring endpoints.

Protected-route redirects now retain the same baseline headers. Live production
verification covers all 22 protected roots and confirms the headers on each
`307 /auth/login` response.

## Release boundary

Do not treat current provider health or migration-ledger equality as permission
to push schema/data. WO-01 identity/retention, backup/restore, staging replay,
and the PRD/schema contradiction remain open.
