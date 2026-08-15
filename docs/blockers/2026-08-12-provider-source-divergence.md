# Provider source and workspace divergence

> Superseding note — 2026-08-13: the historical blocker below records the
> source divergence that existed before the explicit local release. The
> additive local migration set was subsequently pushed to the requested
> Supabase target and the current Vercel/Railway runtimes were deployed and
> verified. The source-authority blocker remains open for Git reproducibility,
> CI publication, and the M1 canary; it is not a claim that the current hosted
> runtime or database is still at the historical 55/124 state.

> Superseding evidence — 2026-08-16: the read-only provider-source planner at
> the current `main` migration tree reports PostgreSQL 17, 144/144
> migrations, zero pending migrations, and no duplicate Purchase Order groups.
> The source-parity portion of this blocker is closed. Production promotion
> remains separately blocked by the production-data boundary and missing
> provider access tokens.

## Status

HISTORICAL BLOCKER — source parity was subsequently rechecked and reconciled
on 2026-08-16. The evidence below records the earlier source divergence; it is
not the current migration-parity state. Remaining production blockers are
tracked in the dated production-promotion evidence.

## Evidence

- Local `HEAD`: `8268bbf93fae23c4584c4d0485ded784e07e08b4`.
- `origin/main`: `7cd3306681e68528897de792dbef46b3aefee3a3`.
- Local branch is behind `origin/main` by 603 commits.
- Local workspace filesystem has 68 migration files (54 tracked and 14
  untracked), including local-only WO-02 through WO-18 work. `origin/main` has
  124 migration files; 69 provider migrations are absent from the local
  workspace filesystem.
- Supabase branch-action logs explicitly report cloning Git ref `main` and
  attempting `20260801090000_purchase_order_create_idempotency.sql`, which is
  present in `origin/main` but absent from the local workspace migration
  directory.
- That migration aborts because duplicate `(tenant_id, po_number)` values
  exist. Read-only catalog evidence identifies 12 distinct `PO-0002` rows in
  the `buildops-e2e` tenant.
- Provider-source read-only planning reports 124 source migrations, 55 applied,
  69 pending, source head `20260812150000`, and one duplicate PO group. Its
  conservative pending-SQL scan reports 52 `drop-object` and 21
  `transaction-control` findings requiring review; these are risk flags, not
  proof that each statement is destructive.
- A source-tree search of provider-linked `origin/main` finds no
  `business_calendar_holidays`, `process_steps`, `task_instances`,
  `sla_clocks`, or `approval_rules` implementation. The WO-02 code and proposal
  currently exist only in the dirty local workspace; they are not provider
  source until an explicit source reconciliation is completed.
- On 2026-08-13, all 124 provider-linked migrations replayed in order on a
  fresh disposable local PostgreSQL 17 database. This proves structural
  replayability only; it does not reconcile hosted data or authorize promotion.

## Consequence

The previously reported 55/55 parity is valid only for the current local
workspace snapshot. It is not proof that the provider's current Git-linked
`main` source and the hosted target are reconciled. Pulling, rebasing, merging,
committing, or pushing is not safe while the worktree is dirty and the source
authority has not been confirmed.

No Git history rewrite, pull, push, migration application, or data mutation was
performed.

## Hosted catalog verification

Read-only checks ran with the selected Supabase `DATABASE_URL` on 2026-08-13:

- Audit coverage: 71/86 tenant-scoped tables. Missing triggers include Cortex,
  documents, embeddings, financial sequences, notifications, PO line items,
  project comments, scope items, users, and vendors.
- WO-02 database gate: 9 failures; business calendar table, columns, RLS,
  policies, audit trigger, and `audit_log.entity_key` are absent.
- WO-04 database gate: 8 failures; grain-review table, columns, RLS,
  policies, audit trigger, and classification fields are absent.
- WO-05 database gate: 17 failures; location and location-review tables,
  columns, RLS, policies, triggers, and rollup fields are absent.
- WO-06 database gate: 67 failures; material, labour, equipment, assembly,
  price-history, DUPA tables, policies, triggers, money columns, and recompute
  function are absent.
- BUILD OPS static invariants pass, but database check did not run because no
  approved demo-tenant selector was configured.
- WO-06 behavior check was not run because it performs transactional writes;
  no hosted mutation was authorized.

## Required resolution

1. Confirm the intended source authority: this local worktree or the current
   provider-linked `origin/main`.
2. Preserve and review the 603-commit source delta before any promotion.
3. Reconcile the duplicate PO data on an isolated restored/staging database,
   then replay the complete provider migration set there.
4. Verify one exact clean release SHA across Git, Supabase, Vercel, and any API
   deployment before production release.

## Latest read-only data evidence

The duplicate group is the `buildops-e2e` tenant (`BuildOps E2E Tenant`) and
contains 12 `PO-0002` rows for one E2E project. Tenant is not disposable:
read-only counts show 13 users, 24 projects, 13 Purchase Orders, and 676 audit
rows. Duplicate rows span `draft`, `pending_pm_approval`,
`pending_scm_issuance`, and `issued` states. Each row has one PO line item; six
rows have delivery schedules; no row has a stock receipt or supplier bill.
Issued rows have audit history and cannot be silently deleted or merged. This
evidence supports a controlled reconciliation plan, not an automatic
production update. No hosted rows were changed.
