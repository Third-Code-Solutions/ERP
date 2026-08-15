# ADR-020: Guarded production promotion workflow

- Status: Accepted
- Date: 2026-08-13

## Decision

Production promotion uses a manually dispatched GitHub workflow on `main`,
protected by the GitHub `production` environment. The workflow runs release
gates, previews and applies the ordered Supabase migrations through a
write-scoped session-pooler URL for the exact project, deploys the exact
Railway API and CAD worker services, deploys the exact Vercel project, and
checks all public health/readiness contracts afterward.

Provider project and service identifiers are fixed in the workflow. Provider
credentials are GitHub environment secrets and are never read from the
repository or printed. The read-only production-boundary URL is separate from
the write-scoped migration URL; the workflow validates the migration target
before applying SQL. Missing credentials fail before any provider mutation.
The promotion also requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` for the seeded, authenticated production E2E
harness. After public health checks, the workflow runs the branding, route
smoke, 11-role access matrix, and CAD worker journeys in real Chromium.

## Consequences

- Production deploys become reproducible from a reviewed Git SHA instead of a
  dirty workstation.
- Database changes remain additive and are applied before application rollout.
- The workflow does not enable any API cutover flag or create a canary tenant.
- Rollback remains provider-specific: promote a prior Vercel deployment and
  redeploy the prior Railway deployment. Database rollback is not automatic;
  migrations require an additive forward fix.
- The full hosted password-based CI lane remains separate. This promotion gate
  does not claim completion unless the authenticated production E2E step passes.
