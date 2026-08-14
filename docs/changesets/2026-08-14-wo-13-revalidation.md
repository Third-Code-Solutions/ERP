# WO-13 — award automation revalidation

Date: 2026-08-14

## Outcome

PARTIALLY VERIFIED.

The existing signed-BOM award path remains the atomic execution handoff. This
revalidation closes two source-level defects: a same-source empty open budget
is now populated from the approved BOQ instead of being returned as an empty
baseline, and budget/invoice award arithmetic uses BigInt centavo operations
with safe conversion only at the existing database number boundary. The
down-payment form also converts decimal percentages to basis points without
floating-point multiplication.

## Verification

- PASS — `pnpm test:wo-13-contract`
- PASS — existing committed WO-13 database integration evidence in
  `docs/changesets/2026-08-13-wo-13-award-automation.md` remains the prior
  baseline; it was not rerun in this environment.
- NOT RUN — current PostgreSQL migration replay and live award transaction;
  Docker daemon is unavailable in this workspace.
- NOT RUN — current typecheck/build/full unit/E2E suites; workspace runtime
  dependencies are unavailable.

## Compatibility boundary

The repository still requires `boms.project_id`, so the award operation
promotes the existing project shell and records `project_was_created=false`.
This is explicit and reversible; it does not fabricate a project-creation
claim that the current schema cannot support.
