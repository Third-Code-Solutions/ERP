# M3.132 asset maintenance due projection

## Change

- Added strict shared query/result contracts for bounded maintenance due work.
- Added tenant-scoped NestJS `GET /v1/assets/maintenance/due` with latest-
  record-first SQL, pagination, and explicit overdue/due-soon state.
- Added Core client coverage and a non-blocking Asset Register service-watch
  panel.
- Added HTTP/unit/database integration coverage and kept the existing
  maintenance-read rollout gate closed.

## Evidence

- Self-hosted PostgreSQL 17.10/Redis 7.4.9 migration replay and asset
  maintenance integration: pass.
- Serial package tests: shared 27/228; database 47/51 files with 141
  compatibility skips; API 112/477; Web 89/581.
- Production build: 81/81 routes. Typecheck, lint, migration verifier,
  Actionlint, Gitleaks, controlled-release, and provider-spend guards: pass.
- Parallel Turbo tests remain a Windows cross-package timeout issue; serial
  package execution is the retained evidence.

No hosted Supabase, Vercel, Railway, feature-flag, or tenant-data mutation.
