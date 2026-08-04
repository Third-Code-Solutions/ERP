# M3.39 — Durable project-create idempotency

## Outcome

Project creation now has a durable, tenant-scoped retry contract at the Nest
authority boundary. A bounded `Idempotency-Key` is normalized and hashed with
the shared command. PostgreSQL claims the key, serializes replay reads, stores
the typed result, and commits the project and semantic audit in one
transaction. Safe retries replay; same-key/different-payload requests
conflict; failed transactions leave no project or replay row.

## Source changes

- `supabase/migrations/20260804090000_project_create_idempotency.sql`
- `packages/database/src/schema/project-create-requests.ts`
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/src/projects/projects.service.ts`
- `apps/web/src/app/(dashboard)/projects/new/actions.ts`
- `apps/web/src/app/(dashboard)/projects/new/new-project-form.tsx`
- `apps/web/src/lib/erp-core-client.ts`
- Contract and database integration tests for the two-tenant replay boundary.

## Verification

Source commit: `b77227df402082d494538b92d706f7f092fa1fe5`.

- Disposable PostgreSQL 17 + Redis: 87/87 migrations; database 306/306 tests
  with zero skips; API integration 15 files / 22 tests.
- Focused API 13/13; web core adapter 72/72; shared 162/162; web 438/438;
  API 294/294; lint, typecheck, `git diff --check`, and production build
  78/78 pages.

## Release boundary

Both project-create feature flags remain closed. Supabase hosted SQL/data,
Storage, and provider settings were not changed; Vercel was not built or
promoted. Next action is an approved backup/catalog/data/RLS/Storage
reconciliation from the hosted 55-row prefix to source head 87, followed by a
single spend-bounded canary.
