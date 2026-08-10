# M3.239 CRM opportunity detail protected local HTTP canary

Status: source-only complete; Web cutover closed

## Scope

- Add disposable protected HTTP evidence for the existing Nest opportunity
  detail route.
- Exercise real identity/capability guards and tenant-scoped related reads.
- Prove PPRF/inspection/design/change-request progress projection, malformed
  UUID rejection, cross-tenant concealment, and rollback.

## Changed files

- `apps/api/integration/opportunities.http.integration.spec.ts`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/architecture/CAPABILITY_MATRIX.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`

## Verification

- PASS: focused protected canary, 1/1 against disposable PostgreSQL.
- PASS: opportunity service/controller checks.
- PASS: API typecheck and opportunity service/controller checks.
- PASS: root `pnpm test`, 173 files / 750 tests.
- PASS: root typecheck 5/5 tasks, lint 2/2 tasks, and production build.
- PASS: disposable PostgreSQL 17 / Redis 7.4.9 lane after 116 migrations;
  zero-skip database/API integration gates and unchanged schema.
- PASS: direct canary rerun against the disposable runtime, 1/1.
- PASS: DB-boundary, provider-spend, managed-parity, workflow-ref, actionlint,
  and diff-hygiene guards.

## Rollout and rollback

No Web selector or runtime authority changed. Existing direct compatibility
reads remain the production path; no schema migration, hosted Supabase write,
Vercel/Railway deployment, provider setting, credential, or paid action
occurred. The canary is rollback-only evidence; future Web cutover requires
hosted parity, exact Core release identity, readiness, protected browser
behavior, rollback, and explicit spend approval.
