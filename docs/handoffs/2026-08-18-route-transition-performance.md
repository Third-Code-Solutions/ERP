# Route-transition performance — 2026-08-18

## Status

**PARTIALLY VERIFIED.** The authenticated dashboard and CRM Accounts screenshots
show that the persistent application shell renders while route data waits behind
route-level loading boundaries. Source inspection identified a dashboard
cost-control N+1 query pattern and local production-build browser evidence
identified eager sidebar prefetch pressure. No hosted data, schema, provider, or
configuration has been changed.

## Delivery sequence

1. **Agent 05 — API and backend data path.** Replace repeated per-project
   dashboard cost-control reads with one tenant-scoped aggregate read that
   preserves the existing financial totals and tenant predicates.
2. **Agent 09 — Dashboard consumer.** Consume the aggregate totals in both
   management health and GP-erosion alerts so one render does not recompute
   the same project cost data.
3. **Agent 03 — App Router navigation.** Add intent-only prefetching to the
   authenticated sidebar for keyboard focus and pointer hover. Do not eagerly
   prefetch every route or weaken route authorization.
4. **Agent 13 — Verification and release.** Align the Vercel Function region
   with the Supabase database region, then run focused tests, broad checks,
   and safe browser checks. Commit, push, and deploy only if every applicable
   release gate is green and the existing dirty worktree can be safely
   reconciled.

## Acceptance criteria

- The dashboard does not execute a cost-control query once per project for
  alerts and again for management health during one render.
- Aggregate totals retain project and tenant isolation and use the same
  cost-control metric calculation as the detailed project-cost page.
- Sidebar prefetch starts only after explicit user intent and works for
  keyboard navigation.
- Vercel functions are configured for `icn1`, matching the supplied Supabase
  project's `ap-northeast-2` database region.
- No database migration, hosted mutation, secret readout, or authority bypass
  is introduced.
- Focused regression coverage, lint, type-check, and build pass before any
  release action is considered.

## Explicit boundaries

- A live authenticated timing comparison requires a dedicated test user or
  other isolated authenticated evidence; the user's daily browser profile is
  not used.
- The local authenticated browser uses a `DATABASE_URL` whose host is not the
  supplied Supabase project. Its Accounts skeleton therefore cannot be used as
  evidence of the supplied project's production-query latency.
- The active hosted deployment still runs in `iad1`; the `icn1` configuration
  is source-validated but takes effect only after an authorized deployment.
- Supabase advisor findings outside the query path are tracked separately;
  they are not bundled into an unmeasured schema migration.
