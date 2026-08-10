# Document-processing authority

## Scope

`POST /v1/documents/:documentId/processing-jobs` creates one durable,
tenant-scoped CAD processing job. `GET /v1/document-processing-jobs/:jobId`
reads its state. Core verifies the document and actor, records semantic audit,
and sends BullMQ only the opaque job id. The queue and Python/CAD/OCR/AI worker
are transport/analysis layers, not ERP authority.

## Safety controls

- Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED=false`,
  `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED=false`,
  `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED=false`, and
  `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED=false`.
- Keep all four corresponding tenant lists empty.
- Require a valid JWT, `document.process` for create, and
  `document.processing.read` for status.
- Require the strict CAD command and an opaque `Idempotency-Key`.
- Verify the document belongs to the authorized tenant before job creation;
  cross-tenant access is a concealed 404.
- Enqueue/audit only when the durable job is newly created. Replays return
  durable state and do not call BullMQ again.
- Treat PostgreSQL job state as authoritative. Redis loss is recoverable by
  the closed recovery path; a worker result is evidence only until Core
  validates and commits it.

## Verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:ERP_REDIS_RESTART_EXPECTED='1'
$env:ERP_REDIS_TEST_DISTRIBUTION='ThirdCodeERP-Test'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run `
  src/cad/document-processing.controller.spec.ts `
  integration/document-processing.http.integration.spec.ts `
  integration/document-processing-jobs.database.integration.spec.ts `
  integration/document-processing-processor.database.integration.spec.ts `
  --reporter=basic
```

M3.247 passed the focused HTTP, controller, service/database/processor checks,
full API integration, root source gates, and the zero-skip database lane. Do
not enable a hosted tenant until migration parity,
readiness, exact deployed SHA, protected browser evidence, rollback, and
billing approval are recorded.
