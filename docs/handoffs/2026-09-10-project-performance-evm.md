# Handoff — project performance EVM/CVR

Date: 2026-09-10

## Scope

Expose source-derived earned-value and CVR metrics for a project without
replacing the existing cost-control triangle or the legacy progress importer.

## Work completed

- Shared Zod contract and pure integer-centavo EVM math for BAC, PV, EV, AC,
  CPI, SPI, EAC, ETC, and VAC.
- Core read endpoint `GET /v1/projects/:projectId/performance` guarded by
  `project.read` and tenant/deleted-project scope checks.
- Planned value is time-phased from normalized schedule dates weighted by
  planned labour minutes; actual progress prefers the latest valid weekly
  progress update and falls back to weighted normalized task completion.
- Actual cost reads only posted supplier-bill line evidence; commitments are
  not added to actuals.
- Project cost page now renders the Core performance card with explicit partial
  and unavailable states and evidence notes.
- Opt-in all-role Playwright matrix added (`E2E_PERFORMANCE_AUTH=1`).

## Explicit non-goals / follow-up

- No BOM fallback is used as an approved baseline.
- No new persisted snapshot table, legacy schedule migration, MS Project import,
  resource-leveling engine, or synthetic progress percentages were introduced.
- Dashboard-wide portfolio EVM rollups and period-locked WAR/CVR snapshots need
  the ordered progress-capture and commercial closeout slices.

## Handoff

→ Agent 01 / Product-PRD Guardian: review user-visible EVM/CVR naming and add a
PRD/roadmap changelog entry if required.
→ Agent 13 / CI-Ops: include the Core performance route and opt-in browser
matrix in staged deployment verification once a demo tenant is configured.
