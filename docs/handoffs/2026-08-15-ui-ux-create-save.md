# UI/UX and create/save reliability handoff — 2026-08-15

## Request

Improve the UI/UX across the authenticated web routes and make every supported
create/edit/save journey provide reliable validation, pending feedback, success
feedback, error recovery, and persisted data refresh. The attached screenshots
are visual references only; they are not product or execution instructions.

## Scope and routing

This work spans the following repository ownership areas and must be handled in
sequence without changing database or accounting invariants:

1. **Agent 02 — UX/UI Layout Architect**
   - Shared design tokens, primitives, shell composition, empty/loading/error
     states, responsive behavior, focus and contrast.
   - Inputs: existing route inventory and current design system.
   - Output: reusable, prop-driven UI patterns with no product data fetching.
2. **Agent 03 — Next.js App Router Engineer**
   - Authenticated layout, navigation, route-level loading/error boundaries,
     mutation feedback wiring, and query refresh behavior.
   - Output: routes remain reachable and state transitions are recoverable.
3. **Agents 09/10/11 — Dashboard, BOM, and Pipeline UI**
   - Targeted route composition and create/save journeys in their owned areas,
     using the shared primitives and existing API contracts.
4. **Agent 05 handoff if required**
   - Only if a proven API contract or server mutation defect prevents a real
     save; no client-side workaround may fabricate persistence.

## Boundaries

- Preserve tenant isolation, authorization, audit events, immutable posting and
  reversal workflows, and existing public route contracts.
- Do not add a second data model, weaken validation, or introduce fake local
  saves for server-backed records.
- Read-only and print/portal routes may receive presentation fixes but do not
  gain creation controls unless the existing product contract supports them.
- Production deployment requires explicit authorization and must use the
  guarded PR/workflow release path; the current request supplies that
  authorization. Do not push directly to `main` or bypass release gates.

## Acceptance evidence

- Route inventory and current failure/baseline findings are recorded.
- Shared visual patterns are used consistently across affected routes.
- Supported create/edit/save actions show validation, pending, success, and
  recoverable error states and refresh persisted data after success.
- Targeted unit/integration checks and real-browser checks are run where the
  local environment permits; missing auth/provider evidence is reported as a
  blocker rather than inferred green.

## Status

> Implemented in the current session. Shared UI primitives now cover the
> confirmed finance layout defect, responsive dashboard loading, and accessible
> mutation feedback on the audited account and proposal/inspection forms.
> Typecheck, build, unit tests, App Router boundaries, and browser checks for
> the public auth shell passed. Authenticated route and finance persistence
> E2E remain blocked because the local loopback database and explicit E2E
> identity are unavailable; those results are not inferred green.
>
> The release candidate is staged on a branch based on the current
> `origin/main`. Merge and production status remain pending the observed PR
> checks and guarded production workflow result.
