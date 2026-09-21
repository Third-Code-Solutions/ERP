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

Focused Vitest coverage and web typecheck/lint are recorded in the task handoff.
No migration, deployment, or production data change is included.
