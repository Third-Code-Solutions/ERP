# Project handover readiness projection

## Outcome

- Added `GET /v1/projects/:projectId/handover-readiness` as a protected,
  tenant-scoped evidence projection.
- The turnover page now explains readiness from the existing turnover package,
  COC signature, punchlist, and occupancy-permit records.
- Missing evidence is explicit; the projection does not claim zone handover,
  bond refund, retention release, P&L close-out, or SAP completion.

## Verification

- Shared builder tests cover ready, partial, and unavailable evidence states.
- API controller/protected/service tests cover query validation, role boundary,
  tenant scope, and deleted-project rejection.
- Web card rendering and Core-client payload/canary tests are included.

## Deferred

Zone/package handover, O&M revision history, bond/retention release, and P&L
close-out require product/contract decisions that are not represented in the
current schema and remain separate follow-up work.
