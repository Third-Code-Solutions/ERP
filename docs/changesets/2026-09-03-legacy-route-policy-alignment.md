# Legacy route-policy alignment

Date: 2026-09-03

## Outcome

Navigation and direct-route authorization now preserve all thirteen persisted
roles as distinct policy identities. Only the explicit owner-as-super-admin
contract inherits another role projection.

This removes the reproduced estimator false positives for `/inventory/**` and
`/admin/**` without changing central capability grants or removing supported
estimator/PM read routes.

## Change

- Preserve `estimator` and `pm` in `canonicalRole`; retain only
  `owner → admin` inheritance.
- List estimator and PM explicitly on their evidenced route projections.
- Use the same route table for sidebar visibility and nested direct-route
  decisions.
- Add all-role policy-oracle coverage plus dashboard quick-link, profile-menu,
  and Cortex regression tests.
- Reconcile the route matrix for the 15 fixed alias rows and the 13
  project-audit rows already superseded by the project-detail policy slice.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused policy and consumer tests | PASSED | 6 files, 90 tests |
| Web and E2E TypeScript | PASSED | All configured projects, no diagnostics |
| Web source lint | PASSED | No findings |
| Frozen dependency install | PASSED | Scripts disabled |
| Production build | PASSED | Next.js 15.5.23; 89/89 pages |
| Secret scan | PASSED | gitleaks; 1,744 commits, no leaks |
| Independent QA | PASSED | `GO`; zero P1/P2 findings |
| Supplied-account browser matrix | PASSED | 11/11 identities; Admin/Inventory navigation and direct routes matched |
| Browser page/HTTP errors | PASSED | 0 uncaught page errors; 0 observed HTTP responses at or above 400 |
| Estimator and PM browser checks | BLOCKED | No supplied or seeded identities |
| Production deployment | NOT RUN | Not authorized; ADR-020 still applies |

Local sign-out produced expected plain-HTTP production-CSP upgrade noise and
canceled Next.js prefetch requests, but every session signed out successfully.
No ERP write, password change, external provider request, or deployment ran.
