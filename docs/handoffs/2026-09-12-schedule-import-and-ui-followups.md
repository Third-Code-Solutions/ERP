# Schedule import and UI follow-ups

## Scope and ownership

- Agent 05: validate and import an explicitly selected legacy L1 schedule into existing normalized schedule tasks through Core; preserve source data and operational edits; verify replay, conflicts, authorization and audit failure.
- Agent 03: expose source preview, confirmation and truthful result/error states through the schedule UI and Core client. Keep the source snapshot identity bound to confirmation.
- Agent 12: exercise tenant boundaries, real PostgreSQL rollback and concurrent replay in the disposable integration lane.
- Agent 02/03: finish previously identified keyboard, document table, procurement responsive and form announcement fixes using existing design tokens.
- Agent 13: run required CI and deployment checks before promotion.

Agents work on distinct files. Backend/shared contracts precede Web integration. Database integration tests are separate from service implementation files.

## Acceptance

Imported tasks retain names, dates and predecessor links; retries do not duplicate or overwrite tasks. Source JSON remains intact. Missing labour estimates remain explicit. Invalid or changed snapshots and conflicting task codes produce no partial batch. Unauthorized and cross-tenant requests fail closed. Browser verification must cover preview and confirmation separately from database transaction verification.

## Current evidence

Backend/shared initial slice: `6058d14b`; focused API 11 tests and shared 5 tests passed before Web integration. UI follow-ups: `24d446fb`; project document render suite 13 tests, E2E TypeScript and scoped lint passed. Further integration and release checks are pending; these local results are not deployment evidence.

The existing release `role-access-production.spec.ts` now checks schedule heading/data and import-preview visibility for all eleven seeded roles within the existing login loop, plus admin mobile procurement stacking/no overflow at 390px. It requires a valid `E2E_PROJECT_ID` before authentication and submits no business mutations. Agent 13 owns hosted execution; local typechecking does not prove deployed role access.
