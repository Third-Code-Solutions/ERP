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

## M3.35 runtime evidence

- Fresh local runtime: `/cortex`, `/finance`, and `/inventory` return `307`
  with `Location: /auth/login` without a session.
- Fresh local runtime: `/api/cortex/search` returns `401` JSON with
  `Cache-Control: private, no-store, max-age=0` and `Vary: Cookie`; it does not
  return login HTML.
- `cortex-focused-local.spec.ts`: 1/1 authenticated run passed graph scope,
  focused-record navigation, conversation search/deep links, and desktop /
  tablet / mobile overflow checks.
- `dashboard-role-local.spec.ts`: 1/1 authenticated viewer run passed; hidden
  executive pipeline/finance data and tenant-scoped search headers verified.
- Auth session was generated and revoked through Supabase admin/auth APIs;
  business data remained read-only.

Runs used configured demo data, not isolated two-tenant disposable database.
Cross-tenant denial, citations, redaction, and audit-replay proof remain
promotion gates.
