# Document intake authority

## Scope

`POST /v1/documents` records the canonical ERP document after an object has
been uploaded. The browser supplies strict file metadata and an opaque
idempotency key; Core derives tenant, actor, role, and project scope.

## Safety controls

- Require a valid JWT, `document.manage`, strict metadata, and an opaque
  `Idempotency-Key`.
- Require `storagePath` to begin with `${tenant_id}/${project_id}/` after Core
  verifies the project belongs to the authorized tenant; reject `..` path
  segments even when a raw prefix matches.
- Commit the document row, tenant-scoped replay ledger, and semantic audit in
  one PostgreSQL transaction.
- `/api/upload/complete` always delegates the durable document commit to Core.
  A Core error is terminal; the Web route has no direct document/audit fallback.
- A replay returns the canonical document without rerunning CAD, OCR, or AI
  processing, which prevents duplicate derived evidence.
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

On 2026-08-17, document intake became Core-only for all upload formats. The
focused HTTP/database checks and a disposable DXF upload flow prove the Core
commit, replay, selected CAD handoff, and no-Core terminal failure locally.
This is not hosted proof: do not claim a customer-ready deployment until
readiness, exact deployed SHA, protected browser evidence, rollback, backup
restore evidence, and billing approval are recorded.
