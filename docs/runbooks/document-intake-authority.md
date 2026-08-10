# Document intake authority

## Scope

`POST /v1/documents` records the canonical ERP document after an object has
been uploaded. The browser supplies strict file metadata and an opaque
idempotency key; Core derives tenant, actor, role, and project scope.

## Safety controls

- Keep `ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false` and
  `ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS` empty.
- Require a valid JWT, `document.manage`, strict metadata, and an opaque
  `Idempotency-Key`.
- Require `storagePath` to begin with `${tenant_id}/${project_id}/` after Core
  verifies the project belongs to the authorized tenant.
- Commit the document row, tenant-scoped replay ledger, and semantic audit in
  one PostgreSQL transaction.
- The request ledger is forced-RLS and service-role-only; `anon` and
  `authenticated` must not have direct table privileges.
- Python/OCR/AI may analyze a document after intake but must not approve,
  create, or finalize the canonical ERP record.

## Verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:ERP_REDIS_RESTART_EXPECTED='1'
$env:ERP_REDIS_TEST_DISTRIBUTION='ThirdCodeERP-Test'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run integration/document-intake.http.integration.spec.ts --reporter=basic
```

M3.246 passed the focused HTTP canary, migration contract, full API
integration, and zero-skip database lane. Do not enable a hosted tenant until
readiness, exact deployed SHA, protected browser evidence, rollback, and
billing approval are recorded.
