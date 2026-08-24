# Durable document-upload reservation foundation

- Date: 2026-08-24
- Finding: AUD-004
- ADR: `docs/adrs/ADR-027-durable-signed-upload-reservations.md`
- Scope: Agent 04 schema foundation only
- Deployment: not deployed; feature authority remains disabled

## Outcome

Added the additive, server-only reservation ledger required to serialize signed
document uploads before Core and Web cutover work begins. A reservation is bound
to one tenant, active project, actor, immutable Storage path, request hash, and
idempotency key. The database enforces the four-state lifecycle, fixed two-hour
expiry, 100 MiB declared-file limit, same-project completion link, terminal
immutability, and monotonic cleanup evidence.

Completed document deletion preserves reservation evidence by nulling only the
`document_id` column of the tenant/project/document foreign key. PostgreSQL 16
column-list `SET NULL (document_id)` is authoritative; Drizzle intentionally
models the nearest safe `NO ACTION` behavior because its foreign-key builder
cannot express column-list referential actions. Contract tests make this known
divergence explicit.

The table enables and forces RLS, denies and revokes direct `anon` and
`authenticated` access, and grants only the required table operations to the
Supabase `service_role`. No application object was added to a Supabase-managed
schema and no hosted provider state was changed.

## Changed areas

- `supabase/migrations/20260824110438_document_upload_reservations.sql`
- `packages/database/src/schema/document-upload-reservations.ts`
- `packages/database/src/schema/documents.ts`
- `packages/database/src/schema/enums.ts`
- `packages/database/src/schema/index.ts`
- `packages/database/src/__tests__/document-upload-reservations.test.ts`
- `packages/database/scripts/verify-document-upload-reservation-migration.mjs`
- `packages/database/package.json`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/handoffs/2026-08-24-audit-remediation-wave-2.md`

## Verification

- PASSED — migration created by pinned Supabase CLI 2.109.1.
- PASSED — reservation migration contract tests, 7/7.
- PASSED — `@third-code-erp/database` typecheck.
- PASSED — checked-in disposable PostgreSQL 16 migration verifier. It applies
  the migration to a minimal schema and exercises insert/transition guards,
  idempotency/path constraints, same-project completion, completed tombstones,
  terminal reopening denial, cleanup monotonicity, direct-role denial, and
  `service_role` access.
- PASSED — root merge-gate command, actionlint, and immutable workflow-action
  reference verification. The unit-test job runs the migration verifier with a
  five-minute fail-closed timeout.
- PASSED — diff and trailing-whitespace checks.
- NOT RUN — zero-to-current Supabase replay; the repository's separately
  recorded historical replay defect precedes this migration.
- NOT RUN — hosted catalog/RLS/grant readback or Storage bucket canary; no
  provider mutation was authorized.

## Handoff

Next: Agent 05 implements Core-authoritative reservation, sign, release,
completion, expiry, and reconciliation transactions using the shared
project-row serialization boundary. This changeset does not enable a tenant
canary and does not close AUD-004 by itself.
