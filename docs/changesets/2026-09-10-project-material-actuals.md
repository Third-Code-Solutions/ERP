# Project material actuals projection

## Outcome

- Added a tenant-scoped Core read at `GET /v1/projects/:projectId/material-actuals`.
- The projection joins posted project-linked goods receipts to posted project
  consumption movements by material item.
- Receipt value, issue value, quantity, and balance signals remain explicit;
  the projection does not add inventory value to posted supplier-bill actual
  cost and does not claim an SAP posting.
- Added the project cost-view card with an exact-tenant Core canary and a
  validated server/database fallback.

## Verification

- Shared pure projection tests cover ready, partial/over-issued, and empty
  evidence states.
- API controller boundary, protected role, and service tests cover tenant and
  capability enforcement.
- Web Core-client and card tests validate payloads, canary behavior, and
  receipt/issue separation.

## Deferred

- SAP integration remains blocked until an approved external contract, field
  mapping, credentials, retry/idempotency policy, and reconciliation owner are
  supplied.
