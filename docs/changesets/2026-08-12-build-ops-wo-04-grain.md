# WO-04 grain classification

## Status

PARTIALLY VERIFIED. Local implementation and static/type checks pass. The
hosted migration was not applied because the provider migration ledger is
divergent and the pending provider sequence is blocked by unresolved duplicate
synthetic PO numbers.

## Delivered

- Added additive M-01 migration for `bom_line_items` grain fields, rate source,
  classification status, tenant-safe parent identity, indexes, and a durable
  tenant-scoped grain review queue.
- Classified approved UOMs only. Ambiguous UOMs remain in review. Material lines
  remain in review until an estimator selects a parent work item.
- Added typed classifier tests and a static migration safety gate.
- Added BOM review UI and a server action that requires an explicit same-BOM,
  same-tenant classified work-item parent. No auto-reparenting.
- Added CI execution for the WO-04 static gate.

## Verification

- PASS `pnpm --filter @third-code-erp/shared-types test -- src/bom/__tests__/grain.test.ts` (12 tests)
- PASS `pnpm --filter @third-code-erp/shared-types typecheck`
- PASS `pnpm --filter @third-code-erp/database typecheck`
- PASS `pnpm --filter @third-code-erp/web typecheck`
- PASS `pnpm test:wo-04-migration`
- PASS `pnpm verify:build-ops-invariants`
- PASS `pnpm verify:wo-04-database` against the isolated PostgreSQL 17 lane
- PASS `pnpm ci:actionlint`
- PASS `scripts/ci/run-wsl1-database-lane.ps1` (PostgreSQL 17, 58 local migrations, schema sha256 `AB7CDF7EFC9B15F5EFA8AD8A4281357505ECE0D7E1552F9B38CA3C337AFBF732`, 236/236 database tests without skips, 3 API database integration tests)
- PASS built-runtime Playwright `e2e/auth.spec.ts` (3 browser tests, installed Chrome)

## Not run / blocked

- NOT RUN staging migration, because no separate staging Supabase target is configured.
- NOT RUN hosted migration, because provider/source migration history is not
  reconciled and the duplicate PO decision is unresolved.
- NOT RUN project-scoped browser E2E for this queue, because the target database
  does not yet contain the M-01 columns/table.
