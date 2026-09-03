# Opportunity CSV export hardening

## Outcome

Opportunity CSV export now has an explicit function-level role boundary,
tenant-safe query joins, validated Manila-day filters, deterministic bounded
output, and formula-safe spreadsheet serialization. The built app preserves all
ten currently visible executive-dashboard export flows and denies Safety, CX,
and Viewer before database access.

## Changed areas

- `packages/shared-types/src/authorization.ts`
  - adds the exact ten-role `opportunity.export` capability.
- `packages/shared-types/src/__tests__/authorization.test.ts`
  - covers all thirteen role outcomes and the 81-capability registry.
- `apps/web/src/app/api/exports/opportunities-csv/route.ts`
  - enforces auth/capability before query, maps strict failures, applies the
    sentinel row policy, and returns hardened headers on every status.
- `apps/web/src/app/api/exports/opportunities-csv/opportunity-export.ts`
  - owns strict filters, Manila date boundaries, tenant-qualified query joins,
    canonical Account mapping, deterministic bounds, and CSV safety.
- `apps/web/src/app/api/exports/opportunities-csv/route.test.ts`
  - covers role denials, filters, bounds, response shape/headers, and generic
    failure mapping.
- `apps/web/src/app/api/exports/opportunities-csv/opportunity-export.test.ts`
  - covers compiled SQL, canonical/fallback mapping, date parsing, formula
    neutralization, and negative numeric preservation.
- `apps/web/src/lib/dashboard-queries.ts`
  - removes the obsolete unbounded export implementation.

No schema, dependency, account, fixture, opportunity data, dashboard UI/mode,
Reports policy, or deployment target changed.

## Verification

| Check | Result |
| --- | --- |
| Shared authorization tests | PASSED — 19/19 |
| Export route/query/CSV tests | PASSED — 44/44 |
| Independent focused rerun | PASSED — 61/61 |
| Independent security/RBAC review | PASSED — `GO`, no P1/P2 |
| Shared/Web/E2E TypeScript | PASSED |
| Affected source ESLint | PASSED |
| Web production build | PASSED — 89/89 pages |
| Gitleaks | PASSED — 1,753 commits, no leaks |
| Diff and legacy-helper checks | PASSED |
| Built-app Sales/Commercial allowed matrix | PASSED — 200 CSV, five rows each |
| Built-app Viewer/Safety denied matrix | PASSED — hidden control and hardened 403 |
| Built-app filter matrix | PASSED — five invalid 400 cases; same-day 200 |

## Release status

Implemented locally on the branch stacked above PR #21. No deployment or data
mutation was performed. Strict status remains `PARTIAL` until the reviewed
stack reaches an authorized deployed environment. ADR-020 requires `main` and
green release gates on that exact SHA before production release.
