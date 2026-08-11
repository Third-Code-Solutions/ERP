# M3.263 bank-statement reconciliation authority

## Outcome

Added a source-only Nest Core command at
`POST /v1/finance/reconciliation/:statementId/reconcile`. It accepts a strict
empty body plus an opaque `Idempotency-Key`, re-authorizes the tenant Finance
principal, locks the tenant-scoped statement, calls the existing trusted
PostgreSQL reconciliation function, stores a durable replay/conflict result,
and writes semantic audit in the same transaction. The new request ledger is
force-RLS and service-role-only. The existing Web Server Action remains the
compatibility path and the new selector is disabled by default.

## Evidence

- Rollback-only local PostgreSQL HTTP canary: 1/1 PASS.
- Root `pnpm test`: shared 54/54 files, 326 passed; database 67/71 files,
  237 passed and 143 environment-skipped; Web 111/111 files, 768 passed; API
  173/173 files, 755 passed.
- API integration: 55/55 files, 69 passed, two intentional Redis-restart
  skips.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, database migration contract,
  provider-spend guard, parity, release, boundary, workflow-reference, and
  actionlint gates passed.

## Release boundary

Source ledger is 121 migrations; managed Supabase remains 55 applied with 66
pending in 14 review batches. The migration was applied only to the disposable
local CI database. No hosted SQL/data, Storage, Railway/Vercel deployment,
provider setting, credential, or paid action changed. Keep
`ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED=false` and its tenant list
empty until hosted parity, readiness, protected browser cutover, rollback, and
spend evidence are separately approved. Source commit:
`378339a53e71f2f8290f0dd21d8ed6bd1b89e2fb`.

## Rollback

Disable the selector to close the command. For source rollback, revert the
source commit and remove the local disposable database; do not edit managed
Supabase migration history. Any hosted partial apply requires the approved
PITR/fix-forward recovery plan.
