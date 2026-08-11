# M3.262 bank-statement line match/unmatch authority

Date: 2026-08-11
Status: source-only complete; hosted/provider release not authorized

## Delivered

- Added strict shared match/unmatch command and discriminated result contracts.
- Added fail-closed API selectors with empty tenant allowlists.
- Added `bank_statement_line_match_requests` with tenant-matched foreign keys,
  action-target/state constraints, force RLS, and service-role-only grants.
- Added Core match/unmatch routes with capability authorization, statement and
  line locks, trusted PostgreSQL functions, idempotent replay/conflict, and
  semantic audit.
- Added a protected rollback-only local HTTP canary and migration contract
  coverage. The source migration also adds the composite tenant/line unique
  index required by the tenant-preserving foreign key.

## Evidence

- Focused canary: 1/1 PASS.
- Root `pnpm test`: exit 0; shared 54/54 files and 325/325 tests, database
  66/70 files with 235 passed and 143 environment-skipped tests, Web 111/111
  files and 768/768 tests, API 173/173 files and 754/754 tests.
- Protected API integration: 55/55 files, 69 passed, two intentional
  Redis-restart skips.
- Typecheck, lint, direct Nest/Next production builds, provider-spend,
  Supabase parity, database-release, Web/DB boundary, workflow references,
  and actionlint: PASS.
- Source parity: 55/120 hosted/source migrations; 65 pending in 13 review
  batches.

## Release boundary

The selectors remain disabled. No hosted Supabase SQL/data, Storage,
Railway/Vercel deployment, provider setting, credential, or paid action
changed. Source commit:
`271db56c6c973484877e09680eebcc99b70df950`.

Next: define reconcile/void/import authority with the same local proof before
any hosted or provider action.
