# Claim document Core authority

## Change

- Add a validated, capability-checked Core command for attaching an existing project document to a claim. Recheck active membership and tenant status inside the transaction.
- Lock current claim, active project and document scope; reject terminal claims and mismatched evidence. Persist attachment identity and semantic audit atomically.
- Preserve identical committed request replay after terminal transitions; reject changed payload or actor reuse. Document deletion rejects retained claim evidence.
- Apply the same retention lookup to the feature-flagged legacy Web deletion path, after its document lock and before derived-row deletion. Preserve Storage on rejection or failed lookup; unreferenced document deletion remains available.
- Admit the attachment writer to the tenant audit chain without blocking while holding entity locks. Busy admission returns a deliberate conflict instructing retry with the same request ID; no partial write persists. Global audit stamping and existing blocking audit behavior remain unchanged.

## Verification

- PASSED: independent main-agent PostgreSQL execution, 14/14 tests on isolated synthetic database `erp_claim_workflow_20260912_v3`, built from all 169 baseline migrations.
- PASSED: complete API source/HTTP suite, 250 files and 1,254 tests, zero failed or skipped, on 2026-09-12. Local Node 24.16.0 differs from the locked Node 22 CI runtime; CI remains required.
- PASSED: agent-reported focused unit/HTTP and PostgreSQL checks, neighboring daily-task tests, API types, dedicated PostgreSQL test types, focused source lint and diff check.
- PASSED: legacy Web deletion regression failed before the guard (incorrect success), then all 9 action tests passed after the fix. Tests cover scoped tenant/document predicates, lock-before-lookup order, no deletion/Storage cleanup for attached evidence, and fail-closed lookup errors. Production-file ESLint passed; this repository excludes test files from normal lint. Independent Astra source review found no required defect in this guard.
- PASSED: main independently executed three actual legacy Web-action PostgreSQL tests against all 171 migrations, including independent-connection Core attachment versus Web deletion. Authentication, Storage and cache are mocked boundaries; Drizzle, transactions, the action and audit are real. Retained evidence stays unchanged; unreferenced data and semantic audit commit before Storage cleanup.
- Regression coverage includes foreign tenant/project rejection, persisted permission changes, terminal replay, semantic-audit rollback, independent-connection concurrency, retained evidence during deletion, safe reverse lock contention, and same-ID retry after audit contention clears.

## Release boundary

Not deployed. Application checks alone do not close direct Data API writes or parent-delete cascades: hosted read-only catalog checks confirmed tenant-only document/claim DELETE policies and authenticated grants. Both local privilege migrations passed 15 PostgreSQL security tests; the Core command also passed all 14 tests against that 171-migration database. Hosted state remains unchanged. No hosted grant, schema, business-data or provider mutation occurred in this slice. Production migration requires the existing backup/restore evidence gate; do not bypass the code-only release workflow.
