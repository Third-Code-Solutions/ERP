# WO-12 — Mobile SI Report + RFI

Date: 2026-08-14

## Outcome

PARTIALLY VERIFIED.

The existing mobile site-inspection flow is now protected against duplicate
submission during offline reconnects and browser retries. The client keeps a
stable UUID in IndexedDB; the server validates it, serializes concurrent
retries, replays the existing inspection, and suppresses duplicate audit,
report-archive, SLA, and notification side effects. PPRF values remain the
prefill source, camera capture remains available, and the existing same-screen
RFI flow remains tenant-scoped and audited.

## Changes

- Added nullable `site_inspections.client_submission_id` with a tenant-scoped
  partial unique index.
- Added transaction/advisory-lock idempotency to `submitInspection`.
- Moved inspection photo linking and the inspection audit row into the same
  transaction as the inspection insert.
- Persisted the retry token with the local mobile draft and submitted it as a
  validated server boundary field.
- Added a WO-12 source contract gate to CI.

## Verification

- PASS — `pnpm test:wo-12-contract`
- NOT RUN — live PostgreSQL migration replay; Docker daemon is unavailable in
  this workspace.
- NOT RUN — authenticated mobile/browser offline reconnect replay; installed
  workspace browser/runtime dependencies are unavailable.
- NOT RUN — full typecheck/build/unit/E2E suites; the frozen workspace install
  and required local binaries are not available in the current environment.

## Remaining risk

RFI creation is available from the same inspection screen and remains
tenant-scoped, but its current server action is network-bound; the offline
draft/sync guarantee currently covers the inspection report and photos. A
future RFI queue should be introduced only with a matching idempotency token
and server contract, rather than silently duplicating RFIs on reconnect.
