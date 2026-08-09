# Document Intake Review

## M3.199 scope

This packet defines a source-only, disabled-by-default Nest authority for
recording a document after its object-storage upload. It does not upload
objects, enable a tenant, call a provider, alter managed Supabase, or wire the
legacy Web route.

## Contract

- `POST /v1/documents`
- Requires `Idempotency-Key` (1–256 characters).
- Body is strict: `storagePath`, `projectId`, `fileName`, `mimeType`,
  `sizeBytes`, optional `description`.
- Nest derives tenant/user/role from the verified JWT membership; browser
  `tenantId`, `uploadedBy`, and role fields are rejected.
- Storage path must start with `<verified tenant UUID>/<verified project UUID>/`.
- `sizeBytes` is exact integer input, bounded at 100 MiB.
- The transaction inserts `documents`, writes a semantic audit event, and
  completes `document_intake_requests` atomically.
- Same tenant + idempotency key replays the saved result; a different command
  hash returns conflict. Other tenants cannot claim the key.

## Implementation

- Shared contract: `packages/shared-types/src/erp-api/document-intake.ts`.
- Durable ledger/schema: `packages/database/src/schema/document-intake-requests.ts`.
- Migration: `supabase/migrations/20260810090000_document_intake_workflow.sql`.
- Nest service/controller/pipe: `apps/api/src/documents/document-intake.*`.
- Web gate + server-only adapter exist in `apps/web/src/lib/erp-core-client.ts`,
  but `apps/web/src/app/api/upload/complete/route.ts` remains unconnected and
  legacy-authoritative while the canary is closed.
- Source-only Supabase parity manifest is current at 55/113 with 58 pending in
  8 ordered review batches; this does not represent hosted apply evidence.

## Evidence

- API document intake/config/protected tests: 77/77.
- Web Core client suite: 148/148.
- Shared contract suite: 4/4 in the new file; existing document contract 3/3.
- Full typecheck, lint, Nest/Web production build, and database package lane
  passed; database lane reported 224 passed and 143 environment-dependent
  skips because `DATABASE_URL` was not set.
- No hosted DB, deployment, provider, or paid action occurred.

## Rollback and next gate

Rollback is source revert plus migration-ledger rollback review; do not remove
the migration from an already-applied hosted database. The runtime gate remains
false with an empty tenant allowlist. Before any canary, replay the migration
from zero, prove storage-prefix and cross-tenant behavior, capture exact
release/rollback identities, and verify the legacy upload response parity.
