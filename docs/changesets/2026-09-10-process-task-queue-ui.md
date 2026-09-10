# Process Task Queue UI

## Scope

- Added a capability-gated process task queue to the Process Health page.
- Added URL-persisted status, responsible-business-unit, page, and page-size filters.
- Filter submissions reset pagination to page one and out-of-range empty pages provide a recovery link when matching results still exist.
- Added authenticated Core API client validation and fail-closed response parsing.
- Rendered task-step, assignment, blocked-reason, and nullable SLA-clock details without exposing deep links or evaluating clocks in the browser.
- Added capability-gated status actions for the Core-owned transition matrix, with a required blocked reason and visible pending, success, and error states.
- Transport failures now report an unconfirmed outcome and instruct the operator to refresh before retrying, avoiding false failure claims after a request may have committed.
- Preserved the existing process health and approval-route preview sections.

## Verification

- Web Core-client tests: 181 passed, including the transport-outcome regression.
- Process task action tests: 4 passed.
- Web lint: passed.
- `git diff --check`: passed.
- Full Web typecheck: blocked by pre-existing generated `.next/types` imports referencing missing route modules; the changed files produced no reported type errors before that generated-file failure.
- Verification ran with Node 24.16.0/pnpm 10.33.0 while the repository declares Node 22.x; pnpm emitted the existing engine warning.

## Deliberate non-scope

- No assignment actions, subject deep links, browser-side SLA evaluation, schema/migration changes, or approval execution policy changes were introduced. Core remains authoritative for tenant ownership and transition validity.
