# BUILD OPS WO-01 — demo-data audit and tenant-safe delivery joins

## Outcome

PARTIALLY VERIFIED. The target Supabase project was audited read-only. No
production row was inserted, updated, deleted, or moved.

The audit identified two E2E tenants and no ABI-like tenant, so the requested
purge/move cannot be performed safely until the real ABI tenant slug and
retention policy are confirmed. `PO-0002` resolves to 12 distinct purchase
orders; its four delivery rows resolve to four distinct delivery and purchase
order IDs, with no join fanout.

Read-only duplicate analysis confirms all 12 `PO-0002` rows belong to
`buildops-e2e` and one project, spanning draft, approval, and issued states.
This explains the repeated target Postgres uniqueness-enforcement errors. No
row was changed because the rows are referenced by 104 E2E foreign keys and no
canonical-row/retention policy was supplied.

## Changes

- Added `scripts/audit-build-ops-demo-data.mjs` as a repeatable, read-only
  target inventory with E2E field matches, phase matches, PO/delivery identity
  analysis, and single-column foreign-key reference counts.
- Added dedicated demo-tenant selection guards to the role-account seed path
  and SQL demo seed path. Neither path falls back to the first tenant.
- Added tenant predicates to the procurement deliveries purchase-order and
  vendor joins.
- Recorded the mutation boundary and reference evidence in
  `docs/blockers/2026-08-12-wo-01-production-data-boundary.md`.

## Verification

- PASS — `node --check scripts/audit-build-ops-demo-data.mjs`
- PASS — read-only target audit: 66 E2E field matches; 0 ABI-like tenants; 104
  foreign-key references across 24 parent/child relationships; no delivery
  join fanout.
- PASS — read-only duplicate analysis: 12 `PO-0002` rows, all in
  `buildops-e2e` and one project; no mutation performed.
- PASS — `pnpm test:demo-tenant` (3/3).
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — `pnpm lint`.
- PASS — target `node --env-file=apps/web/.env.local scripts/verify-schema.mjs`.
- PASS — target catalog checks in `scripts/verify-database-repro.mjs`,
  including migration-ledger equality after exact source recovery.
- PASS — built production server authentication boundary E2E: 4/4
  unauthenticated login/redirect checks using system Chrome.
- PASS — built production server public frontend E2E: 1/1 across desktop,
  tablet, and mobile viewports; console/page errors remained empty.
- Added shared Playwright `E2E_CHROME_PATH` support so local/system Chrome can
  be selected when the bundled browser is unavailable.
- BLOCKED — authenticated route smoke could not sign in because the configured
  default test account returned Supabase Auth `invalid_credentials`; no
  credential was present in the repository environment, so no account was
  created or modified.
- PASS — target/repository migration ledger equality: 55/55, head
  `20260729233017`; exact recovered source is recorded in
  `docs/blockers/2026-08-12-hosted-ledger-reconciliation.md`.
- NOT RUN — destructive purge/move; blocked by missing ABI identity and
  missing verified pre-mutation backup/PITR restore evidence.
- NOT RUN — database migration or production deployment; recovery, target
  catalog/data reconciliation, and the PRD/schema contradiction remain open.

## Subsequent read-only revalidation

- PASS - `pnpm audit:build-ops-demo-data` again reports 66 E2E field matches,
  zero ABI-like tenants, 104 foreign-key references across 24 relationships,
  and no Deliveries join fanout.
- PASS - the duplicate group is confirmed as 12 real Purchase Order rows, not
  a query fanout; the four delivery rows reference four distinct Purchase
  Orders.
- NOT RUN - purge or tenant move; the target still has no identifiable ABI
  tenant and the PRD requires an owner-confirmed migration plan before any
  destructive action.
