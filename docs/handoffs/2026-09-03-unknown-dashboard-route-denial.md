# Unknown dashboard route denial handoff

## Finding and impact

`canViewPath` is described and tested as the dashboard's deny-by-default
defense, but its final branch currently returns `true` for any pathname that
does not match `NAV_SECTIONS`. A newly added or misspelled dashboard route can
therefore bypass the shared navigation guard until its page-local checks run;
consumers that reuse the helper can also mistake an unregistered access path
for an allowed one.

The current test explicitly codifies this unsafe fallback with
`canViewPath('viewer', '/future-workspace') === true`.

Evidence:

- `apps/web/src/lib/operations/nav-config.ts`
- `apps/web/src/lib/operations/nav-config.test.ts`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/middleware.ts`
- `apps/web/src/lib/cortex/rbac.ts`

This is a fail-closed route-registry correction. It does not authorize changing
central capabilities, role grants, page business logic, public portals, auth
callbacks, APIs, schemas, migrations, or deployment.

## Acceptance criteria

1. Inventory every real `apps/web/src/app/(dashboard)/**/page.tsx` route and
   identify which path family currently matches an explicit route item,
   account/settings exception, or only the allow-by-default fallback.
2. Register every legitimate dashboard path family that would otherwise be
   broken by default denial. Hidden/redirect/secondary routes must not appear
   in the sidebar merely to become authorized. Derive their roles from the
   existing page gate, central capability, or existing read projection; do not
   invent access.
3. Change the truly unknown dashboard fallback to deny. Preserve explicit
   account/settings behavior and the existing `/api/**`, `/portal/**`, and
   `/auth/**` exemptions for callers outside the dashboard layout.
4. Navigation visibility and active-link behavior must remain unchanged for
   the existing sidebar. Controlled-rollout `/assets` behavior and the legacy
   route-policy correction from PR #19 must remain intact.
5. Add table-driven tests proving all real dashboard page families resolve to
   an explicit policy, representative nested/dynamic routes inherit the most
   specific parent, and unknown/misspelled paths fail closed for every one of
   the thirteen roles.
6. Add regression coverage for any newly registered hidden redirect/secondary
   route and for downstream `canViewPath` consumers. If a legitimate page's
   intended roles cannot be proven from current source, stop and report the
   exact path instead of guessing.
7. Pass focused route/consumer tests, complete Web and E2E TypeScript, Web lint,
   production build, gitleaks, and independent security/authorization review.

## Explicit limits

- Do not change `packages/shared-types/src/authorization.ts`, universal-search
  grants, role enums, schemas, migrations, seeds, RLS, APIs, or accounts.
- Do not address the estimator material-search destination or opportunity CSV
  export in this slice.
- Do not turn hidden policy entries into visible navigation.

## Sequential ownership

1. Principal Agent 3 is the sole source editor in Agent 03 scope for the route
   registry/helper and focused tests.
2. Principal Agent 4 independently reviews complete-route coverage,
   least-privilege role derivation, fail-closed behavior, regressions, and
   verification gates.
3. Principal Agent 5 performs read-only production-build browser checks after
   QA only if the changed fallback is observable through a routed dashboard
   path; otherwise the browser step is explicitly not applicable.

This branch is stacked on PR #19. No production deployment or data mutation is
authorized.
