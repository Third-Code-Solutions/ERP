# WO-19 — Purchase-order partial delivery transition

## Outcome

The current purchase-order flow can now advance an issued PO to the canonical
`partial_delivered` state. The legacy `partial_delivery` transition remains
available for older POs, and the existing `partial_delivered` to
`fully_delivered` transition is unchanged.

## Scope

- Added `partial_delivered` to the `issued` status transition allowlist.
- Added server-action regression coverage for canonical and legacy delivery
  transitions, audit events, authentication/capability denial,
  tenant-scoped lookup denial, and terminal-state rejection.

## Verification

- Procurement Vitest suites: 23 tests passed, including 7 new status tests.
- Targeted ESLint on the changed action and regression test: passed.
- WO-15 commitment contract: passed.
- Web typecheck was attempted with engine checks relaxed because the host has
  Node 24 while the repository requires Node 22; compilation is currently
  blocked by pre-existing `forecastCents` errors in the project cost files.
- No migration, deployment, or production data change is included.
