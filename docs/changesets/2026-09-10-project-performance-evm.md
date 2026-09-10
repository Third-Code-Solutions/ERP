# Project performance EVM/CVR

## Added

- `GET /v1/projects/:projectId/performance` Core read contract with tenant and
  capability protection.
- Pure, schema-validated integer-centavo EVM/CVR calculations for approved
  budget, time-phased schedule value, submitted progress, and posted supplier
  bills.
- Project cost-page performance card showing BAC/PV/EV/AC, CPI/SPI, EAC, VAC,
  evidence status, and missing-source warnings.
- Shared/API/Web focused tests and an opt-in all-role Playwright matrix.

## Verification

- Shared performance tests: PASS (2 tests).
- Core performance service/controller/protected tests: PASS (6 tests).
- Web performance client/card tests: PASS (4 tests).
- API TypeScript check: PASS.
- API lint: PASS.
- Web lint: PASS.
- Web TypeScript check: BLOCKED by pre-existing generated `.next/types`
  imports for unrelated routes; no new source error remained after fixing the
  focused test type.
- Live Supabase/RLS, hosted Core, and browser matrix: NOT RUN (no configured
  demo tenant/auth environment).
