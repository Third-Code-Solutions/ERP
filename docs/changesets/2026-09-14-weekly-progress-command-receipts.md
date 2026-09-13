# Durable weekly progress command receipts

Status: locally implemented and verified; hosted CI/build pending. Not deployed.

## Changes

ADR-035 makes Core weekly capture and keyed WAR locking return original,
actor-bound immutable command receipts. A retry uses the same identity and
payload, returns the original result, and cannot replace newer evidence.
Receipts and period/evidence writes commit atomically. Current lifecycle and
tenant authority are still checked before replay. Legacy overwritten request
keys require reconciliation rather than being treated as new commands.

Capture and lock use the PostgreSQL clock after admission and row locks;
linked evidence week and canonical cutoff must agree. The production test-clock
override is removed. Lock's optional request key preserves API compatibility;
the new Web flow requires a key and validates complete receipt evidence.
Outdated Web Core callers must refresh instead of generating replacement keys.
The non-Core legacy capture path remains available.

Web command actions distinguish rejected from unconfirmed results, log scoped
outcomes without notes, and retain committed receipts when refresh fails.
Scope-keyed controls stay mounted through permission and read-result changes.
The new mounted browser regression is included in the existing CI job with
responsive screenshots collected as artifacts. No dependencies or migrations.

## Verification

- PASSED: independently rerun Core suite, 102 tests, zero skips. Includes the
  retained 47 current-authority cases and actual-PostgreSQL replay, concurrency,
  legacy request recognition, rollback, cutoff and corruption tests.
- PASSED: an ordinary authenticated tenant user cannot insert a forged semantic
  receipt (`42501`); durable state is unchanged. Synthetic history is retained.
- PASSED: shared contracts, 3 tests; Web actions, 9; page lifecycle, 3; existing
  Web transport and legacy-action regressions. No skipped focused tests.
- PASSED: API/shared/Web types, dedicated PostgreSQL integration types, reviewed
  production-source lint, pinned Actionlint and workflow action-reference checks.
- Review reproduced backwards receipt timestamps, contradictory audit actions,
  missing Web lock timestamp validation and missing structured outcome logging;
  narrow fixes and regression checks passed.
- PASSED: component rendering, 6 tests; real Chromium interactions, 13 tests,
  zero skips. Covers exact retries, unknown/rejected outcomes, permission and
  read changes, late receipts, newer ledger evidence, retained form edits,
  refresh warnings, fractional inputs, legacy capture and keyboard activation.
- PASSED: responsive screenshots inspected at 320/768/1024/1440px; existing
  ledger-table horizontal scrolling remains contained within its card.
- A browser regression reproduced the false "no weekly periods" message after
  a known command and empty read. Known evidence now receives a refresh message;
  the regression passes before and after receipt recovery.
- PASSED: Web E2E types. Hosted CI/build is pending. Mounted component tests are
  not live demo-account or production E2E proof.

## Release boundaries

Initial hosted CI run 34773797693 failed two existing budget/XML scope tests
(`refreshes=1` instead of 0), leaving nine serial tests unexecuted. The browser
fixtures scheduled `root.render` but returned before React committed the new
scope; their next zero-count assertions could already pass in the old view.
Those failures were not reproduced by 16 local baseline repetitions. Independent
review confirmed the ordering gap. All three affected fixture mount helpers now
await a commit-effect promise. No assertion was weakened, no sleep/retry was
added, and production components are unchanged by this repair. The complete
budget/XML/weekly set then passed 40/40, followed by the complete 152/152 browser
suite without skips or retries, with E2E types passing. A fresh hosted
run must verify the corrected head; the failed run is not accepted as green.

Production remains held by the existing backup/recovery and coordinated-release
gates. This slice does not establish production recovery, change legacy direct
writers, or introduce global database cutoff enforcement. No production write,
merge, migration or deployment was performed.
