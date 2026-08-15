# Enterprise hardening handoff — 2026-08-14

## Objective

Raise ABI OPS from the current audited baseline toward a defensible company-facing
release while preserving the existing refactor authority and production routes.

## Ordered ownership

1. **Agent 13 — CI/CD & Ops:** reproduce and repair the two failed main-branch CI
   gates; verify deployment identity and keep promotion fail-closed.
2. **Agent 12 — Security/DevSecOps:** review the production data/test-identity
   boundary and add contamination detection without weakening RLS or deleting data.
3. **Agent 03/05/10 — Routing/API/BOM:** trace the slow BOM route and fix the
   measured runtime bottleneck with auth/tenant/error-state coverage.
4. **Agent 02/09/11 — UX/UI:** address only source-backed responsive/accessibility
   defects found in the affected journeys.
5. **Agent 01 — Product/PRD:** reconcile acceptance evidence, blocked ABI artifacts,
   and the final release report.

## Handoff rule

Each increment must leave a changeset, focused verification evidence, and an explicit
`PASS`, `FAIL`, `BLOCKED`, or `NOT RUN` state before the next owner proceeds. Hosted
data cleanup remains blocked until the ABI tenant, retention policy, backup/restore
evidence, and exact reversible manifest are confirmed.
