# Project labour reconciliation

## Outcome

- Added `GET /v1/projects/:projectId/labour-reconciliation` over the normalized
  schedule task spine.
- Planned and captured labour minutes are reconciled per task with explicit
  reported/not-due/missing evidence states.
- The schedule page now renders the reconciliation card through an exact
  tenant Core canary or a tenant-scoped database fallback.
- No labour cost, headcount estimate, or external payroll/SAP write is inferred.

## Verification

- Shared builder tests cover reported, missing, and not-due tasks.
- API controller, protected role, service, and tenant/deleted-project tests
  are included.
- Web Core-client and server-rendered card tests cover payload validation and
  evidence display.

## Deferred

Labour-rate/payroll reconciliation remains outside this slice until ABI
provides the approved labour-rate source and ownership.
