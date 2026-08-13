# BUILD OPS WO-00 migration and data invariants

## Outcome

Added fail-closed BUILD OPS checks for new migration files:

- monetary columns containing `cost`, `price`, `rate`, `amount`, `total`,
  `centavos`, or `value` cannot use floating point or unscaled `numeric`;
- tenant-scoped `CREATE TABLE` statements must declare `tenant_id NOT NULL`;
- database records beginning with `E2E_` are rejected outside an explicit demo
  tenant allowlist.

The GitHub Actions gate scans only migrations changed by the commit or pull
request, while the local command audits the complete migration directory.
Database reproducibility now runs the data invariant after a disposable reset
with the seeded `abi-ops-local` demo tenant allowlist.

## Validation

- `pnpm test:build-ops-invariants`: PASS, 6/6 tests.
- `pnpm verify:build-ops-invariants`: PASS, current migration set.
- `pnpm ci:actionlint`: PASS, actionlint 1.7.12.
- `pnpm test:database-release-plan`: PASS, 7/7.
- `pnpm test:project-cutover-plan`: PASS, 6/6.
- Local database reproducibility: NOT RUN; Supabase CLI is unavailable and
  Docker is not running.
- Target Supabase read-only probe: static invariant PASS. With the target's
  two tenant IDs selected only when their slugs matched the demo/test/local/e2e
  safety pattern, the E2E data invariant PASSed. This is conditional evidence,
  not a production migration or production-readiness approval.

## Runtime and deployment impact

No database, data, Auth, Storage, or production deployment mutation was run.
The target migration ledger remains unreconciled and blocks `supabase db push`.

## Rollback

Revert the invariant script, its tests, package scripts, CI job, and this
changeset together. No database rollback is required because no database write
occurred.
