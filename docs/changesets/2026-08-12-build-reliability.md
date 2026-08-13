# Build reliability and offline-safe frontend runtime

## Outcome

VERIFIED LOCALLY. Production compilation no longer depends on Google Fonts
network availability and static generation is deterministic on constrained
workers.

## Changes

- Removed `next/font/google` and Fontshare runtime stylesheet dependencies from
  the root layout.
- Added offline-safe system font stacks while preserving the existing font
  tokens and UI hierarchy.
- Set Next static-generation `cpus: 1` to prevent the observed Windows worker
  exit during page-data collection.

## Verification

- PASS — clean `pnpm build`: API webpack compiled; Next generated 77/77 routes.
- PASS — build completed with Google Fonts unavailable; no font fetch retries.
- PASS — built-server public E2E: 1/1 across desktop, tablet, and mobile.
- PASS — built-server unauthenticated auth-boundary E2E: 4/4.
- PASS — `pnpm lint`.
- PASS — `pnpm typecheck`.
- PASS — `pnpm test`: 482 passed; 137 database tests skipped because no
  `DATABASE_URL` was supplied to the test command.
- PASS — `pnpm ci:actionlint`.
