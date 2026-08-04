# Hosted Database Release

## Purpose

Safely reconcile and release Third Code ERP migrations to a hosted Supabase
PostgreSQL 17 database. This runbook is required when the target migration
ledger differs from `supabase/migrations`.

The planner is read-only:

```powershell
pnpm plan:database-release
```

`DATABASE_URL` must come from the approved environment/secret manager. For the
repository-configured local environment used in this audit, the exact
read-only command is:

```powershell
node --env-file=apps/web/.env.local scripts/plan-database-release.mjs
```

It prints migration versions, file hashes, SQL-risk warnings, unexpected
history, and later versions applied after the first gap. It never executes SQL
or repairs migration history.

## Current release state

Verified 2026-08-05 against the authorized Supabase target:

- PostgreSQL 17 (`server_version_num = 170006`).
- 55 hosted versions are recorded as applied; the source ledger contains 88.
- The hosted ledger is an exact prefix of source, with 33 ordered source
  versions pending review. No unexpected or out-of-order versions exist.
- The source suffix has no `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or data
  update statements; it contains 27 `drop-object` risk findings and six
  explicit transaction-control findings in the planner output.
- No hosted migration, history row, data, Storage object, or provider setting
  was changed during this audit. The release is blocked pending the isolated
  PostgreSQL 17 clone/replay, catalog/data/RLS diff, backup/restore evidence,
  and zero-skipped integration/recovery gates.

The earlier 44/44 baseline from 2026-07-28 is historical evidence only; it is
not the current state of this target. Every future target must independently
pass this runbook; current status is not transferable to another project or
environment. See
[`DATABASE_RECONCILIATION_M3.31.md`](../architecture/DATABASE_RECONCILIATION_M3.31.md)
for the exact suffix, manifest, catalog checks, and blockers.

## Required people and evidence

- Release owner: owns the application flag and customer communication.
- Database owner: reviews SQL, locks, data transforms, and restore evidence.
- Independent reviewer: verifies hashes, target project, and rollback point.
- Exact Git commit and clean CI evidence.
- `plan:database-release` output from the target.
- Clean PostgreSQL 17 rebuild, zero skipped database tests, and empty schema
  diff.
- Restorable physical backup or PITR recovery point.
- Supplemental encrypted logical schema, role, and data dumps.
- Separate Storage object inventory/backup.
- Rehearsal report from an isolated restored clone.

Supabase database backups include database state and Storage metadata, but not
the stored objects themselves. Restoring a database backup therefore cannot
recover Storage objects deleted after that backup. See
[Database Backups](https://supabase.com/docs/guides/platform/backups).

## Phase 1 — Read-only preflight

1. Identify the exact project and environment. Two people confirm it.
2. Record the application release commit and repository migration head.
3. Run:

   ```powershell
   pnpm test:database-release-plan
   pnpm plan:database-release # DATABASE_URL injected by approved secret manager
   node scripts/verify-database-repro.mjs
   ```

4. Capture output in the change record. Never capture connection strings.
5. Stop if:
   - PostgreSQL is not major version 17;
   - unexpected migration versions exist;
   - planner hashes differ between reviewers;
   - the configured project cannot be proven;
   - backup/PITR status is unknown;
   - CI is not green.

`supabase db push --dry-run` can list what the CLI would apply, but it is not
proof that non-linear migrations are safe. The pinned CLI exposes this flag;
verify it again with `supabase db push --help` before each release.

## Phase 2 — Recovery evidence

1. In the Supabase Dashboard, record the newest restorable backup/PITR point
   immediately before the rehearsal.
2. Restore that point into a separate project. Never rehearse on the source
   project.
3. Create encrypted, access-controlled logical exports as supplemental
   evidence:
   - schema;
   - custom roles;
   - data.
4. Store dumps outside the repository. Record their SHA-256 hashes.
5. Export or replicate required Storage objects separately.
6. Perform a restore drill and prove the cloned application can read critical
   tenant, project, document, audit, and finance data.

Supabase's CLI `db dump` creates logical exports, but its managed-schema
exclusions mean it is supplemental to platform backup/PITR, not a complete
hosted-project restore. Projects are unavailable during an in-place platform
restore; replication slots other than Realtime may require manual recreation.

## Phase 3 — Build a reconciliation migration

Because the target history is non-linear:

1. Rebuild the repository from zero in disposable PostgreSQL 17. This is the
   desired catalog.
2. Restore the target backup to an isolated clone. This is the actual catalog.
3. Diff actual versus desired catalog and inspect affected data.
4. Do not edit the 43 historical files.
5. Create one new forward-only reconciliation migration using the pinned
   Supabase CLI.
6. Make it safe when run:
   - on a clean database after all historical migrations;
   - on the drifted restored clone.
7. Replace blind drops and rewrites with explicit preconditions, invariant
   checks, and bounded transformations.
8. Apply only to the clone.
9. Run the full catalog verifier, every database test without skips, Nest
   integration, schema diff, RLS/security checks, and application smoke tests.
10. Compare row counts, financial totals, tenant counts, audit-chain evidence,
    and Storage metadata before and after.

Only after catalog and data equivalence is proved may a separate, explicitly
approved history-repair step mark historical versions as applied. Migration
repair changes ledger state without executing SQL; using it before equivalence
would create false evidence.

## Phase 4 — Production release

1. Announce a maintenance window and pause background jobs.
2. Keep `ERP_PROJECT_WRITES_VIA_API=false`.
3. Record the final PITR/backup restore point and logical-dump hashes.
4. Re-run the read-only planner. Abort if output differs from rehearsal.
5. Put write-capable application paths into maintenance mode.
6. Apply the reviewed reconciliation migration through the approved release
   runner. Never paste credentials into shell history or logs.
7. Run catalog, constraint, trigger, function-privilege, RLS, tenant-isolation,
   audit, and data-reconciliation checks.
8. Resume legacy application writes only after those checks pass.
9. Deploy the Nest API preview and verify real Auth, PostgreSQL, Redis, CORS,
   logs, readiness, and rollback.
10. Enable the Project-write feature flag only in a controlled canary after a
    separate approval.

## Abort and recovery

Abort immediately on migration error, unexpected lock duration, invariant
failure, cross-tenant visibility, audit attribution failure, row-count drift,
financial imbalance, or readiness failure.

- Application rollback: keep or restore
  `ERP_PROJECT_WRITES_VIA_API=false` and promote the last known-good web/API
  release.
- Database fix-forward: allowed only for a fully understood additive defect
  with intact data and approved forward migration.
- Database restore: for destructive or uncertain outcomes, restore the
  recorded pre-release backup/PITR point. Expect downtime.
- Storage restore: execute the separate object-store recovery process; database
  restore alone is insufficient.

Never run `supabase db reset --linked` against production. Never claim rollback
readiness until a restore drill succeeds.

## Closure evidence

- Target ledger exactly equals repository ledger.
- Planner reports `current`.
- Catalog verifier passes.
- Zero skipped database tests.
- Empty schema diff.
- Nest integration and production-container smoke pass.
- RLS/security advisors reviewed.
- Reconciliation totals signed off.
- Restore point, logical-dump hashes, Storage backup, and restore drill
  attached to the change record.
- Work log and next actions updated.
