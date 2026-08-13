# Release source identity gate

## Outcome

PARTIALLY VERIFIED. Added a read-only gate that prevents a dirty local
workspace or provider-linked source divergence from being treated as one
release.

## Changes

- Added `scripts/lib/release-source.mjs` and its tests.
- Added `scripts/verify-release-source.mjs` and
  `pnpm verify:release-source`.
- Updated the database release runbook to require source identity before
  migration promotion.

## Verification

- PASS — clean exact source matches are accepted by the unit test.
- PASS — dirty worktrees, commit mismatch, and migration-set drift are rejected
  by the unit test.
- BLOCKED — the current workspace is dirty, local `HEAD` differs from
  `origin/main`, and local/provider migration sets are 55/124.
- NOT RUN — fetch, merge, commit, push, migration application, or data repair.
