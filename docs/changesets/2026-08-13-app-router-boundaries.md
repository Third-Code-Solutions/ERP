# App Router boundary coverage

## Scope

Added a source-level route contract that recognizes ancestor boundaries at the
page, route-group, or app-root segment. This keeps loading/error coverage
explicit without duplicating identical files across 111 pages.

## Changes

- Added `scripts/verify-app-router-boundaries.mjs`.
- Added unit coverage for the current tree and a missing-boundary fixture.
- Wired verification into root scripts and both CI workflows.

## Acceptance

- Every current page is covered by an ancestor `loading.tsx` boundary.
- Every current page is covered by an ancestor `error.tsx` boundary.
- Missing coverage fails with route-relative diagnostics.
- `pnpm test:app-router-boundaries`: 2/2 PASS.
- `pnpm verify:app-router-boundaries`: 111 pages PASS.
- `pnpm ci:actionlint`: PASS after both workflow updates.
