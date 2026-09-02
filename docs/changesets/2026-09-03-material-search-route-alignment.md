# Material search route alignment

## Outcome

Universal search no longer returns Material links to roles that cannot open the
only Material result destination. Owner, Admin, and Commercial retain Material
search; Estimator, PM, Service Delivery, and Procurement retain every other
existing search grant but skip Material before database retrieval.

## Changed areas

- `packages/shared-types/src/erp-api/universal-search.ts`
  - evaluates Material against exact persisted roles while preserving legacy
    aliases for all non-Material entities.
- `packages/shared-types/src/erp-api/universal-search.test.ts`
  - covers the exact thirteen-role Material matrix.
- `apps/web/src/app/api/search/route.test.ts`
  - proves denied roles never query `material_items`, Commercial keeps the
    existing destination, and the positive query is tenant-scoped in compiled
    SQL with the authenticated tenant parameter.
- `apps/api/src/search/universal-search.service.ts`
  - removes Material from denied roles' universal-search graph scope before
    database retrieval.
- `apps/api/src/search/universal-search.service.spec.ts`
  - covers all four denied roles and a positive Commercial Material result.

No global Cortex policy, non-Material grant, route, navigation, page capability,
schema, dependency, account, provider, or ERP record changed.

## Verification

| Check | Result |
| --- | --- |
| Shared focused tests | PASSED — 17/17 |
| Web route tests | PASSED — 19/19 |
| Core service tests | PASSED — 8/8 |
| Independent downstream tests | PASSED — Web 73/73; Core 12/12 |
| Independent role/type/destination oracle | PASSED — 234/234; zero dead ends |
| Shared/API/Web/E2E TypeScript | PASSED |
| Affected source ESLint | PASSED |
| API production build | PASSED |
| Web production build | PASSED — 89/89 pages |
| Gitleaks | PASSED — 1,750 commits, no leaks |
| Diff/whitespace checks | PASSED |
| Live Procurement/Service Delivery negative search | PASSED |
| Live Commercial positive Material hit | BLOCKED — configured tenant has zero Material records |

## Release status

Implemented locally on the branch stacked above PR #20. No deployment or
account/data mutation was performed. The source slice passed independent QA,
but strict live status remains `PARTIAL` until a read-only environment contains
a Material record for the Commercial-positive comparison. ADR-020 still
requires the reviewed stack on `main` with green gates on that exact SHA before
production release.
