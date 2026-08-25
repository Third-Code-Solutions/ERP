# Document upload issuance readiness

## Scope

- Added an exact-tenant, fail-closed readiness gate before durable upload
  reservation issuance.
- Selected issuance now requires the reservation lifecycle, public-signing, and
  document-deletion Core authorities to be selected for the same tenant.
- A selector mismatch returns a sanitized `503` and records a structured
  `gate_mismatch` outcome before reservation creation or legacy Storage signing.

## Verification

- PASSED: focused Web Vitest, 13 tests.
- PASSED: Web TypeScript check under Node 22 (implementation agent).
- PASSED: scoped production-route ESLint and diff check, independently rerun by
  the orchestrator.
- Regression cases prove both missing downstream authorities fail before Core,
  database, Storage, or audit mutation calls.

## Handoff

→ Handoff to Agent 03. Reason: remove the two remaining project-linked direct
Web metadata writers. Inputs: Core document intake now supports a verified
optional `opportunityId`. Expected output: weekly and project-linked inspection
reports commit through Core with unique paths, no upsert, and exact-object
cleanup after rejected metadata commits.
