# Project detail and Cortex context layout repair — 2026-08-18

## Scope

The supplied local project-detail screenshot shows a blank primary workspace
while the retained Cortex context panel occupies the right rail. Its
two-column relationship list is visibly over-constrained inside a 300px rail.
This work preserves the PRD-mandated Project and Cortex surfaces; it repairs
their composition and responsive presentation.

## Sequence

1. **Agent 03 — Project route.** Reproduce the authenticated detail page,
   ensure the project workspace has a visible primary region, and bound the
   Cortex context as supporting information.
2. **Agent 08 — Cortex presentation.** Make relationship and source content
   readable in a narrow context rail without changing data, tenancy, or graph
   semantics.
3. **Agent 13 — Browser verification.** Add a read-only authenticated visual
   regression that validates desktop and mobile geometry, accessible labels,
   clean console output, and no horizontal overflow.

## Boundaries

- No Cortex graph, API, database, authorization, or tenant behavior changes.
- No hosted data mutation or deployment is part of this repair.
- Existing unrelated dirty changes remain untouched.

## Outcome

The compact project rail now uses one readable relationship card per row,
limits the visible context pack to four connections and four sources, and
keeps the complete graph reachable through focused graph links. Long project
names wrap on narrow screens rather than being clipped.

**→ Handoff complete.** Local component, type, lint, production-build, and
authenticated Chromium checks have been run. Hosted deployment and production
browser verification remain outside this repair's authorization.
