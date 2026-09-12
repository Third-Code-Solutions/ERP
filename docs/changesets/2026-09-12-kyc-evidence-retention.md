# KYC evidence retention

## Change

Core and legacy Web document deletion now reject documents referenced by tenant-scoped KYC artifacts before deleting derived rows, the document, or its Storage object. This preserves the existing document reference and request replay identity instead of letting the legacy nullable FK clear it. Existing claim and processing-history protection remains unchanged; no FK or hosted data was modified.

## Verification

- RED: the new legacy Web tests returned successful deletion for retained KYC evidence and lookup failure; the Core test lacked the KYC-specific rejection.
- PASSED: Core `document-delete.service.spec.ts`, 4/4; legacy Web document `actions.test.ts`, 11/11. Local Node version is not the locked Node 22 CI runtime.
- PASSED: neighboring Core deletion service/controller checks, 6/6. Source-only ESLint passed. An initial combined source/test lint command failed because the repository intentionally ignores test files; no lint configuration was changed and tests are verified by their test runner, not claimed as linted.
- PASSED: main independently ran 44 Core KYC/neighboring tests, including 20 real PostgreSQL cases and both attachment/deletion orders, plus 3 shared-contract tests, all without skips. This proves Core retention serialization, not real Storage cleanup or a deployed legacy Web journey.
- PENDING: Web browser verification, CI, and direct-client authority closure.
- NOT DEPLOYED: dependent KYC slice remains local. Claim PR 67 and any subsequent migration still require verified database/Storage recovery and isolated restore evidence before hosted application.
