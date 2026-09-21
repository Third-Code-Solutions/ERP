# WO-17 — Exclude voided manual costs from rollups

## Scope

- Excluded `cost_entries` rows with a non-null `voided_at` from the fallback
  cost-code, dashboard batch, and full BOM/detail project cost-control
  projections.
- Preserved posted supplier-bill actuals, PO commitments, approved baselines,
  and existing tenant/project predicates.
- Added focused active → voided-only → restored read-model coverage proving no
  unreconciled amount or phantom dimension remains and a restored entry appears
  once.

## Verification

- PASS — `pnpm --dir apps/web exec vitest run src/lib/operations/project-cost-control.test.ts --reporter=dot`
  (1 file, 6 tests).
- PASS — `pnpm --config.engine-strict=false test:wo-17-contract`.
- PASS — `pnpm --config.engine-strict=false --filter @third-code-erp/web typecheck`.
- PASS — `pnpm --config.engine-strict=false --filter @third-code-erp/web lint`.
- PASS — `git diff --check`.
- NOT RUN — live PostgreSQL lifecycle evidence; the focused operation tests use
  a mocked database executor and no hosted database was written.

## Limitations

- No schema, migration, API contract, supplier-bill, commitment, baseline, or
  browser behavior was changed.
- This branch was not deployed; parent integration owns merge, release gates,
  and deployment verification.
