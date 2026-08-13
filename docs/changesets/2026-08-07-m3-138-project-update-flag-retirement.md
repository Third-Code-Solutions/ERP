# M3.138 - Retire Project update flag surface

Date: 2026-08-07
Source/ops commit: `a978b4f`
Provider state: unchanged

## Change

- delete the unused `projectWritesUseCoreApi` selector and branch tests;
- remove Project update flag/allowlist entries from env examples;
- replace the flag-driven cutover runbook with Core-only validation;
- update database-release and self-hosted-CI rollback guidance.

## Validation

- Core client tests: 115/115;
- Web Project action tests: 5/5;
- serial workspace tests: shared 27/229, database 47/51 files with 141
  compatibility skips, API 112/480, Web 89/583;
- production build: Next 81/81 routes and Nest compile;
- typecheck, lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, provider-spend 4/4.

## Boundary

No hosted environment, Supabase SQL/data, Vercel deployment, Railway
deployment, feature flag, or tenant record changed. Historical docs may retain
the retired flag name as migration evidence; current runtime and operator
runbooks do not use it. Protected Core canary and hosted parity gates remain
required.
