# M3.143 - Core-only Cost Entry deletion action

## Scope

- Route the existing Project cost delete Server Action through the typed
  NestJS Core DELETE command.
- Preserve the current Cost Table caller and visible UI copy.
- Supply bounded reason/idempotency defaults, while accepting explicit values
  for future command surfaces.
- Verify tenant, Project, entry, manual source, and `voided` state before
  revalidation.
- Remove direct database deletion and duplicate Web audit fallback.

## Safety boundary

`ERP_COST_ENTRY_DELETE_WRITES_ENABLED` remains `false` and
`ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS` remains empty. The void migration is
source-only and was not applied to hosted Supabase. No Vercel or Railway
deployment, provider-variable change, or tenant-data mutation occurred.

## Validation

- Focused Web deletion action/client: 14/14.
- Serial workspace tests: shared 27/230, database 48/52 files with 186
  passed/141 skipped, API 114/489, Web 92/600.
- Production build: 81/81 routes.
- Typecheck/lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, provider-spend 4/4: passed.

Database skips require `DATABASE_URL`; disposable PostgreSQL/Redis replay
remains the no-skip evidence. The initial parallel workspace run hit three
pre-existing Nest controller timeouts; the same API suite passed with Turbo
package concurrency constrained to one.

## Rollback

Rollback is the reviewed prior Web/API source release. Do not re-enable a
direct database delete. Keep the Core delete gate closed until restore and
managed-provider evidence are approved.
