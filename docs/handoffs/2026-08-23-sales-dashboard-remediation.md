# Sales dashboard remediation handoff

## Scope

Repair the authenticated Sales dashboard, its pipeline analytics, and the
supporting export filter without altering the unresolved tenant-wide CRM
entitlement policy recorded in `docs/blockers/2026-08-23-rbac-entitlement-matrix.md`.

## Sequential ownership

1. **Agent 09 — Dashboard:** normalize legacy and canonical opportunity stages
   in dashboard analytics, introduce a Sales-specific dashboard mode, and add
   regression coverage for the pipeline calculations.
2. **Agent 03 — App Router:** parse dashboard URL filters, pass them to the
   authorized loaders, and render a Sales-appropriate dashboard without
   project-cost or permit-exposure widgets.
3. **Agent 05 — API boundary:** keep the CSV export aligned with the selected
   Sales representative filter and validate that filter at the route boundary.

## Guardrails

- Do not restrict `account.read`, `opportunity.read`, or
  `dashboard.analytics.read` beyond the centrally approved policy. The PRD
  does not resolve the conflicting entitlement matrix.
- Preserve tenant predicates on every query and avoid a database migration.
- Keep legacy opportunity stages visible by normalizing them to their ABI OPS
  canonical equivalents; do not mutate historical opportunity records.

## Completion evidence

Targeted unit tests for stage normalization, dashboard-mode selection, filter
parsing, and CSV propagation; then typecheck, lint, relevant app tests, and a
production build where the local runtime permits it.
