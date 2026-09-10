# Inspection RFI register and resolution API

Agent 05; bounded by PRD WO-12 and the inspection RFI handoff.

## Changes

- Added strict shared query, row, list, expected-state command and transition-result contracts.
- Added `GET /v1/crm/opportunities/:opportunityId/inspection-rfis` with status/priority filters and bounded pagination across all inspections, ordered by creation time descending then ID ascending. Requires `opportunity.read`.
- Added `/resolve` and `/reopen` POST commands under that register using the existing `site_inspection.submit` capability. Core revalidates membership, locks ownership and RFI rows, rejects stale expected resolution state, and commits resolution fields plus semantic reason audit in one transaction. An unchanged matching state does not emit another semantic audit.
- Registered the controller in CRM and its existing structured command-observability middleware.
- No schema, RLS policy, UI, pipeline, financial, or deployment changes.

The expected-state token is the current nullable `resolvedAt` timestamp. It
protects concurrent resolve/reopen edits, but it is not a monotonic revision;
an old open token can match again after a resolve→reopen cycle. A future
correspondence/history model should add a revision token before requiring
strict intervening-change detection.

## Verification

- PASSED: API service/controller/protected-boundary tests, 20 tests.
- PASSED: shared contract tests, 2 tests.
- PASSED: API and shared-types typechecks.
- PASSED: ESLint for the changed API runtime files and CRM module. Test files are ignored by repository ESLint configuration.
- NOT RUN: real PostgreSQL transaction rollback/concurrency/RLS replay and browser journeys. Unit tests prove transaction callback rejection on audit failure, not a live rollback.
- Environment: Node 24.16.0; repository declares Node 22. Checks used the existing engine override. Prettier executable is unavailable; no dependency was added.

## Security handoff

Existing migrations provide tenant RLS and force it on the inspection tables, composite tenant ownership FKs, and row-change audit triggers. Existing direct authenticated table privileges remain select/insert/update with tenant-only policies; this slice does not alter them. Agent 12 must review that separate direct-write surface before release claims. No provider or production data was touched.

→ Handoff to Agent 12: review Core authorization, tenant ownership, transaction/audit behavior and existing direct-write RLS surface. Then Agent 03 can consume the shared contracts for the inspection register UI.
