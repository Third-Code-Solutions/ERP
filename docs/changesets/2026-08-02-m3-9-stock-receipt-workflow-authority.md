# M3.9 — Stock Receipt post/reversal authority

Date: 2026-08-02

## Scope

Move Stock Receipt posting and reversal behind incremental NestJS command
boundaries while preserving the existing Next.js UI and disabled-by-default
compatibility behavior.

## Delivered

- `POST /v1/inventory/stock-receipts/:receiptId/post`
- `POST /v1/inventory/stock-receipts/:receiptId/reverse`
- Strict shared command/result contracts.
- `stock_receipt_workflow_requests` tenant-scoped idempotency table with
  composite foreign keys, state/result constraints, forced RLS, and
  service-only privileges.
- Existing PostgreSQL posting/reversal functions remain the official
  inventory/ledger authority.
- Same-transaction membership/RBAC recheck, receipt lock, idempotency replay,
  result persistence, and semantic audit evidence.
- Independent Next selectors and stable browser retry refs. Selected core
  paths fail closed and never fall back to direct RPCs.

## Verification

- API: 30 files / 140 tests.
- Web: 58 files / 353 tests.
- Shared contracts: 10 files / 123 tests.
- Database contract suites pass; the normal local database runtime suite keeps
  its explicit 137 environment-gated skips.
- Workspace lint, typecheck, production build (78/78 routes), Actionlint,
  Gitleaks, release-plan tests, and `git diff --check` pass.
- Disposable WSL1 PostgreSQL 17/Redis 7.4.9 lane: 67/67 migrations,
  260/260 DB assertions without skips, 18/18 Nest/Redis integration tests.
  One unrelated BullMQ Redis-loss test flaked once and passed on immediate
  rerun.

## Release boundary

No hosted SQL, feature flag, queue, provider setting, business data, Railway
deployment, or Vercel deployment was changed. Supabase remains at 55 applied
migrations versus 67 in source. One duplicate Purchase Order group contains
12 records, and `AUDIT_RECOVERY_TENANT_ID` remains owner-required. Railway and
Vercel readiness are healthy, but the hosted planner remains `review_required`.

Source/CI evidence: commit `6121740ea2a3db189e7cc1c5e83f970db73f6b74` was
pushed under `kurtgav`; CI run `30740581304` passed all executable jobs. E2E
remains credential-gated. This does not authorize hosted migration or provider
deployment.

## Rollback

Before canary activation, keep all post/reverse frontend and API flags false or
empty. A source rollback is the prior commit. If a canary is later approved,
disable both selectors first, confirm legacy routing, and use the existing
database reversal function for any explicitly authorized reversible demo
transaction. Do not delete idempotency or audit evidence.
