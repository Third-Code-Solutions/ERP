# Document Intake Review

## M3.201 route selection update

The legacy upload route now has a guarded Core selection seam. Exact tenant
allowlist plus non-extractor format is required. Core is called before the
legacy insert; its strict response is returned unchanged, and selected-Core
errors return a bounded status without fallback. Closed gate and extractor
formats retain existing behavior. The deterministic idempotency key is a
SHA-256 command digest prefixed with `upload-`.

Focused evidence: route tests 8/8 and Core client 152/152. No hosted flag or
database state changed; canary remains disabled.

## M3.200 parity and replay update

The source ledger was replayed from zero through 113/113 migrations on local
PostgreSQL 17. The real transaction fixture passed scoped create, idempotent
replay, same-key conflict, foreign-project 404, foreign storage-prefix 403,
audit/ledger cardinality, and rollback (1/1). Scope checks now precede the
ledger claim so a foreign project cannot leak a raw composite-FK error. The
reproducibility verifier now requires the intake ledger plus its three
tenant/idempotency/state indexes; it reports 11 service-only tables.

The legacy upload response is frozen in
`packages/shared-types/src/erp-api/document-upload-complete.ts` and the
existing route parses its final payload. The disposable Core canary in
`apps/web/src/lib/erp-core-client.ts` accepts only non-extractor formats and
maps Core success to the frozen shape. M3.201 imports it through the guarded
route selector; all flags and allowlists remain closed.

Evidence: DB 367/367 without skips; API integration 26 files; focused DB 1/1;
release planner current 113/113; schema-before/after hash equal;
shared/Web focused 3/3 and 158/158. Managed Supabase parity remains 55/113
source-only; hosted SQL, release identity, browser, rollback, and spend gates
are unresolved.

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
- Web gate + server-only adapter exist in `apps/web/src/lib/erp-core-client.ts`;
  `apps/web/src/app/api/upload/complete/route.ts` selects them only for an
  exact enabled tenant and non-extractor format, otherwise remaining
  legacy-authoritative.
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
