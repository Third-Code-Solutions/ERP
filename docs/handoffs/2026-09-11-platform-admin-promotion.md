# Platform administration promotion handoff — 2026-09-11

## Objective

Promote the reviewed platform-owner administration slices onto the clean production baseline so the documented `/platform-admin` surface is real, guarded, accessible, and release-gated.

## Source slices

- Agent 04 schema/lifecycle boundary: `341d092a`
- Agent 05 platform-owner guard/API services: `10dce63d`
- Agent 03 web route boundaries and console: `a97818c9`

These commits originate from the route-remediation branch, which is based on a different historical baseline. They must be promoted selectively and verified against `origin/main`; the route-remediation release commit is not in scope.

## Ordered ownership

1. Agent 04 — schema, migration, RLS, and tenant/user lifecycle checks.
2. Agent 05 — API validation, authorization, service-role boundaries, and audit evidence.
3. Agent 03 — App Router boundaries and protected route behavior.
4. Agent 02 / relevant feature agents — UX/accessibility review of the console.
5. Agent 12 — security gates, secret scanning, and RLS review.
6. Agent 13 — CI/CD and production verification.

## Acceptance evidence

- Platform-owner-only access for every `/platform-admin` route and API endpoint.
- Tenant/user lifecycle changes require reason and produce append-only audit evidence.
- Support context is explicit, expiring, tenant-bound, and cannot change RLS identity.
- Routes expose loading/error/empty states and remain keyboard/readable at mobile widths.
- API, web typecheck, focused unit/integration checks, route sweep, and production health all pass before merge/deploy.

## Known blockers

Hosted migration application, real platform-owner fixture, and live authenticated browser verification may require environment credentials. Do not claim production completion until those checks are run against the exact deployed commit.
