# M3.140 - Core-only Project creation

## Scope

Remove the Web Project-create direct database fallback and make NestJS the
only official Project creation writer.

## Changes

- `/projects/new` requires `project.create` and calls the typed Core POST
  boundary for every creation.
- The action preserves a supplied idempotency key or generates one, verifies
  the returned tenant, and fails closed on Core failure or invalid scope.
- Removed the frontend `ERP_PROJECT_CREATE_WRITES_VIA_API` selector and
  allowlist from source/env examples.
- Added focused regressions for Core routing, replay-key preservation, Core
  failure, tenant mismatch, and capability denial.

## Safety boundary

The API-side `ERP_PROJECT_CREATE_WRITES_ENABLED` plus tenant allowlist remains
closed by default. This source milestone does not apply hosted SQL, change
Supabase data, build Vercel, redeploy Railway, or enable an ERP canary.

## Validation

Focused Web Project-create action: 5/5. Core client suite: 114/114. Full
workspace: shared 27/229; database 47/51 files with 183 passed/141 skipped;
API 112/480; Web 90/587. Production build generated 81/81 routes.
Typecheck/lint, migration verifier, Actionlint, Gitleaks, controlled-release
5/5, and provider-spend 4/4 passed. The database skips require
`DATABASE_URL`; the prior disposable replay covers no-skip database/API
integration evidence. Hosted providers and ERP canaries remain closed.

Source checkpoint: `c702bd9edec41cb3a9efd8b490ae5e82a3a04ceb`, pushed to the
reviewed remote branch with a clean worktree.
