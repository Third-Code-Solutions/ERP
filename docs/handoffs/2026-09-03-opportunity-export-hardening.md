# Opportunity CSV export hardening handoff

## Finding and impact

`GET /api/exports/opportunities-csv` currently treats authentication as
authorization and exposes tenant-wide pipeline economics to every persisted
role. The export control is rendered only in the executive-dashboard branch,
which deliberately excludes Safety, CX, and Viewer.

The same endpoint also joins Project and User by ID without tenant equality,
uses `projects.client` instead of the canonical Account, accepts untyped and
invalid filters, excludes most of the selected `until` day, materializes an
unbounded nondeterministic result, and quotes CSV without neutralizing
spreadsheet formulas in user-controlled text.

Evidence:

- `apps/web/src/app/api/exports/opportunities-csv/route.ts`
- `apps/web/src/components/dashboard/export-csv-button.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/lib/dashboard-access.ts`
- `apps/web/src/lib/dashboard-queries.ts`
- `packages/shared-types/src/authorization.ts`

The PRD describes the surface as the management dashboard but does not define a
CSV-specific RBAC matrix. The policy-preserving remediation uses the ten roles
whose existing dashboard mode renders the export: owner, estimator, PM, admin,
sales, commercial, design, Service Delivery, finance, and procurement. Safety,
CX, and Viewer remain on the assigned-work dashboard and must be denied before
database access. This avoids breaking six visible flows by incorrectly tying
the button to the separate Reports page, while remaining narrower than the
all-role `opportunity.read` capability.

## Acceptance criteria

1. Add a central `opportunity.export` capability for the exact ten-role
   executive-dashboard projection. The route returns 401 without a profile and
   403 for Safety, CX, or Viewer before any export query.
2. Validate the query boundary strictly with Zod: only a single `since`,
   `until`, and declared opportunity-stage value are allowed; unknown or
   duplicate keys, impossible calendar dates, and reversed ranges return 400.
3. Treat date-only filters as Asia/Manila calendar days with a half-open range:
   inclusive start of `since` and exclusive start of the day after `until`.
4. Scope Account, Project, and User joins by both ID and the authenticated
   tenant. Export the canonical Account name with a documented legacy Project
   client fallback when no Account exists.
5. Use deterministic ordering and a documented maximum of 10,000 rows. Query
   at most one sentinel row beyond the maximum and return an explicit bounded
   error instead of silently truncating.
6. Neutralize spreadsheet-formula prefixes (`=`, `+`, `-`, `@`, tab, CR) in
   untrusted text cells while retaining RFC-4180 escaping. Preserve legitimate
   negative numeric values as numeric cells.
7. Apply private/no-store, cookie-varying, and `nosniff` headers to every
   response status. Database failures return a generic 500 body without query
   diagnostics.
8. Add exact thirteen-role authorization tests, denied-before-query tests,
   strict filter/date/range cases, compiled tenant-join/ordering/limit evidence,
   canonical-account and fallback mapping, row-cap behavior, CSV
   escaping/formula cases, negative numeric preservation, error handling, and
   response-header checks.
9. Pass focused shared/Web tests, complete Web and E2E TypeScript, source lint,
   production build, gitleaks, diff checks, and independent security/RBAC
   review.
10. After QA, run read-only built-app checks with at least one allowed and two
    denied supplied identities. Verify denied calls return 403 without CSV and
    allowed output is bounded/private. Do not create or mutate export data.

## Explicit limits

- Do not change the ten-role executive-dashboard projection, Reports route,
  broad opportunity read behavior, or Viewer semantics in this slice.
- Do not add a dependency, schema, migration, account, fixture, route, or UI
  redesign.
- Do not change opportunity records, stages, assignments, or dates during
  browser verification.
- Do not deploy.

## Sequential ownership

1. Principal Agent 5 / API & Backend scope owns the capability, route, query,
   and focused automated coverage.
2. Principal Agent 4 independently reviews authorization, tenant isolation,
   formula safety, validation/timezone boundaries, bounded behavior, and
   verification evidence.
3. Principal Agent 5 browser-verifier role performs the final read-only
   allowed/denied built-app matrix after code review.

This branch is stacked on PR #21. No production deployment or data/account
mutation is authorized.
