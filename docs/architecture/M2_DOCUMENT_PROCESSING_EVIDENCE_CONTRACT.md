# M2 Document Processing Evidence Contract

Status: design complete. Source-only M2.2 evidence-boundary slice implemented
2026-08-13; durable M2.1 job/evidence storage and NestJS authority remain
unimplemented and un-deployed.

This is an original ABI OPS contract derived from repository and hosted
catalog evidence. It defines the smallest safe migration from direct worker
writes to NestJS transaction authority. It does not authorize a database,
provider, queue, Auth, Storage, or deployment change.

## Scope

M2 migrates CAD document processing first.

- Next.js keeps the current upload UI and compatibility response.
- NestJS accepts authenticated processing commands and owns official writes.
- BullMQ carries retryable work by opaque job ID.
- Python downloads and analyzes one authorized object, then returns immutable
  extraction evidence.
- PostgreSQL stores job state, evidence, accepted draft scope rows, and audit
  attribution.
- Existing DXF, DWG, and draft-BOM behavior remains on the legacy path until a
  disabled-by-default canary proves the replacement.

PDF, image, spreadsheet, CSV, and DOCX extraction use the same target contract,
but their current Next.js write path is a later M2 slice. Moving the Python CAD
path does not falsely claim that all document authority has moved.

## Source-only M2.2 boundary evidence (2026-08-13)

- Python `/parse` now accepts only `job_id`, attempt, a short-lived exact-object
  source URL, source hash, source format, sanitized file name, and bounded
  limits.
- Python has no database URL, Postgres client, Supabase Storage service-role
  key, tenant/project/document identifiers, or official `scope_items` write
  path. It verifies downloaded source hash before extraction and returns
  bounded deterministic evidence item keys.
- Next.js creates the short-lived object URL, validates the response contract,
  persists tenant/project/document-scoped scope rows in one transaction, then
  runs existing draft-BOM logic. Inngest uses the same adapter, so queued and
  inline paths do not reintroduce worker database writes.
- Worker authentication fails closed unless a secret is configured; local
  unauthenticated mode requires an explicit local-only setting.
- Worker tests pass 13/13 and Web typecheck passes. No Railway, Vercel,
  Supabase migration, hosted environment, or production flag changed.
- This slice does not claim M2 completion: durable processing jobs, retries,
  evidence persistence, NestJS processor authority, and canary rollout remain
  required before hosted activation.

## Verified current call graph

```text
Browser useCadUpload
  -> POST /api/upload/sign
     -> Next.js reads membership and document quota
     -> Supabase Storage signed upload URL
  -> browser uploads object
  -> POST /api/upload/complete
     -> Next.js inserts documents
     -> CAD:
        -> DXF: Next.js parses, deletes/inserts scope_items, creates draft BOM
        -> DWG: Next.js calls Python /parse
           -> Python downloads with service role
           -> Python deletes/inserts scope_items and commits
           -> Next.js creates draft BOM
        -> unavailable DWG worker: Inngest retries the same Python /parse path
     -> visual/text:
        -> Next.js calls AI/parser
        -> Next.js deletes/inserts scope_items and creates draft BOM
```

Verified source:

- `apps/web/src/components/cad/use-cad-upload.ts`
- `apps/web/src/app/api/upload/sign/route.ts`
- `apps/web/src/app/api/upload/complete/route.ts`
- `apps/web/src/lib/cad/parse-and-store.ts`
- `apps/web/src/lib/vision/extract-from-visual.ts`
- `apps/web/src/lib/cad/auto-bom.ts`
- `apps/web/src/lib/inngest.ts`
- `apps/workers/dxf-parser/src/main.py`
- `apps/workers/dxf-parser/src/db.py`

## Verified gaps

1. Python accepts caller-provided tenant, project, and document identifiers,
   then directly deletes and inserts official rows.
2. Python has a database credential and Storage service-role credential.
3. Python write attribution has no verified user actor or capability.
4. A missing Python shared secret is accepted outside an explicit test mode.
5. Inline and queued callers can process the same document independently.
6. No durable processing job, attempt, evidence, or accepted-result record
   exists.
7. Current Next.js DXF delete and batched inserts are not one transaction.
8. Current retry can create another draft BOM version.
9. Draft BOM version allocation uses `max(version) + 1` without a lock or
   uniqueness constraint proved for concurrent requests.
10. `documents` and `scope_items` each reference tenant and project
    independently. The database does not prove that both belong together.
11. At this design baseline, upload sign and complete derived user tenant but
    did not first load requested Project with both tenant and Project ID. A
    later source-only hardening candidate adds that application guard; live
    production and composite database integrity remain unchanged until their
    separately controlled releases.
12. RLS exists on `documents` and `scope_items`, but elevated server and worker
    connections can bypass it.
13. Hosted `documents` and `scope_items` have no audit trigger.
14. Python tests cover extraction rules only. They do not cover endpoint
    authentication, tenant substitution, retries, idempotency, evidence
    immutability, or transaction rollback.
15. `cadParseQueued` currently mixes “extracted” and “queued” meanings.

16. A later source-only candidate adds explicit `document.manage` checks,
    audits signed URL issuance, and commits document creation plus audit
    atomically. Live production, Python authority, processing-row
    transactions, composite database integrity, and audit triggers remain
    unchanged until their controlled releases.

## Authority boundary

```text
Authenticated user
  -> Next.js compatibility adapter
    -> NestJS document-processing command
      -> PostgreSQL job row
      -> BullMQ job containing jobId only
        -> NestJS processor loads authoritative context
          -> short-lived exact-object read grant
          -> Python extraction
          -> immutable evidence response
        -> NestJS validates and commits pending-review scope rows
          -> transaction-stamped audit
          -> optional idempotent draft-BOM command
```

Python must not receive authority from tenant or Project IDs in a queue
payload. NestJS loads tenant, Project, document, actor, and object path from
PostgreSQL using `jobId`.

## Capabilities

Add explicit capabilities:

- `document.process`: request extraction for a same-tenant Project document.
- `document.processing.read`: read same-tenant job status and sanitized
  warnings.
- `scope.extraction.accept`: commit validated evidence as pending-review scope
  rows.

Initial role map:

- owner, admin, commercial, sd_pm_pe, and pm: all three capabilities.
- sales: `document.process` and `document.processing.read` only.
- viewer and all other roles: denied.

This proposed map requires product-owner review before implementation. Missing
capability metadata remains a hard deny.

## Public command contract

### Request processing

`POST /v1/documents/:documentId/processing-jobs`

Headers:

- `Authorization: Bearer <Supabase access token>`
- `Idempotency-Key: <UUID>`
- `x-request-id: <UUID>` optional; generated when absent

Body:

```json
{
  "mode": "cad",
  "requestedFormat": "auto",
  "createDraftBom": true
}
```

Server-derived fields:

- actor ID
- tenant ID
- Project ID
- Storage path
- file name
- MIME type
- source size
- source SHA-256

Response:

- `202` for a new accepted job.
- `200` for an identical replay with the same idempotency key.
- `400` for malformed input or headers.
- `401` for missing or invalid identity.
- `403` for missing capability.
- `404` for absent or cross-tenant document.
- `409` when the key exists for a different request fingerprint.

```json
{
  "jobId": "uuid",
  "status": "queued",
  "documentId": "uuid",
  "createdAt": "RFC3339 timestamp"
}
```

### Read processing status

`GET /v1/document-processing-jobs/:jobId`

Response:

```json
{
  "jobId": "uuid",
  "documentId": "uuid",
  "status": "queued",
  "attempts": 0,
  "scopeItemsCreated": 0,
  "draftBomId": null,
  "warnings": [],
  "failureCode": null,
  "createdAt": "RFC3339 timestamp",
  "updatedAt": "RFC3339 timestamp"
}
```

Do not return Storage credentials, object URLs, source business content,
tenant IDs, user IDs, raw model output, internal stack traces, or provider
responses.

## Worker evidence contract

NestJS invokes a private Python endpoint with:

```json
{
  "job_id": "uuid",
  "attempt": 1,
  "source_url": "short-lived signed URL",
  "source_sha256": "64 lowercase hex characters",
  "source_format": "dxf",
  "file_name": "sanitized display name",
  "limits": {
    "max_bytes": 104857600,
    "max_items": 5000
  }
}
```

The URL is exact-object, read-only, short-lived, never persisted, and never
logged. Python receives no database URL, service-role key, tenant ID, Project
ID, actor ID, capability, or transaction state.

Python returns:

```json
{
  "schema_version": 1,
  "job_id": "uuid",
  "attempt": 1,
  "source_sha256": "64 lowercase hex characters",
  "producer": {
    "name": "third-code-cad-extractor",
    "version": "immutable release identifier"
  },
  "source_format": "dwg",
  "parsed_format": "dxf",
  "items": [
    {
      "item_key": "64 lowercase hex characters",
      "code": null,
      "description": "Supply air diffuser",
      "unit": "unit",
      "quantity": 4,
      "recommended_unit_cost_cents": 0,
      "notes": null
    }
  ],
  "warnings": []
}
```

Rules:

- `item_key` is deterministic from canonical item content plus occurrence
  index.
- `quantity` is a positive integer within a configured bound.
- descriptions, units, codes, notes, warnings, and item count have explicit
  maximum sizes.
- money recommendations are integer cents. They remain recommendations until
  NestJS commits a pending-review draft.
- evidence ordering is stable.
- Python must return the source hash it actually processed.
- raw source or object URLs never appear in evidence.
- Python never returns an approval or final workflow state.

## Persisted model

### `document_processing_jobs`

Required fields:

- `id uuid primary key`
- `tenant_id uuid not null`
- `project_id uuid not null`
- `document_id uuid not null`
- `requested_by uuid not null`
- `idempotency_key uuid not null`
- `request_fingerprint char(64) not null`
- `source_sha256 char(64) not null`
- `mode text not null`
- `requested_format text not null`
- `create_draft_bom boolean not null`
- `status text not null`
- `attempt_count integer not null default 0`
- `accepted_evidence_id uuid null`
- `scope_items_created integer not null default 0`
- `draft_bom_id uuid null`
- `failure_code text null`
- `sanitized_warnings jsonb not null default '[]'`
- `queued_at`, `started_at`, `completed_at`, `failed_at`, `created_at`,
  `updated_at`

Constraints:

- unique `(tenant_id, idempotency_key)`
- composite Project foreign key `(tenant_id, project_id)`
- composite document foreign key `(tenant_id, document_id)`
- composite actor foreign key `(tenant_id, requested_by)`
- non-negative attempt and result counts
- bounded status and mode checks
- accepted evidence required only in committing/committed states
- failure code required only in failed/rejected states

### `document_processing_evidence`

Required fields:

- `id uuid primary key`
- `tenant_id uuid not null`
- `job_id uuid not null`
- `attempt integer not null`
- `schema_version integer not null`
- `producer_name text not null`
- `producer_version text not null`
- `source_sha256 char(64) not null`
- `payload_sha256 char(64) not null`
- `payload jsonb not null`
- `created_at timestamptz not null`

Constraints:

- unique `(tenant_id, job_id, attempt)`
- unique `(tenant_id, job_id, payload_sha256)`
- composite job foreign key `(tenant_id, job_id)`
- strict hash, version, and JSON-shape checks
- immutable after insert

Payload remains evidence, not official scope state.

### Existing-table hardening

- Add unique `(tenant_id, id)` support keys to `documents`, `scope_items`, and
  `users` where absent.
- Add composite `(tenant_id, project_id)` foreign keys to `documents` and
  `scope_items`.
- Add `source_document_id`, `processing_evidence_id`, `source_item_key`,
  `origin`, and `review_status` to `scope_items`.
- Add unique accepted-item identity for
  `(tenant_id, source_document_id, source_item_key)` where extraction origin is
  present.
- Add audit triggers to `documents`, `scope_items`,
  `document_processing_jobs`, and `document_processing_evidence`.
- Add an immutability trigger to processing evidence.
- Add explicit checks for positive quantity and non-negative money on
  extraction-origin scope rows.

Before adding composite constraints, run read-only mismatch queries. Any
existing mismatch stops the migration. Never rewrite mismatched production
rows automatically.

## Job state machine

Allowed transitions:

```text
queued -> processing
processing -> evidence_ready
processing -> failed
evidence_ready -> committing
evidence_ready -> rejected
committing -> committed
committing -> failed
failed -> queued
queued|processing|evidence_ready -> superseded
```

Terminal states:

- `committed`
- `rejected`
- `superseded`

Rules:

- transitions occur through guarded database functions or one Nest service
  transaction, never arbitrary updates.
- a retry increments attempt count and reuses the same job ID.
- terminal jobs cannot re-enter processing.
- a new idempotency key creates a new job; it may supersede an older
  non-terminal job for the same document.
- evidence rows are never updated or deleted.

## Queue contract

- Queue name: `document-processing`.
- BullMQ job name: `extract-cad-evidence`.
- BullMQ `jobId`: processing-job UUID.
- Queue body: `{ "jobId": "uuid" }` only.
- Attempts: 5.
- Backoff: exponential from 1 second, capped by policy.
- Lock duration exceeds the current Python timeout and is renewed while the
  processor is active.
- Stalled-job recovery uses the persisted state machine, not Redis as source of
  truth.
- Retrying a completed Nest commit returns its durable prior result.
- Queue cleanup never deletes PostgreSQL job or evidence records.

Redis coordinates delivery and locks. PostgreSQL decides whether work may run
or commit.

## Commit transaction

`acceptEvidence(jobId, evidenceId, principal)` performs one PostgreSQL
transaction:

1. Stamp verified actor claims for audit triggers.
2. Acquire transaction-scoped advisory lock derived from job UUID.
3. Load job with `FOR UPDATE` by job, tenant, Project, document, and actor
   capability.
4. Return stored result when already committed.
5. Reject invalid state or evidence relationship.
6. Recompute canonical payload hash and validate schema, producer, source hash,
   count, lengths, numeric bounds, and item-key uniqueness.
7. Verify Project, document, and actor still belong to the same tenant.
8. Transition `evidence_ready` to `committing`.
9. Replace prior extraction-origin rows for this document inside the same
   transaction.
10. Insert pending-review scope rows with actor, document, evidence, and item
    provenance.
11. Record result count and accepted evidence.
12. Transition to `committed`.

Draft BOM generation is a separate idempotent Nest command keyed by processing
job. It may run after scope commit and update the job with one durable draft
BOM ID. A retry must return the same draft, never allocate another version.

## Compatibility behavior

Legacy upload remains default.

New routing requires both:

- `ERP_DOCUMENT_PROCESSING_VIA_API=true`
- a database-derived tenant allowlist containing the authenticated user's
  tenant

Missing, malformed, or empty configuration selects legacy behavior.

The Next.js adapter preserves current response keys:

- `id`
- `storagePath`
- `documentType`
- `cadFormat`
- `cadParseQueued`
- `cadParseWarning`
- `cadResult`

While work is active:

- `cadParseQueued=true`
- `cadResult.status=processing`
- `cadResult.scopeItemsCreated=0`
- `cadResult.message` contains user-safe progress text

The existing upload hook polls the Nest status endpoint, then renders the
current extracted-count and draft-BOM summary when committed. It does not need
a visual redesign.

## Failure handling

- Source object missing or hash mismatch: fail with stable code; do not commit.
- Python unavailable: BullMQ retries; legacy default remains unaffected.
- Malformed evidence: reject permanently and retain evidence.
- Duplicate queue delivery: return durable existing job/commit result.
- Database unavailable: retry without asking Python to approve anything.
- Audit failure: transaction rolls back.
- Draft-BOM failure: scope commit remains durable; job exposes a sanitized
  follow-up warning and the BOM command can retry idempotently.
- Cross-tenant lookup: return 404 and write no business row.
- Lost Redis: readiness fails; PostgreSQL state remains authoritative.
- Storage deletion after queueing: fail safely; do not reuse old evidence
  against a changed source hash.

## Test matrix

Unit:

- request and evidence schema bounds
- canonical hash and item-key determinism
- state-transition table
- capability map
- flag plus tenant-allowlist fail-closed selection
- Python endpoint requires service authentication outside test
- Python response contains no authority or credential fields

Nest HTTP:

- 401 missing identity
- 403 missing capability
- 404 cross-tenant document and job
- 400 malformed idempotency key/body
- 202 new job
- 200 identical replay
- 409 key/payload mismatch
- sanitized status response

Database integration:

- composite tenant/Project/document/actor constraints
- evidence immutability
- duplicate delivery commits once
- concurrent commit returns one result
- item validation rollback
- actor attribution on job, evidence, scope, and BOM audit rows
- queue failure leaves official scope unchanged
- transaction rollback leaks no rows
- exact source hash required

Queue integration with real Redis:

- retry and exponential backoff
- stalled-job recovery
- duplicate job ID
- lock renewal
- restart after evidence persistence

Python:

- authenticated endpoint
- DXF and DWG evidence
- malformed and oversized sources
- source-hash mismatch
- deterministic ordering and item keys
- no database package, URL, or write import
- no Storage service-role requirement

Compatibility:

- current upload response fields remain present
- polling changes processing to extracted/failed
- current completion copy and draft-BOM summary remain readable
- no new visual layout or mobile regression

## First implementation milestone: M2.1

Goal: add durable contract and inert backend foundation. Route no user or
production traffic.

Exact expected files:

- `packages/shared-types/src/erp-api/document-processing.ts` new
- `packages/shared-types/src/index.ts`
- `packages/database/src/schema/document-processing.ts` new
- `packages/database/src/schema/documents.ts`
- `packages/database/src/schema/scope-items.ts`
- `packages/database/src/schema/projects.ts`
- `packages/database/src/schema/users.ts`
- `packages/database/src/schema/index.ts`
- `supabase/migrations/<timestamp>_document_processing_foundation.sql` new
- `packages/database/src/__tests__/document-processing.test.ts` new
- `scripts/verify-database-repro.mjs`
- `apps/api/src/auth/capability.guard.ts`
- `apps/api/src/documents/document-processing.module.ts` new
- `apps/api/src/documents/document-processing.controller.ts` new
- `apps/api/src/documents/document-processing.service.ts` new
- `apps/api/src/documents/document-processing.processor.ts` new
- `apps/api/src/documents/document-processing.state.ts` new
- `apps/api/src/documents/document-processing.service.spec.ts` new
- `apps/api/test/document-processing.e2e.spec.ts` new
- `apps/api/integration/document-processing.database.integration.spec.ts` new
- `apps/api/src/app.module.ts`
- `apps/api/src/observability/request-observability.middleware.ts`
- the six required architecture/operations memory files
- one M2.1 changeset

Explicitly not changed in M2.1:

- Python
- Next.js upload routes or UI
- Inngest
- provider variables
- Supabase production
- Railway production
- Vercel production

## M2.1 validation commands

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:database-release-plan
pnpm test:project-cutover-plan
pnpm ci:actionlint
pnpm verify:workflow-action-refs
pnpm ci:gitleaks
git diff --check
```

Disposable PostgreSQL 17 and Redis gate:

```text
apply every migration from zero
run catalog verifier
run all database tests with zero skips
run Nest document-processing database integration
run Nest API smoke and readiness
run BullMQ duplicate/retry/stalled-job integration
prove empty schema diff
```

Production compilation alone is not completion.

## Rollout

1. M2.1: inert contracts, constraints, persisted job/evidence state, Nest
   endpoints, and queue processor with no caller.
2. M2.2: Python evidence-only endpoint; remove database and service-role
   requirements from its processing path.
3. M2.3: Nest-to-Python private integration and commit transaction.
4. M2.4: Next.js compatibility adapter behind disabled two-part canary.
5. M2.5: one authorized demo-tenant CAD job, duplicate/retry proof, audit and
   data reconciliation, then rollback to legacy.
6. M2.6: controlled tenant expansion.
7. M2.7: remove Python direct-write endpoint and Inngest writer only after
   consumers and rollback evidence are complete.
8. M2.8: migrate visual/text extraction through the same evidence boundary.

M1 canary and repository-governance sign-off remain prerequisites for M2
application code.

## Rollback

M2.1 is additive and inert.

- Keep processing routing flag false and allowlist empty.
- Stop Nest processor consumption.
- Preserve job, evidence, audit, and accepted scope records.
- Do not delete immutable evidence or audit rows.
- Use a reviewed forward compensation for an applied database migration.
- Revert source-only contracts/modules when not deployed.
- Legacy upload remains selected until replacement proof passes.

Rollback never requires reconnecting Vercel Git or creating a paid build.

## Acceptance criteria

- Python cannot write PostgreSQL or use Storage service-role credentials.
- Tenant, Project, document, and actor relationships are enforced by database
  constraints and Nest queries.
- Every accepted result is idempotent, permission-checked, tenant-scoped,
  transactionally audited, and traceable to immutable evidence.
- Duplicate delivery creates one accepted scope set and at most one draft BOM.
- Queue loss cannot lose official state.
- Current upload UI and response contract continue to work.
- Legacy routing remains independently selectable until canary rollback passes.
- Full validation includes real PostgreSQL, Redis, Python, API, compatibility,
  audit, and browser evidence.
