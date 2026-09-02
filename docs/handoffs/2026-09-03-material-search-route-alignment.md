# Material search route-alignment handoff

## Finding and impact

Universal search authorizes material results for `admin`, `commercial`,
`sd_pm_pe`, and `procurement`; its legacy aliases also make `estimator` and
`pm` inherit those grants. Every material result links to
`/admin/material-items`, but the checked-in page and route policies admit only
owner, admin, and commercial. Estimator, PM, Service Delivery, and Procurement
can therefore receive a result they are guaranteed to be forbidden from
opening.

Evidence:

- `packages/shared-types/src/erp-api/universal-search.ts`
- `apps/web/src/app/api/search/route.ts`
- `apps/web/src/app/(dashboard)/admin/material-items/page.tsx`
- `apps/web/src/lib/operations/nav-config.ts`
- `docs/functional/RBAC_SUMMARY.md`

There is no separate read-only material detail/list destination in the current
route inventory. This slice aligns search visibility to the existing result
destination; it does not create a new material UI or broaden Admin access.

## Acceptance criteria

1. Material search results are authorized only for persisted roles that can
   open `/admin/material-items`: owner, admin, and commercial.
2. Estimator, PM, Service Delivery, and Procurement issue no material search
   query and receive no material result from either the Web compatibility route
   or the future Core authority sharing this contract.
3. Existing non-material universal-search grants, tenant filters, result shape,
   limits, cache controls, and partial-failure behavior remain unchanged.
4. Tests cover all thirteen persisted roles, explicit legacy alias behavior,
   query short-circuiting before database access, and a positive commercial or
   admin material result with the existing destination.
5. Pass focused shared-contract and Web route tests, complete shared/Web/Core
   TypeScript as applicable, source lint, production build, gitleaks, and an
   independent authorization review.
6. Perform read-only built-app browser/API verification with supplied
   Commercial and Procurement identities if seeded material data can be found
   without mutation. Record a data-absence or identity limitation explicitly
   rather than fabricating a result.

## Explicit limits

- Do not add a new route, page, capability, dependency, schema, migration,
  account, or material record.
- Do not broaden `/admin/material-items` route or page access.
- Do not change vendor, BOM, PO, project, opportunity, or other search grants.
- Do not address opportunity CSV export or Viewer semantics in this slice.

## Sequential ownership

1. Principal Agent 5 / API & Backend scope owns the shared universal-search
   contract, Web compatibility route coverage, and focused tests.
2. Principal Agent 4 independently reviews role/destination parity, tenant and
   query short-circuit behavior, Core/Web contract reuse, and verification.
3. Principal Agent 5 browser-verifier role performs a read-only Commercial vs
   Procurement built-app check after code review when live data permits.

This branch is stacked on PR #20. No production deployment or data/account
mutation is authorized.
