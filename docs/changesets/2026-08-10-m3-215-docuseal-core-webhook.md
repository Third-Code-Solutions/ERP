# M3.215 — Core-owned DocuSeal webhook transaction

## Outcome

DocuSeal completion callbacks now have a source-only NestJS authority seam.
It is closed by default and can be selected only for exact tenant UUIDs.

## Changed

- Added shared strict webhook command/result contracts.
- Added a secret-authenticated public Nest endpoint and transaction service.
- Added portal-token locking, tenant-matched BOM locking, signed-document
  persistence, duplicate replay suppression, and semantic audit.
- Added the Web exact-tenant adapter with terminal selected-Core errors and
  compatibility notification delivery after a first successful commit.

## Evidence and limits

Focused shared/API/Web tests and package typechecks pass. Root `pnpm test`,
lint, production build (82/82 routes), Web DB-boundary, migration files-only,
workflow-reference, provider-spend, and diff checks pass. PostgreSQL/RLS
replay, protected webhook/browser evidence, hosted release identity, and
provider deployment were not run; Docker is not healthy. No SQL, Supabase,
Vercel, Railway, or paid state changed. Both selectors remain false/empty.
