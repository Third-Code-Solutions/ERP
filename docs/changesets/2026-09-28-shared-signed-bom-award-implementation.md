# Shared signed-BOM award implementation

The WO-13 award rules now live in `@third-code-erp/operations`. Web's existing
award module delegates to that single implementation. Core canvas signing and
the DocuSeal webhook invoke it inside the same database transaction that locks
an approved BOM. The shared operation reads the tenant business calendar and
appends its semantic audit through the caller transaction. Provider events
record a null actor rather than attributing a system signature to a fallback
user. Exact Core canvas idempotency retries now return the saved result before
the consumed-session check. DocuSeal retries require an active award handoff.

Verification on 2026-09-28:

- PASSED: operations package tests, 9/9; focused Core signing tests, 14/14;
  Web award adapter test, 1/1; WO-13 contract test.
- PASSED: operations, Core API, and Web TypeScript checks; repository ESLint;
  Core API and Web production builds.
- FAILED in hosted CI on `7bfdd784`: the existing disposable PostgreSQL
  DocuSeal integration fixture used a draft BOM, which the corrected signer
  now rejects. The fixture now uses an approved classified and priced BOM and
  checks its award handoff and budget; its rerun is pending.
- NOT RUN: successful disposable PostgreSQL signing and rollback replay,
  browser signing, exact-candidate hosted integration, and production
  deployment. Those remain release gates.

No schema migration was added. The separate owner-authorized synthetic
cross-tenant isolation fixture is recorded in its own changeset.
