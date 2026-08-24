# Document upload reservation contract and Storage boundary

- Date: 2026-08-24
- Finding: AUD-004
- Scope: Agent 05 Core API contract and private Storage adapter
- Deployment: not deployed; reservation writes and cleanup remain disabled

## Outcome

Added strict shared request/result contracts for reserving, completing, and
releasing project document uploads. The contract fixes the product limits at
100 MiB per object, 500 MiB per project, and a two-hour reservation lifetime.
Signed credentials are bounded, HTTP(S)-only, nonblank, and remain response-only
values.

Added independent, exact-tenant feature gates for reservation issuance and
cleanup. Both gates are disabled by default, so this additive slice cannot
expose an unfinished endpoint or start background cleanup.

Added a lazy, server-only Supabase Storage adapter for the private `documents`
bucket. It signs the exact reservation path with replacement disabled, accepts
only top-level provider size/content-type metadata, removes one exact path, and
redacts synchronous and rejected provider failures. Service-role credentials,
signed URLs, tokens, and raw provider diagnostics are never logged.

## Changed areas

- `packages/shared-types/src/erp-api/document-upload-reservations.ts`
- `packages/shared-types/src/erp-api/document-upload-reservations.test.ts`
- `packages/shared-types/src/index.ts`
- `apps/api/src/config/environment.ts`
- `apps/api/src/config/environment.spec.ts`
- `apps/api/src/documents/document-upload-reservation.storage.ts`
- `apps/api/src/documents/document-upload-reservation.storage.spec.ts`
- `.env.example`
- `docs/ENVIRONMENT_VARIABLES.md`

## Verification

- PASSED — shared reservation contract tests, 9/9.
- PASSED — API environment tests, 80/80.
- PASSED — Storage boundary tests, 19/19.
- PASSED — `@third-code-erp/shared-types` typecheck.
- PASSED — `@third-code-erp/api` typecheck.
- PASSED — scoped ESLint.
- PASSED — diff and trailing-whitespace checks.
- PASSED — current Supabase documentation review for signed upload URL lifetime,
  creation-time upsert control, and top-level file-info metadata.

## Handoff

Agent 05 must next implement the transaction-owned reserve/complete/release
service and controller against the existing ledger and quota-lock primitive.
Provider calls remain outside database transactions, while all reservation and
document state changes plus semantic audit entries commit atomically.
