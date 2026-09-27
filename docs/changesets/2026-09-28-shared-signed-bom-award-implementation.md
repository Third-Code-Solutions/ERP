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
- NOT RUN: disposable PostgreSQL signing and rollback replay, browser signing,
  hosted integration, and production deployment. Those remain release gates.

No schema migration or hosted record change was performed.
