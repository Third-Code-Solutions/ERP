# Controlled document upload quota

Agent 04 → Agent 05 → Agent 03 → Agent 12, sequentially under ADR-043 and
`docs/handoffs/2026-10-11-independent-system-remediation.md`.

- Agent 04: additive `20261012044500_controlled_document_upload_quota.sql`, existing
  reservation Drizzle mapping, immutable transport identity, pending-capacity and
  document quota triggers. Restrictive Storage and document-metadata write denial
  preserves existing read policy. Historical documents/reservations are not rewritten.
- Agent 05: Core reservation and authenticated upload endpoints, bounded temp-file
  streaming, immutable content hashes/paths, verified provider bytes, durable
  uncertain-write evidence, safe expiry cleanup and actor-bound completion replay.
  Completed objects remain charged after document deletion. Both Core and legacy
  Web reject legacy project-document deletion without a retained-capacity ledger.
- Agent 03: Web reservation adapter returns configured Core endpoint, never a
  provider write token. Browser uploads with its own session and retains reservation
  identity across retries; successful upload retries skip another PUT.
- Agent 12: transport, auth/CORS, tenant/actor, idempotency, actual-size mismatch,
  expiry/cleanup and two-actor quota race tests; operational recovery runbook.

Verification: migration applied to isolated synthetic PostgreSQL17.6 database
`erp_turnover_audit`. Latest focused quota DB13, Core transport/auth/intake/delete
unit21, Web sign/complete19 and existing intake HTTP DB1 tests **PASSED**. Existing
intake DB1 passed earlier in the slice. Quota DB fixtures cover real two-actor
concurrency, retained deleted-object charge, legacy deletion denial and suspension.
Core typecheck **PASSED** before final small hardening edits; integrated types/lint,
fresh migration replay and browser upload remain main's coordinated checks.
Intake HTTP first timed out under memory contention; quiet retries passed, with
test execution 2.31s and 9.82s. Temporary diagnostic logging was removed.
No hosted provider calls, production mutations, commits or deployments.

Limits: no live Storage/CORS acceptance. Uncertain remote writes retain quota until
provider reconciliation. Existing signed-upload tokens require controlled cutover;
details in `docs/runbooks/security-document-upload-quota.md`.

Exact changed paths for this slice:

```text
supabase/migrations/20261012044500_controlled_document_upload_quota.sql
packages/database/src/schema/document-upload-reservations.ts
packages/database/src/schema/index.ts
packages/shared-types/src/erp-api/document-intake.ts
apps/api/src/documents/document-upload.controller.ts
apps/api/src/documents/document-upload.service.ts
apps/api/src/documents/document-upload.storage.ts
apps/api/src/documents/document-upload.storage.spec.ts
apps/api/src/documents/document-upload.protected.spec.ts
apps/api/src/documents/document-intake.service.ts
apps/api/src/documents/document-intake.service.spec.ts
apps/api/src/documents/document-delete.service.ts
apps/api/src/documents/documents.module.ts
apps/api/integration/document-upload.database.integration.spec.ts
apps/api/integration/document-upload.fixture.ts
apps/api/integration/document-intake.database.integration.spec.ts
apps/api/integration/document-intake.http.integration.spec.ts
apps/api/integration/upload-complete.disposable.integration.spec.ts
apps/web/src/app/api/upload/sign/route.ts
apps/web/src/app/api/upload/sign/route.test.ts
apps/web/src/components/cad/use-cad-upload.ts
apps/web/src/app/(dashboard)/projects/[id]/documents/actions.ts
docs/runbooks/security-document-upload-quota.md
docs/changesets/2026-10-12-controlled-document-upload.md
```

→ Handoff to Agent 12 / main integration. Reason: independent high-risk review and
quiet final verification. Inputs: changes above and ADR-043. Expected output:
review reservation/stream/cleanup races, rerun focused HTTP/types/lint, then verify
browser upload against an authorized Storage adapter; no hosted writes implied.
