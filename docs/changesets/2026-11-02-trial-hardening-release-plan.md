# Trial-hardening release plan (PR #126)

Status: **CI green, production NOT promoted.** Hosted apply stays unapproved
until the recovery evidence in step 0 exists (`hostedApplyApproved: false` in
`docs/operations/managed-supabase-parity-plan.json`).

## Read-only production evidence (2026-11-02)

Observed through read-only queries; nothing was written to any provider.

| Item | Observation |
|---|---|
| Migration ledger | 177 applied, equal to `origin/main`; head `20260921181036`. 11 migrations pending (this PR). |
| Postgres | 17.6 on project `aqqrtkmtcsfkbyyqxowv`; `revoke ... maintain` is valid. |
| WAL | `archive_mode=on`, `wal_level=logical`. Hint only; not proof of PITR or a restorable backup. |
| Data size | 14 tenants, 12 users (all active), 6 projects, 3 BOMs, 8 BOM lines, 2 PO lines, 3 invoices, 0 reservations, 0 pending invitations, 1 platform owner. |
| Abort conditions | `bom_line_items.quantity` and `po_line_items.quantity` are `integer`; 0 rows outside 0..2147483647, so `bom_quantity_exact_range` validates. New FK columns are nullable. Only the 1 draft BOM is repriced; the approved and locked BOMs keep `legacy_unreviewed` snapshots. |
| Lock impact | Table rewrites touch single-digit row counts. Duration is not a concern at this size. |
| Core API deploy trigger | Railway service is connected to GitHub `main` with `checkSuites: false`. **Merging to `main` deploys the Core API to production with no CI gate.** |

## Why a merge cannot come first

The Core API in this PR expects the new schema (exact BOM pricing, server-owned
writes, upload quota, invite provisioning). `docs/operations/managed-supabase-parity-plan.json`
records that Web and Core must be deployed together with the migrations. The
production promotion workflow is deliberately code-only and fails
`plan-database-release --require-current` while any migration is pending.

## Sequence

0. **Recovery evidence** (owner, `docs/runbooks/database-release.md` phase 2):
   newest restorable backup or PITR point recorded from the Supabase dashboard;
   Storage object inventory; a restore rehearsed into an isolated project;
   database owner plus an independent reviewer on record. Then set
   `hostedApplyApproved` for the two batches.
1. Maintenance window: pause background jobs, put write-capable paths in
   maintenance mode (runbook phase 4).
2. Apply the 11 migrations from the PR branch with the sanctioned release path
   (`supabase db push` using `SUPABASE_MIGRATION_DATABASE_URL`). Do **not** use an
   ad hoc SQL tool: it would stamp different versions and break the ledger gate.
3. Merge PR #126. Railway deploys the Core API from `main` immediately.
4. Dispatch the `Production promotion` workflow for the merge commit (Web, CAD,
   health and release identity, role matrix, cross-tenant isolation).
5. Verify: `/ready` database and redis ok; `/api/health` shows the new revision;
   invite a user and confirm they land in the inviter's tenant; a cross-tenant
   read fails; one BOM line and one PO round trip.
6. Leave maintenance mode.

## Recovery

Forward-only for the migrations (see each file's recovery note; never narrow
widened quantities, never remove posted evidence). Application rollback: promote
the last known-good Web and Core release.
