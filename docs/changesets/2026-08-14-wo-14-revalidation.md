# WO-14 — Allowable Budget lock revalidation

Date: 2026-08-14

## Outcome

PARTIALLY VERIFIED.

The existing dual Commercial/Finance approval workflow and database trigger
boundary are retained. The revalidation adds the missing visible original-GP
snapshot to the budget register and cost-control input, and replaces the
budget editor's floating-point peso conversion with exact centavo parsing.
Approved baselines remain immutable; revisions are created through the
explicit revision function.

## Verification

- PASS — `pnpm test:wo-14-contract`
- NOT RUN — current PostgreSQL migration replay and RLS/trigger mutation tests;
  Docker daemon is unavailable in this workspace.
- NOT RUN — current typecheck/build/browser suites; workspace runtime
  dependencies are unavailable.

## Boundary

The repository represents a locked baseline through the approved immutable
Project Budget revision and its workflow-only revision path. No new
`baseline_locked_at` field was fabricated because the existing database
contract uses status plus approval evidence as the lock state.
