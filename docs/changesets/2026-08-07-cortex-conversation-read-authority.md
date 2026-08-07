# M3.159 Cortex conversation read authority

## Outcome

- Added strict saved-conversation list/detail API contracts.
- Added NestJS list/detail endpoints with tenant, owner, capability, role,
  record-context, and current-citation enforcement.
- Added exact-tenant, closed-by-default Web/Core gates.
- Preserved Next response shapes and fail-closed selected-Core behavior.
- Changed no schema, chat mutation, provider behavior, or UI.

## Validation

- Shared 245/245; API 555/555; Web 646/646.
- Database 198 passed / 143 environment-gated skips; database source unchanged.
- Forced bounded root tests, workspace lint/typecheck, Nest build, and Next
  build with 82 static pages passed.
- Spend 4/4; release 5/5; Actionlint; pinned actions; Gitleaks 542 commits;
  clean-room runtime scan passed.

## Release boundary

All flags remain false and allowlists empty. No hosted provider access,
database mutation, cloud build, or deployment occurred. Exact-tenant parity,
managed backup/PITR, and protected browser canary remain required.
