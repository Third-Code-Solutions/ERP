# Hosted Database Release

> Dated read-only evidence — 2026-08-16: repository records show a 144/144
> migration observation on PostgreSQL 17 with zero pending migrations and zero
> duplicate Purchase Order groups. The local parity verifier does not contact
> Supabase, so this is not a current provider assertion. Production promotion
> remains blocked pending fresh target evidence, provider credentials, and
> authenticated post-deployment verification.

## Historical 2026-08-10 / 2026-08-07 snapshot (superseded)

The following 55-migration material is retained for audit traceability only.
It must not be used as the current release boundary.

- Last verified hosted snapshot: target `aqqrtkmtcsfkbyyqxowv` was
  `ACTIVE_HEALTHY` PostgreSQL 17.6 with 55 migrations applied through
  `20260729233017`. No hosted state was queried in the source refresh below.
- Current repository manifest: 115 source migrations through
  `20260810110000_project_comment_delete_workflow.sql`; 60 ordered pending
  migrations remain. The managed boundary is still `review_required`.
- Current Purchase Order planner still reports one tenant duplicate-number
  group with 12 records. The first missing migration intentionally aborts
  while that group exists. No owner mapping has been supplied.
- Release planner reports 213 anonymous table-privilege rows and 209 policies
  assigned to `PUBLIC`. Current advisors report 14 security and 253
  performance notices.
- Default Supabase branch status is `MIGRATIONS_FAILED`; current 24-hour branch
  and Auth logs are empty, so it is not valid rehearsal or recovery evidence.
- Export tooling is ready when a separate session/direct URL and the approved
  portable PostgreSQL 17.10 client are supplied. The application URL remains
  on transaction-pooler port 6543 and is still rejected for dumps.
- The prior public-only snapshot has replayed the 48-file suffix locally, but
  lacks managed Auth, Storage, vector, provider grants, and zero-skip proof.
- Creating a new Supabase branch currently costs `$0.01344/hour`; none was
  created or confirmed. Free local replay remains first choice.
- Exact batches, gates, abort criteria, and cost ceiling are in
  [`MANAGED_SUPABASE_PARITY_PLAN.md`](../operations/MANAGED_SUPABASE_PARITY_PLAN.md)
  and its machine-checked JSON manifest.
- No hosted SQL/data/Storage/branch write, Vercel deployment, Railway deploy,
  provider-variable change, or feature-flag enablement occurred.

## Export preflight (required)

Before using any backup/export command, run the read-only guard:

```powershell
# Approved secret manager injects DATABASE_EXPORT_URL.
# Operator environment injects PG_DUMP_PATH; do not paste database secrets.
pnpm plan:database-export
```

The guard must report `status: "ready"`. It rejects the transaction pooler
(`:6543`) used by the application because supported Supabase logical dumps
require a session pooler/direct connection on `:5432`. It also rejects missing
Supabase CLI/Docker or PostgreSQL 17 client tooling. Portable clients must also
include `pg_dumpall` beside `pg_dump` so roles can be exported. Never print or
commit the connection string, roles dump, schema dump, or data dump. Current
Supabase guidance identifies direct or session mode on port 5432 for native
PostgreSQL tools; transaction mode on 6543 remains application traffic only.

For a restored local clone, run the separate read-only verifier:

```powershell
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:<port>/postgres'
$env:ERP_PARITY_REPLAY_MAPPING_MODE = 'synthetic_clone_only'
pnpm verify:managed-supabase-parity-replay
```

It rejects remote hosts. A passing suffix result does not prove managed Auth,
Storage, vector, provider grants, owner mapping, or release readiness.

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

## Historical M3.111 snapshot (2026-08-05)

The following block is retained for audit history only. The current state is
the 2026-08-06 section above:

- PostgreSQL 17 (`server_version_num = 170006`).
- 55 hosted versions are recorded as applied; the source ledger contains 89.
- The hosted ledger is an exact prefix of source, with 34 ordered source
  versions pending review. No unexpected or out-of-order versions exist.
- The source suffix has no `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or data
  update statements; it contains 27 `drop-object` risk findings and six
  explicit transaction-control findings in the planner output.
- No hosted migration, history row, data, Storage object, or provider setting
  was changed during this audit. The release is blocked pending the isolated
  PostgreSQL 17 clone/replay, catalog/data/RLS diff, backup/restore evidence,
  and zero-skipped integration/recovery gates.
- The read-only reproducibility verifier also checks the source-only
  `stock_movement_create_requests` ledger for forced RLS, service-only
  privileges, and its three indexes. Against the current target, baseline
  catalog/RLS/security checks pass; expected failures are the 34 missing
  migration versions plus that pending ledger and indexes.

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

The current target history is a linear 55-migration prefix. Catalog/data drift
may still require a reconciliation migration after restoring the target:

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
2. Keep Project updates on the NestJS Core authority. If Core is unavailable,
   the Web action must fail closed; do not restore a direct SQL writer.
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

- Application rollback: promote the last known-good Web/API release. Do not
  restore the retired `ERP_PROJECT_WRITES_VIA_API` flag or a direct Project
  writer.
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
