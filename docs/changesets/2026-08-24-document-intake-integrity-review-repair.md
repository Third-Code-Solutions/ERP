# Document intake integrity review repair

## Scope

Independent review of the optional opportunity association found two service
defects. This repair:

- locks the verified opportunity row before idempotency, quota, or document
  mutation so concurrent reassignment cannot interleave between validation and
  insertion; and
- records separate, accurately named SHA-256 evidence for the normalized
  idempotency key and canonical request payload.

The row lock is a transaction-level protection. A database-level
project/opportunity invariant is handed off separately so later reassignment is
also rejected after the intake transaction commits.

## Verification

- PASSED: focused document-intake service Vitest, 6 tests.
- PASSED: controller/protected/service boundary suite, 11 tests.
- PASSED: API TypeScript check under Node 22.
- PASSED: scoped production-service ESLint and diff check.
- Tests prove the opportunity query requests `FOR UPDATE` and the audit hash is
  derived from the trimmed idempotency key, not from the payload hash.

## Handoff

→ Handoff to Agent 04 schema scope. Reason: make project/opportunity consistency
durable after the transaction. Inputs: row-locked exact tenant/project
validation. Expected output: additive composite key/FK/index migration with
legacy-data preflight, pre-project null preservation, migration verification,
and rollback guidance.
