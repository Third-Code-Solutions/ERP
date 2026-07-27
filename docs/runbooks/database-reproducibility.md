# Database reproducibility

## Purpose

Every pull request and `main` push must prove the committed Supabase migration
ledger can create Third Code ERP from zero on PostgreSQL 17. The gate is local
and secret-free. It never links to, pushes to, resets, or repairs a hosted
project.

Pinned CI runtime:

- Supabase CLI `2.109.1`
- `supabase/setup-cli` `v3.0.0`, pinned to commit
  `46f7f98c7f948ad727d22c1e67fab04c223a0520`
- PostgreSQL major version `17`, declared in `supabase/config.toml`

## What the gate proves

1. `supabase db start` creates an isolated Docker database.
2. `supabase db reset --local` reapplies every migration and
   `supabase/seed.sql` from zero.
3. `scripts/verify-database-repro.mjs` checks:
   - the required June migration files and exact applied ledger;
   - PostgreSQL 17;
   - Cortex/cost tables, RLS, policies, indexes, and triggers;
   - fixed `search_path` on required `SECURITY DEFINER` functions;
   - no `PUBLIC`, `anon`, or `authenticated` execution of privileged
     functions;
   - no client `TRUNCATE`, `TRIGGER`, or `REFERENCES` privileges;
   - minimum authenticated table/column access behind RLS.
4. Database Vitest suites run with an explicit local `DATABASE_URL`.
   `scripts/assert-vitest-no-skips.mjs` fails on zero, skipped, pending, todo,
   or failed tests.
5. `supabase migration list --local` is captured as evidence.
6. `supabase db diff --local --schema public` must be empty.

The CI artifact `database-reproducibility` retains the migration list, Vitest
JSON, and schema diff for seven days.

## Local run

Prerequisites: Node.js 22+, pnpm 10.33.0, Docker with virtualization enabled,
and the pinned Supabase CLI.

PowerShell:

```powershell
npm exec --yes supabase@2.109.1 -- db start
npm exec --yes supabase@2.109.1 -- db reset --local
$env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$env:DATABASE_HARDENING_EXPECTED = '1'
$artifactDirectory = Join-Path (Get-Location) 'tmp/database-reproducibility'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$testReport = Join-Path $artifactDirectory 'database-vitest.json'
$schemaDiff = Join-Path $artifactDirectory 'schema-diff.sql'
node scripts/verify-database-repro.mjs
corepack pnpm --filter @third-code-erp/database exec vitest run --reporter=json --outputFile=$testReport
node scripts/assert-vitest-no-skips.mjs $testReport
npm exec --yes supabase@2.109.1 -- db diff --local --schema public --output $schemaDiff
node scripts/assert-empty-schema-diff.mjs $schemaDiff
```

Static ledger-only check when Docker is unavailable:

```powershell
node scripts/verify-database-repro.mjs --files-only
```

`--files-only` is diagnostic only. CI never uses it and therefore cannot
silently skip catalog or RLS verification.

## Hosted database boundary

Do not add `--linked`, `--db-url`, `supabase db push`, or
`supabase migration repair` to this gate. Production history recovery requires
a backup, catalog equivalence evidence, staging rehearsal, and explicit release
authorization.
