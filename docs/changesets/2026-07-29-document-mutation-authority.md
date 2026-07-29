# Document mutation authority hardening

## Scope

Source-only security increment for document upload and deletion. No schema,
hosted data, provider configuration, deployment, or UI design change.

## Changes

- Added explicit `document.manage` capability for operational roles.
- Kept `viewer` read-only.
- Required capability before upload-sign, upload-complete, and document-delete
  side effects.
- Audited signed URL issuance before returning the credential.
- Committed document creation and its audit entry atomically.
- Bound deletion to document, authenticated tenant, and requested Project.
- Committed derived scope deletion, document deletion, and audit atomically.
- Deferred best-effort Storage cleanup until after database commit.
- Used authoritative document Project for cache invalidation.

## Validation

- Focused tests: 26/26 pass.
- Root lint, typecheck, test, and optimized production build: pass.
- Root tests: 278 pass; 132 disposable-database-gated cases skip without an
  explicitly supplied writable database.
- Web production build: 77/77 routes generated.
- Gitleaks 8.30.1 full-history scan: no leaks.

## Rollback

Revert this changeset's source commit. No database or provider rollback is
needed. If later deployed, promote the prior Vercel artifact. Never recover by
granting document mutation authority to `viewer`.
