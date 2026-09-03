# Project-detail authorization boundaries

Date: 2026-09-03

## Outcome

Fixed the P1 project-detail confidentiality defect. Project overview cards,
navigation, direct routes, and supporting queries now apply the existing
project, BOM, purchase-order, budget, finance, delivery, audit, and admin-user
read policies independently. A denied domain issues no sensitive query and
renders no placeholder or derived value that could reveal that domain.

Denied Cost, Budget, Billing, Audit, Access, BOM, and Togal deep links fail
closed through the same workspace-record not-found boundary before protected
data access. No shared role grant or mutation capability was broadened.

## Implementation

- Added a typed project-detail access projection derived directly from the
  checked-in capability and universal-search registries, with all thirteen
  roles covered by regression tests.
- Filtered project tabs and command-center actions by their domain policy.
- Short-circuited overview BOM, PO, invoice, and delivery reads independently;
  multi-domain commercial metrics require every underlying grant.
- Applied fail-closed direct-route guards before database access for BOM/Togal,
  Cost/Budget, Billing, Audit, and Access.
- Prevented Finance and Viewer routes from loading or rendering unauthorized
  BOM- or PO-derived details in Cost, Budget, Billing, and Audit views.
- Preserved tenant/project predicates on every allowed query and retained the
  existing action capabilities for all mutations.
- Hardened budget persistence with tenant/draft/BOM ownership validation,
  transaction-local write context, row locking, stable line identifiers,
  collision-safe updates, exact affected-row checks, and audit/revalidation
  only after a successful transaction.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused Web tests | PASSED | 16 files, 108 tests |
| All-role policy projection | PASSED | 13/13 roles |
| Direct-route denial tests | PASSED | 6/6; zero DB calls on denial |
| Web and E2E TypeScript | PASSED | Complete type checks under Node 22.23.2 |
| Web source lint | PASSED | Full source lint |
| Production build | PASSED | Next.js 15.5.23; 89/89 static pages |
| Independent QA | PASSED | `GO`; no in-scope P1/P2 finding |
| Full browser role matrix | PASSED | 11/11 supplied identities; 66/66 direct-route assertions |
| Final denied-route browser check | PASSED | 32/32; not-found state and zero console/page/request errors |
| `estimator` and `pm` browser coverage | BLOCKED | No supplied or seeded identity |
| Database-backed budget trigger execution | BLOCKED | Database integration binding unavailable in the local QA lane; compiled ordering/failure tests pass |
| Deployment/live production smoke | NOT RUN | ADR-020 requires reviewed `main` and green protected gates |

## Release status

Implementation is available in stacked PR
[#17](https://github.com/Third-Code-Solutions/ERP/pull/17). The workflow remains
`PARTIAL` under the strict live definition of done because of the two explicit
blocked checks above. Production was not changed.
