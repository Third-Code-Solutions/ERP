# Project report document Core cutover

## Scope

- Moved weekly-report document metadata creation from direct Web database writes
  to the existing Core document-intake authority.
- Moved project-linked site-inspection report metadata to Core while preserving
  the verified `opportunityId` association.
- Kept pre-project inspection reports opportunity-scoped because they have no
  project and do not consume project quota.

## Integrity and failure behavior

- Every report attempt uses a unique UUID-scoped object path, `upsert: false`,
  and a matching stable per-attempt Core idempotency key.
- Core results are checked against the expected tenant, project, and exact
  storage path before linking the document.
- A rejected, unavailable, invalid, or mismatched Core commit removes only the
  exact just-uploaded object. Cleanup failures are logged without provider
  diagnostics.
- Once Core commits document metadata, a later report-link failure retains the
  committed object and emits a sanitized reconciliation signal.
- Weekly JSON snapshots remain available when artifact persistence fails.

## Verification

- PASSED: focused Web Vitest, 3 files / 12 tests, independently rerun by the
  orchestrator.
- PASSED: Web and Web E2E TypeScript configurations under Node 22.
- PASSED: scoped production-file ESLint and diff check.
- Covered Core success/rejection/mismatch, exact cleanup, cleanup failure,
  post-commit link failure, and the pre-project inspection branch.

## Handoff

→ Handoff to Agents 05/13. Reason: report-link discrepancies and cleanup gaps
now have deterministic object and command identities. Inputs: sanitized fixed
failure outcomes plus unique paths. Expected output: bounded, tenant-gated
reconciliation reporting and explicit repair actions without inferred legacy
deletion.
