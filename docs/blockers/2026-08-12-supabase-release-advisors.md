# Supabase release advisors and staging boundary

## Status

BLOCKED for production schema/data mutation. Read-only provider checks completed.

## Target evidence

- Project `aqqrtkmtcsfkbyyqxowv` is `ACTIVE_HEALTHY`, region `ap-northeast-2`,
  PostgreSQL `17.6.1.121`.
- Hosted migration ledger is `55/124` against provider-linked source, with
  applied head `20260729233017` and source head `20260812150000`.
- Supabase branching API reports default branch `main` as
  `MIGRATIONS_FAILED` with `preview_project_status=ACTIVE_HEALTHY` and
  `with_data=false`. This is not acceptable staging/recovery proof until the
  provider state is explained and a restore test is evidenced.

## Advisor findings

Security: 14 findings — 3 informational RLS-without-policy findings and 11
warnings. Warnings include `vector` in `public`, an anonymously executable
`SECURITY DEFINER` `auth_tenant_id()`, eight authenticated-executable
`SECURITY DEFINER` authorization functions, and disabled leaked-password
protection.

Performance: 242 findings — 148 unindexed foreign keys, 92 unused indexes, one
duplicate index warning on `tenants` (`idx_tenants_slug` and
`tenants_slug_unique`), and one informational Auth connection setting.

Recent Postgres logs also contain repeated `Cannot enforce tenant Purchase
Order number uniqueness while duplicates exist` errors and two
`"array_agg" is an aggregate function` errors. These require root-cause review;
advisor output must not be converted directly into production DDL.

## Read-only reconciliation

- `business_calendar_holidays` is absent from the hosted catalog.
- The hosted catalog has 71 audit triggers across 86 tenant-scoped tables.
- `buildops-e2e` has 12 distinct purchase-order rows sharing
  `po_number = 'PO-0002'`; all are associated with the same E2E project and
  have downstream foreign-key references in delivery schedules, PO line items,
  stock receipts, and supplier bills.
- No duplicate row was deleted, renamed, moved, or otherwise mutated.

## Required gate

Before applying any migration or destructive data operation:

1. Establish provider-confirmed backup/PITR restore evidence.
2. Establish a healthy disposable/staging database with migration replay.
3. Resolve the WO-01 tenant identity/retention blocker.
4. Resolve the locked PRD/schema contradiction around legacy `scope_items`.
5. Review each security/performance finding against actual query and auth
   contracts, then stage additive remediations with rollback evidence.

No production DDL or row mutation was performed by this audit.
