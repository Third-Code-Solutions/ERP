# Vendor performance projection handoff

## Scope completed

- Added the shared vendor-performance contract and deterministic signal
  derivation.
- Added protected `GET /v1/procurement/vendors/performance` with tenant,
  project, membership, and capability checks.
- Added the Web register, Core read canary, compatibility fallback, route
  loading state, and allowed/denied role-matrix E2E.

## Verification

- Shared contract and authorization tests: PASS.
- API service/controller tests: PASS.
- API typecheck and lint: PASS.
- Web Core-client/component tests: PASS.
- Web lint: PASS.
- Full Web typecheck: BLOCKED by pre-existing stale `.next/types` imports;
  no source-level errors were reported after the projection fixture fix.
- Hosted DB/RLS and live browser E2E: NOT RUN; no configured demo environment.

## Next slice

→ Continue with the remaining approved post-MVP work (tender/bid-leveling,
  labour reconciliation, SAP/GR reconciliation, or handover close-out), while
  keeping real ABI templates, SAP module details, and DoA policy behind their
  explicit PRD blockers.
