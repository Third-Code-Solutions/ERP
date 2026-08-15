# Production audit repairs — 2026-08-15

## Objective

Repair source-backed defects found during the read-only production E2E audit
without mutating hosted ERP data, enabling provider-spend canaries, or
deploying from a dirty workstation.

## Ordered ownership

1. **Agent 03 — App Router:** add metadata to project progress, weekly reports,
   and variation-order routes; extend the project route regression walk.
2. **Agent 03/11 — Procurement UI:** correct delivery-count pluralization and
   retain a browser regression assertion for the rendered label.
3. **Agent 08/02 — Cortex UX:** explain the closed provider-spend canary while
   keeping the server-owned fail-closed gate unchanged.
4. **Agent 13 — CI/Ops:** restore the documented `verify:production-surface`
   package command and test the command contract.
5. **Agent 05 — API test harness:** keep the Cortex entity HTTP-contract
   initialization timeout bounded at 30 seconds so Windows/Node startup does
   not fail the release gate at the default 5-second test timeout.

## Explicitly not included

- No hosted data cleanup, deletion, financial posting, tenant migration, or
  production deployment.
- No enabling of Cortex provider-spend flags, AI cutovers, staged assets, or
  other rollout gates.
- No replacement of intentional budget, empty-state, finance, or roadmap
  behavior with fabricated sample data.

## Verification requirement

Each increment must report PASS, FAIL, BLOCKED, or NOT RUN. Hosted browser
verification of the resulting branch remains separate until an authorized,
identity-verified deployment exists.
