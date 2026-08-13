# WO-17 — Cost control v1

## Scope

- Replaced project cost-control aggregation with a tenant/project-scoped
  Budget → PO commitment → posted supplier-bill actual view.
- Preserved `(cost_code_id, bom_line_item_id)` at every control grain and
  surfaced BOM-line drilldown in project Cost and Budget Control screens.
- Added supplier-bill BOM-line provenance, database backfill, composite tenant
  foreign key, and a trigger that prevents a bill allocation from changing its
  PO-line BOM dimension.
- Kept manual and legacy `cost_entries` visible in the cost log, but surfaced
  them as unreconciled evidence instead of silently mixing them into posted
  supplier-bill actuals.
- Updated dashboard GP-erosion alerts to use the same posted-invoice actual
  source of truth.

## Verification

- PASS — `pnpm --filter @third-code-erp/shared-types typecheck`
- PASS — `pnpm --filter @third-code-erp/database typecheck`
- PASS — `pnpm --filter @third-code-erp/web typecheck`
- PASS — shared-types tests: 130/130
- PASS — web tests: 359 passed, 2 pre-existing integration skips
- PASS — Next production build: 80 routes
- PASS — disposable PostgreSQL 17 + Redis 7.4.9 lane: 68 migrations,
  database tests 264/264, API integration 3/3
- PASS — targeted WO-17 runtime proof: posted supplier bill actuals retained
  the PO/BOM-line dimension, budget/commitment/actual totals were
  100000/70000/30000 centavos, and mismatched BOM-line allocation was rejected
- PASS — local production browser smoke: 4/4
- NOT RUN — authenticated browser Cost Control journey; local Supabase Auth is
  not provisioned in the disposable lane
- BLOCKED — hosted Supabase promotion remains closed; provider-linked schema
  divergence and duplicate hosted purchase-order evidence are unresolved.

## Operational notes

The hosted database was not written. Apply this migration only after the
provider-specific release gates are resolved and a rollback/backup decision is
approved.
