# Document upload reservation Core endpoints

## Scope

- Added a separately controlled issuance gate so new reservations can be
  stopped while lifecycle writes drain during rollback.
- Added the authenticated `POST /v1/document-upload-reservations` boundary.
- Added authenticated completion and release boundaries that accept only the
  reservation UUID and a strict empty body.
- Added the Core reserve service with tenant/capability revalidation,
  project/advisory locking, due-reservation expiry, exact bigint quota
  accounting, idempotent replay, append-only semantic audit records, and
  post-commit signed-upload authorization.
- Added lifecycle completion with provider `info(path)` before the final
  transaction, immutable reservation-derived metadata, exact metadata/quota
  verification, atomic document/reservation/audit writes, and terminal replay.
- Added explicit release and request-path expiry without inline Storage object
  deletion; separately gated cleanup remains the sole removal authority.
- Registered the controller, service, pipe, Storage adapter, and request
  observability middleware in `DocumentsModule`.

## Safety decisions

- Issuance and lifecycle-write flags are both disabled by default and require
  an exact tenant UUID allowlist.
- The caller cannot select tenant, actor, Storage path, expiry, or provider
  credentials.
- Idempotency keys are scoped to the verified tenant and actor; audit records
  contain only their SHA-256 digest.
- Provider signing happens only after the database transaction commits and its
  sanitized outcome is audited in a second transaction. A provider failure
  leaves the reservation active for retry or bounded expiry, preventing one
  failed concurrent replay from invalidating another caller's valid signed
  credential.
- The feature remains disabled until every quota-affecting document writer uses
  the shared project lock described by ADR-027.

## Verification

- PASSED: reserve/sign service tests, 19/19, including mixed concurrent signing
  outcomes and terminal-state races.
- PASSED: completion/release lifecycle tests, 23/23.
- PASSED: controller contract tests, 4/4.
- PASSED: protected-boundary tests, 5/5 on isolated rerun. The first combined
  run had one collection/load-related five-second timeout; the same test passed
  in 360 ms when rerun alone.
- PASSED: Storage boundary tests, 19/19.
- PASSED: complete focused Core group across reservation, Storage, intake,
  controller, authorization, observability, and environment tests, 186/186.
- PASSED: API TypeScript check.
- PASSED: scoped source ESLint check. `NODE_PATH` was pointed at the already
  locked `eslint-config-next` dependency directory because pnpm did not hoist
  the transitive React Hooks plugin to the workspace root.
- PASSED: `git diff --check` for tracked changes.

## Deployment

Not deployed. Issuance and lifecycle writes remain default-off, and no provider
or production mutation is authorized by this changeset.
