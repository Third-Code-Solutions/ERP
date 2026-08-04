# Cortex authenticated route boundary

Status: source-complete, 2026-08-04. Original Third Code ERP behavior; no
vendor code, schema, branding, or text copied.

## Contract

`/cortex` is an authenticated browser surface. Middleware must redirect a
request without a Supabase user to `/auth/login` before rendering the Cortex
page. The page and its server components still call `getUserProfile()` and
retain tenant/role checks as defense in depth.

`/api/cortex/*` remains outside browser redirect matching. Each API handler
must return its own 401/403 response, tenant scope, role filter, and private
response headers so fetch callers receive an API result instead of HTML.

## Matching rules

- `/cortex` and `/cortex/...`: protected.
- `/api/cortex/...`: not middleware-redirected; handler authorization owns it.
- `/cortexology`: public/non-match; prefix matching must not create accidental
  route protection for similarly named paths.
- `/auth/login` and `/`: public.

## Evidence

Before this slice, local browser navigation to `/cortex` reached the
`Workspace not set up` page when no provisioned profile existed. Unit coverage
now asserts the shared prefix contract. Full browser verification with a
real authenticated disposable tenant remains required for allowed, denied,
cross-tenant, and citation-bearing Cortex flows.
