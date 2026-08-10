# M3.238 CRM accounts protected local HTTP canary

Status: source-only complete; Web cutover closed

## Scope

- Add disposable protected HTTP evidence for the existing CRM account list,
  detail, and KYC queue Nest routes.
- Exercise the real identity and capability guards, strict list pipe, service,
  and transaction-bound PostgreSQL client.
- Prove tenant isolation, bounded filters/limits, related graph projection,
  KYC capability separation, concealed cross-tenant reads, and rollback.

## Changed files

- `apps/api/integration/accounts.http.integration.spec.ts`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/architecture/CAPABILITY_MATRIX.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`

## Verification

- PASS: focused protected canary, 1/1.
- PASS: root `pnpm test`, 173 files / 750 tests.
- PASS: root typecheck 5/5 tasks, lint 2/2 tasks, and production build.
- PASS: disposable PostgreSQL 17 / Redis 7.4.9 lane after 116 migrations;
  zero-skip database/API integration gates and unchanged schema.
- PASS: direct canary rerun against the disposable runtime, 1/1.

## Rollout and rollback

No Web selector or runtime authority changed. Existing account compatibility
reads remain the production path; no schema migration, hosted Supabase write,
Vercel/Railway deployment, provider setting, credential, or paid action
occurred. A future cutover must first verify hosted parity, exact Core release
identity, readiness, protected browser behavior, rollback, and spend approval.
