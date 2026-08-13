# M3.118 — Won-to-Project authority seam

## Outcome

Won/closed-won project handoff now has an original NestJS command boundary with
tenant-scoped idempotency, atomic checklist/notification/audit side effects,
and a compatibility-default Web adapter.

## Changed

- Added strict shared command/result schemas and API controller/pipe/service.
- Added `opportunity_project_conversion_requests` with forced RLS, service-role
  access, composite tenant foreign keys, and replay/conflict checks.
- Added the `opportunity.convert` capability and fail-closed API/Web flags.
- Kept legacy conversion as the default; a selected Core failure never falls
  back to a browser-owned write.
- Updated architecture, operations, and canary runbook notes.

## Safety

- All project, opportunity, checklist, notification, idempotency, and audit
  writes occur in one PostgreSQL transaction when the canary is enabled.
- No hosted Supabase/Storage, tenant data, Vercel, Railway, provider-setting,
  build, or deployment mutation occurred.

## Validation

- Focused shared/API/database/Web contracts pass.
- Serial Turbo tests, typecheck, TS-only lint, production build, Gitleaks,
  Actionlint, migration-file verification, spend guard, and controlled-release
  planner tests pass.
- Hosted controlled-release plan remains review-required for migration drift,
  duplicate Purchase Orders, and missing audit-recovery tenant input.
