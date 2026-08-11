# Managed Supabase parity plan

- Status: `review_required`
- Snapshot: 2026-08-10 source-ledger refresh; managed boundary unchanged
- Target: `aqqrtkmtcsfkbyyqxowv` (`ERP`, `ap-northeast-2`)
- Authority: planning only; no hosted apply approved

## Verified boundary

- Managed PostgreSQL: 17.6, `ACTIVE_HEALTHY`.
- Managed ledger: 55 migrations through `20260729233017`.
- Source ledger: 118 migrations through `20260811180000`.
- Ledger shape: exact linear prefix; 63 missing, zero unexpected, zero applied
  after the first gap.
- Prior 2026-08-07 suffix scan reported 39 `drop-object`, 12 explicit
  transaction-control, and four with neither scanner flag. Those counts are
  historical; this source-ledger refresh does not claim a new SQL-risk scan.
  Any release review must recompute them against all 60 pending files.
- First pending migration refuses to continue while duplicate tenant Purchase
  Order numbers exist. Current redacted read-only result: one group, 12 rows.
- Managed catalog still reports 213 anonymous table-privilege rows and 209
  policies assigned to `PUBLIC` under the repository release planner.
- Advisors: 14 security notices and 253 performance notices.
- Default Supabase branch reports `MIGRATIONS_FAILED`; current 24-hour branch
  and Auth logs are empty, so the failure cause and age remain unproved.
- Supported export tooling is now available without changing the application
  URL: an explicit session endpoint on port 5432 plus portable PostgreSQL
  17.10 `pg_dump`/`pg_dumpall` makes the preflight report `ready`.
- The hash-valid 2026-08-06 public snapshot clone replayed the then-current
  48-file suffix to 103/103. It does not include the new semantic-index job
  migration and is no longer current parity evidence. Its duplicate
  mapping is synthetic and it lacks managed Auth, Storage, vector, and
  provider catalog surfaces.
- A new Supabase development branch currently prices at `$0.01344/hour` for
  this organization. No branch was created or confirmed.
- M3.258 added a forward-only cash-draft delete-guard repair to source only.
  The managed applied boundary remains 55 migrations through
  `20260729233017`; no hosted SQL or migration-history row changed.

Machine source: `managed-supabase-parity-plan.json`. Run:

```powershell
pnpm verify:managed-supabase-parity-plan
```

After restoring a localhost clone, verify suffix evidence separately:

```powershell
$env:ERP_PARITY_REPLAY_MAPPING_MODE = 'synthetic_clone_only'
pnpm verify:managed-supabase-parity-replay
```

The replay verifier rejects remote database hosts and always reports owner
mapping and full managed parity as unresolved for a synthetic public clone.

The verifier fails if source count/head changes, the hosted boundary is absent
from source, a migration is missing/duplicated/reordered, or batch totals no
longer equal the exact pending suffix.

## Ordered review batches

The eleven manifest batches are review checkpoints only. They do not authorize
independent production deployments and must never reorder the migration
ledger. A production failure after any committed migration is a partial apply
and invokes the database recovery plan.

1. Purchase Order uniqueness gate: 1 migration. Requires owner-approved
   remediation for all 12 duplicate rows before rehearsal.
2. Procurement and document authority: 9 migrations.
3. Finance, delivery, and invoice workflows: 15 migrations.
4. Cash, document, and external sessions: 6 migrations.
5. Project, inventory, Cost Entry, asset, and security foundations: 11
   migrations.
6. Latest authority/security hardening: 7 migrations.
7. Cortex provider authority: 8 migrations.
8. Document intake authority: 1 migration.
9. Project discussion authority: 2 migrations.
10. Opportunity stage authority: 1 migration.
11. Cash-draft delete guard fix: 1 migration.

Exact filenames live in the machine manifest and are checked against
`supabase/migrations`.

## Zero-cost path first

1. Keep hosted SQL, branches, provider variables, canary flags, Vercel, and
   Railway unchanged.
2. Obtain database-owner approval for a Purchase Order mapping stored outside
   Git. Run the existing mapping preflight until it reports `ready`.
3. Restore a fresh, complete managed backup/PITR artifact into isolated
   PostgreSQL 17. Export tooling is ready, but the supplemental public-schema
   dump remains insufficient for Auth, Storage objects, vector, roles, grants,
   or managed schemas.
4. Apply the owner-approved mapping only to the isolated clone. Never use a
   synthetic rename as production evidence.
5. Apply all 60 migrations to the clone in source order, pausing only for
   review evidence. Run no-skip database/API integration, schema/catalog diff,
   RLS/privilege checks, tenant isolation, audit recovery, Redis recovery, and
   protected workflow/browser smoke checks.
6. Prove Auth/public-user identity integrity without emitting email, tokens,
   passwords, UUIDs, or user metadata. Confirm no user role is sourced from
   editable `user_metadata`.
7. Inventory and separately protect Storage objects. Database backup restores
   Storage metadata, not deleted object contents.
8. Run the controlled release planner with exact Web/API SHA, readiness,
   rollback, spend, and one-tenant canary evidence.

## Optional managed branch

Use only after local evidence passes and the owner explicitly confirms the
hourly cost. Before creation, call the provider cost endpoint again because
pricing can change. Set an immediate deletion deadline and maximum approved
hours. Never create a branch merely to replace the free local replay.

## Production apply gate

All must be true:

- Duplicate mapping owner-approved and replayed without collision.
- Managed backup/PITR point plus successful isolated restore drill.
- Separate Storage object recovery evidence.
- Exact 115-migration rehearsal with zero skips and no catalog/data drift.
- Auth/public-user identity, tenant isolation, semantic audit, and privilege
  closure proven.
- Security notices triaged; `auth_tenant_id()` anonymous execution removed by
  the reviewed suffix; remaining privileged functions justified or closed.
- Exact Git SHA, clean CI/local equivalent, Railway readiness, Redis recovery,
  Vercel rollback, and explicit spend ceiling approved.
- Maintenance/abort owners named and reachable.

## Abort and rollback

Abort on duplicate/stale data, lock timeout, migration error, cross-tenant
visibility, audit discontinuity, Auth identity mismatch, row/financial drift,
readiness failure, or spend ceiling breach.

- Before production: delete only an explicitly approved temporary branch;
  local disposable databases may be destroyed after evidence capture.
- Application: keep all Core/Web canary flags false and retain the last
  known-good Web/API releases.
- Database: partial suffix apply requires approved PITR/backup restoration or
  a reviewed fix-forward migration. Never edit the managed migration ledger.
- Storage: restore objects through the separate object recovery path.

## Exact next action

Database owner supplies the external 12-row Purchase Order mapping. Restore a
fresh complete managed backup/PITR artifact with Auth, Storage, vector, roles,
grants, and provider catalog surfaces, then run the zero-skip clone gates.
Until both exist, remain read-only. Do not apply migration `20260801090000`,
create a paid branch, or deploy an application.
