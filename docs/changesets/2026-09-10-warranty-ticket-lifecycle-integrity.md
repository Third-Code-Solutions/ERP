# Warranty ticket lifecycle integrity

## Changed

- Moved acknowledge, schedule, in-progress and close transitions into
  tenant-scoped transactions with `FOR UPDATE` ticket locks.
- Enforced server-side lifecycle rules: terminal tickets cannot be reopened,
  rescheduled or reclosed; only acknowledged/scheduled tickets can start
  work; close still requires a service-report document from the ticket's
  project.
- Persisted ticket state, SLA clock changes and append-only audit evidence in
  the same transaction. CNPS event dispatch remains after commit and keeps
  the existing cron recovery path.
- Repeated close attempts now fail without changing `closed_at`, service-report
  identity or emitting another survey event.
- Added transaction-aware SLA helpers and focused action tests for allowed and
  rejected lifecycle transitions.

## Verification

- Warranty action tests: PASS (5 tests).
- Web typecheck: PASS.
- Live provider and authenticated browser execution: NOT RUN; no new isolated
  warranty demo fixture was authorized for this turn.

## Boundary

This slice does not decide unresolved contract-specific warranty or retention
terms (PRD O-10); it hardens lifecycle integrity using existing ticket states.
