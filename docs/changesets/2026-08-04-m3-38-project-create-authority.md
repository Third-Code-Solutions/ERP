# M3.38 — Guarded project-create authority seam

## Scope

Move the first project-creation transaction boundary toward the NestJS modular
monolith without changing the default live behavior.

## Source changes

- Shared strict command/result schemas in `packages/shared-types`.
- Nest `POST /v1/projects` controller, Zod pipe, capability guard, tenant
  transaction, actor stamping, and audit context.
- Frontend typed core-client adapter and exact tenant/feature flags.
- Existing Server Action continues to use the legacy path when the adapter flag
  is false; no fallback is allowed after the core path is selected.
- Configuration defaults keep both flags closed and the Nest service fails
  closed unless its explicit tenant allowlist is populated.

## Verification

- Shared tests: 162/162.
- API serial tests: 57 files / 291 tests.
- Web tests: 438/438.
- Lint, typecheck, and production build: pass; Next generated 78/78 pages.
- Parallel test run had two unrelated 5-second API resource-contention
  timeouts; deterministic serial Turbo run passed.

## Release boundary

No Supabase hosted SQL, migration ledger row, Storage object, Railway variable,
Vercel build, Git reconnection, or domain promotion was performed. Next gate:
durable tenant-scoped idempotency/replay, two-tenant PostgreSQL/Redis evidence,
rollback/recovery, catalog/data/RLS/backup proof, and owner/provider/spend
approval before a canary.
