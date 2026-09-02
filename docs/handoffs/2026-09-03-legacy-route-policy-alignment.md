# Legacy route-policy alignment handoff

## Finding and impact

The persisted role vocabulary contains thirteen distinct values and the central
capability registry intentionally assigns distinct grants to `estimator`,
`commercial`, `pm`, and `sd_pm_pe`. The Web navigation guard still folds
`estimator` to `commercial` and `pm` to `sd_pm_pe` before evaluating every
route allow-list.

That compatibility shortcut is no longer authorization-safe. `estimator` and
`commercial` differ on 21 central capabilities; in particular, an estimator is
currently shown `/admin` and `/inventory` even though it lacks
`admin.rate_card` and `inventory.read`. `pm` and `sd_pm_pe` also differ on
`audit.read` and `precon.override_mobilization`. A visible link can therefore
lead to a later page/action denial, while a distinct legacy grant can be hidden
by its replacement role's route projection.

Evidence:

- `packages/shared-types/src/authorization.ts`
- `apps/web/src/lib/operations/nav-config.ts`
- `apps/web/src/lib/operations/nav-config.test.ts`
- `docs/superpowers/plans/2026-05-12-third-code-erp-refactor.md`, whose original
  migration plan expected legacy rows to be converted even though the enum and
  current authorization policy still retain all four distinct roles

This slice aligns route/navigation projection with the existing central
policy. It does not authorize changing capability grants, persisted roles,
database rows, RLS, API contracts, or the PRD.

## Acceptance criteria

1. Reproduce the current false-positive navigation/direct-route cases for
   `estimator`, including `/admin` and `/inventory`, and enumerate every
   route-list difference caused by the two legacy aliases.
2. Stop treating `estimator` as `commercial` and `pm` as `sd_pm_pe` for
   authorization decisions. `owner` may continue to inherit `admin` because
   the checked-in policy and user contract explicitly define owner as the
   higher-ranked super-admin.
3. Preserve only route visibility supported by existing page, API, central
   capability, or read-projection evidence. Where a module has separate read
   and mutation authority, route visibility may remain while server mutation
   controls continue to enforce the narrower capability.
4. Navigation and `canViewPath` must use the same explicit role policy. A role
   must not see a link that the same guard rejects. Do not broaden viewer,
   Finance, Admin, KYC, or system-configuration visibility.
5. Add table-driven regression coverage for all thirteen persisted roles,
   including owner inheritance, the distinct estimator/commercial and
   pm/sd_pm_pe cases, nested-route inheritance, and the two reproduced false
   positives.
6. Preserve existing dashboard mode, quick-link ordering, profile-menu admin
   visibility, and Cortex owner/admin controls. Add focused regression tests
   where removing the aliases could otherwise change those consumers.
7. Pass focused navigation/consumer tests, complete Web and E2E TypeScript,
   Web lint, production build, gitleaks, and independent authorization review.

## Explicit limits

- Do not change `packages/shared-types/src/authorization.ts`, universal-search
  grants, role enums, schemas, migrations, seeds, RLS, or runtime accounts.
- Do not combine the separate unknown-path deny-by-default or opportunity CSV
  export findings into this slice.
- Browser verification cannot exercise `estimator` or `pm` until identities
  exist. After independent QA, verify the eleven supplied roles for navigation
  regressions without mutating ERP data.

## Sequential ownership

1. Principal Agent 3 is the sole source editor in Agent 03 scope for the Web
   route/navigation projection and its focused tests.
2. Principal Agent 4 independently reviews least privilege, all-role policy
   parity, alias removal side effects, regression coverage, and build gates.
3. Principal Agent 5 performs read-only browser regression checks for the
   eleven supplied identities only after QA is green; affected legacy-role
   browser coverage remains explicitly blocked without accounts.

This branch is stacked on PR #17. No production deployment, role mutation, or
account provisioning is authorized.
