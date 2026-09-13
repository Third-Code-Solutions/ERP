# Atomic draft budget commands and conflict-safe editing

## Changes

- Cost-code creation, initial-budget creation and draft save now admit current
  actor/tenant authority inside the transaction, use canonical project advisory
  locking and commit semantic audit with data changes. Definite nested unique
  violations return a conflict, not an uncertain result.
- Saves require a stable request key and exact persisted version. The opaque
  version combines `xmin` with microsecond epoch text, avoiding JavaScript date
  truncation. The editable header, token and ordered lines load in one scoped
  statement. A stale editor cannot overwrite a newer draft.
- Payload-bound audit receipts reconcile exact retries before status/version
  checks, including a save retried after submission or another save. Original
  inserted-line IDs, client bindings and resulting version are retained. Changed
  payloads cannot reuse a request key. Legacy unkeyed creates remain supported
  without a safe-retry promise; old saves without a version must reload.
- Preserve ADR-018 approval policy, integer centavo math, hidden BOM access,
  cost-code swaps, line IDs/creation timestamps and immutable approved budgets.
  No schema migration or dependency is introduced.
- The editor freezes pending/uncertain inputs, retains exact commands and only
  clears create inputs after confirmation. Receipts are checked against actor
  lifetime, project, draft, request, version and submitted line bindings.
  Refresh failures remain warnings after commit.
- Independent review found and corrected a refresh-before-receipt duplicate-line
  race. It also found grouped currency strings invalid in numeric inputs;
  editor values now remain ungrouped while totals retain display formatting.
  Mobile rows stack with explicit labels instead of requiring horizontal scroll.

## Verification

- PASSED: main independently reproduced all three audit-after-commit failures
  against synthetic loopback PostgreSQL before implementation.
- PASSED: 67 database-backed mounted-action tests without skips: 30 new draft
  cases plus 37 existing workflow cases. Covers atomic rollback, committed cache
  warnings, stale authority, cross-tenant/project scope, hidden BOM fields,
  replay after later save/submission, unchanged IDs/timestamps, stale-editor
  barriers, code swaps, canonical advisory ordering and save/submit serialization.
  Exact keyed creation replay and changed-payload rejection were also verified
  for both Cost Codes and initial budgets.
- PASSED: 47 focused Web tests, including action policy/identity regressions,
  coherent snapshot query checks and receipt/line-reconciliation validation.
- PASSED: 18 Chromium journeys without skips. All three editor commands are
  exercised alongside the existing approval/revision flows, with exact retries,
  actor replacement, stale responses, dirty refresh conflicts and early saved-line
  refresh. Numeric amounts and all editor fields were verified at 320px; main
  visually inspected the stacked editor screenshot.
- PASSED: Web and E2E TypeScript, dedicated integration TypeScript with the same
  auth alias used by the integration runner, source ESLint and diff checks.
  Temporary type-check configuration was removed.
- Original RED evidence also covers nested duplicate classification, duplicate
  saved-line reconciliation, grouped numeric values and mobile field overflow.
  No test or security gate was disabled to obtain passing results.

## Release

Not deployed. Production data and migration ledger are unchanged. A fresh PR CI
run is still required; the complete ERP roadmap and hosted all-role verification
remain unfinished. Browser tests here use controlled action boundaries and are
not a substitute for hosted authentication/Storage journeys.

Predecessor PR88 passed all ten CI jobs. Main checked downloaded results:
database 508/API 356/Web 2/browser 115/trusted PR 1, without skips, and an empty
schema diff. Recovery evidence and the existing five pending migrations still
gate production promotion; passing predecessor CI does not waive those gates.
