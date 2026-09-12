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

### Document deletion and inspection evidence retention

Core and legacy Web deletion lock the document before checking tenant-bound claim,
KYC, inspection-photo and archived-inspection-report references. Attached evidence
cannot be deleted. Unreferenced document records and derived scope still delete
transactionally with audit; this is not physical file erasure.

Both Web deletion paths retain private Storage bytes, including successful Core
receipt replay. Paths can be shared or reused by later documents; a reference
preflight cannot safely authorize asynchronous object removal. New semantic audit
events record `retained_pending_generation_fencing`. No orphan cleanup is enabled.
Storage reclamation requires a separately verified generation-ownership protocol.

Deploy the Web change as well as Core and drain old Web instances before claiming
this protection: old in-flight cleanup can still remove bytes. Provider-admin file
deletion remains outside this protection. Existing backup/migration gates apply.

### Inspection report archive recovery (ADR-031)

`POST /v1/opportunities/:opportunityId/inspections/:inspectionId/report` accepts an
empty JSON object and requires active `site_inspection.submit` authority. Core
reads canonical submitted findings, photos, original inspector and submission time;
Web supplies no report bytes or Storage path. Existing print HTML is preserved.
Branding and project/account labels are archive-time context, not historical snapshots.

Core verifies a bounded immutable upload, then commits the document, inspection link
and semantic audit together. Existing valid legacy HTML links replay without uploading.
The private path is inspection-scoped and SHA-256 addressed. Verification requires
complete matching HTML bytes, size and MIME; partial responses cannot confirm an archive.
The upload and read share a ten-second deadline and a 2 MiB report limit.

Initial submission and exact submission replay request this command. A failed archive
does not reverse confirmed findings. Authorized users can use **Retry report archive**
for the latest or earlier unarchived inspections, including after page navigation.
Success exposes the existing authenticated document-download route. This is explicit
recovery, not an unattended worker. A commit-acknowledgement loss is recovered by the
same inspection ID; post-upload rollback can retain private orphan bytes.

Deploy Core and Web together with `SUPABASE_URL` and server-only
`SUPABASE_SERVICE_ROLE_KEY` on Core. Never use a public key or browser credential.
No new migration is required. Before production proof, verify exact release identity,
Storage access, archive/download/retry journeys and recovery gates. No provider
configuration was changed by the local implementation.

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
