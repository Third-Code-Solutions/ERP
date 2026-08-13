# Production surface gate

Date: 2026-08-13

## Changed

- Added read-only `scripts/verify-production-surface.mjs` for health,
  readiness, manifest, landing-brand, and release-identity verification.
- Added deterministic pass/fail unit coverage for coherent and stale release
  surfaces.
- Added package commands for running the contract without deployment access.

## Verification

- PASS: production-surface contract tests, 2/2.
- FAIL: current public alias `https://thirdcode-erp.vercel.app` does not meet
  contract. Observed health service `third-code-erp-web`, landing legacy copy,
  and manifest `ABI OS`; `/api/ready` reports database up.
- NOT RUN: deployment or rollback. Provider billing and explicit deployment
  approval remain required; no provider state changed.
