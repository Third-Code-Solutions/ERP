# RFQ bid-leveling handoff

## Scope completed

- Added shared bid-leveling result contract and deterministic comparison
  helper.
- Added protected `GET /v1/procurement/rfqs/:rfqId/bid-leveling` with tenant,
  project, and role checks.
- Added Core Web client, exact-tenant canary, existing-page fallback, summary
  component, and response/role tests.

## Verification

- Shared bid-leveling and authorization tests: PASS.
- API service/controller tests: PASS.
- API typecheck and lint: PASS.
- Web Core/component tests: PASS.
- Web lint: PASS.
- Web typecheck: BLOCKED by stale generated `.next/types` imports; one source
  shape error found during the run was fixed, then only generated imports
  remained.
- Hosted DB/RLS and live browser E2E: NOT RUN; no configured demo environment.

## Next slice

→ Continue with labour reconciliation / GR-to-actual-cost traceability or
handover close-out, preserving the PRD blockers for real templates, SAP module
details, retention terms, and delegated-approval policy.
