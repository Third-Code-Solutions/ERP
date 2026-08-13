# Hosted migration ledger reconciliation

> Superseding note — 2026-08-13: this file is a historical 55-migration
> snapshot. The requested Supabase target now matches the local 139-migration
> ledger through `20260813210000`; a linked dry-run reports zero pending
> migrations. Keep the historical recovery evidence, but use the dated
> production changeset and `docs/operations/NEXT_ACTIONS.md` for current
> release status.

## Status

HISTORICAL 55-MIGRATION SNAPSHOT RECONCILED. No target migration SQL or history
repair was executed. The current local workspace now contains the local-only
M-06 foundation, so the overall database release remains BLOCKED by provider
source divergence, recovery evidence, target catalog/data reconciliation, and
the separate PRD/schema contradiction.

## Target evidence

- Target host is the requested Supabase project `aqqrtkmtcsfkbyyqxowv`.
- PostgreSQL major version: 17.
- Target migration ledger: 55 applied versions; head `20260729233017`.
- Historical repository migration set at reconciliation time: 55 versions;
  head `20260729233017`.
- The exact SQL for `20260729233017` was recovered read-only from the target's
  `supabase_migrations.schema_migrations.statements` column and restored as
  `supabase/migrations/20260729233017_notification_outbox_foundation.sql`.
- Local normalized SQL comparison: exact match between the recovered target
  statement and the repository file.
- Full read-only catalog verifier: all checked table, RLS, policy, index,
  trigger, privilege, constraint, and migration-ledger invariants passed.

## Provider source divergence

- Local `HEAD` is `8268bbf93fae23c4584c4d0485ded784e07e08b4` and is 603 commits
  behind `origin/main` (`7cd3306681e68528897de792dbef46b3aefee3a3`).
- The current local workspace contains 56 migration files, including
  `20260812160000_process_sla_engine_foundation.sql`; `origin/main` contains
  124.
- Supabase branch-action logs show the provider cloning Git ref `main` and
  attempting `20260801090000_purchase_order_create_idempotency.sql`, which is
  present in `origin/main` but absent from the local workspace.
- The provider migration attempt fails on duplicate tenant-scoped PO numbers;
  the exact data scope is recorded in the WO-01 and source-divergence blockers.

The historical 55/55 result below therefore proves only the prior local
snapshot. It does not prove current local or provider-linked `origin/main`
parity.

## Required before any database push

1. Confirm the recovered migration's intended release commit and review the
   target-only source provenance.
2. Rebuild the repository from zero on disposable PostgreSQL 17.
3. Restore the target into an isolated clone and diff desired versus actual
   catalog/data.
4. Capture and rehearse PITR/backup plus supplemental schema, role, data, and
   Storage-object recovery evidence.
5. Resolve the separate `scope_items` versus `bom_line_items` authority
   contradiction before any schema-shape migration.

`supabase db push`, destructive data cleanup, and production deployment remain
blocked by this evidence set. The provider-linked 124-migration source and the
current local 56-migration workspace still require source reconciliation.
