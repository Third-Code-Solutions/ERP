# M3.265 — Bank-statement import authority

Status: completed source-only local canary; hosted apply is not approved.

## Delivered

- Shared the existing pure bank-statement CSV parser between Web and Core.
- Added strict import body/result contracts with tenant-scoped Cash Account,
  safe integer-cent balances, statement date range, and a 2 MB source cap.
- Added `POST /v1/finance/reconciliation/import` in Nest Core behind
  `finance.manage_cash` and a false/empty tenant feature flag.
- Added a force-RLS, service-role-only request ledger with idempotent replay,
  tenant-matched foreign keys, state constraints, and semantic audit.
- Validated CSV lines, date range, duplicate fingerprints, balance roll-forward,
  active account ownership, and draft-only creation in one transaction.

## Evidence

- Local PostgreSQL rollback-only HTTP canary: 1/1 PASS.
- Migration contract: 1/1 PASS.
- Root tests: shared 55/55 files and 329/329 tests; database 69/73 files,
  240 passed and 143 environment-skipped; API 173/173 files and 757/757
  tests; Web 111/111 files and 768/768 tests.
- Protected API integration: 55/55 files, 69 passed, two intentional
  Redis-restart skips.
- Typecheck, lint, production build, release, parity, boundary, workflow,
  provider-spend, and actionlint gates: PASS.

## Release boundary

Source ledger is 123 migrations; managed Supabase remains at 55 applied with
68 ordered pending in 16 review batches. The migration was applied only to the
disposable local CI database. No hosted SQL/data, Storage, Railway/Vercel
deployment, provider setting, credential, or paid action changed. The flag and
tenant list must remain closed. Object-storage upload and Web/Core response
parity are the next source gates. Source evidence SHA:
`1adc7cf3e47791bf09b9eb659e972422da356c73`.
