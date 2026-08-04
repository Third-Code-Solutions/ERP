# M3.42 — Project Command Center

Date: 2026-08-04
Source commit: `a225340`

## Outcome

The authenticated project overview now starts with a calm, read-only command
center: pending/overdue work, project evidence, commercial decisions,
punchlist, active deliveries, latest progress, and an explicit next move.
Every signal points back to an existing project route or Cortex context.

## Scope

- Added `getProjectCommandCenter` with repeated tenant/project predicates.
- Added responsive command-center presentation and empty-state behavior.
- Contained the project tab strip and fixed fixed-width overview grids at
  narrow breakpoints.
- Added a measured component spec and server-rendered tests.
- Converted the progress date boundary and SQL time cutoff to safe ISO
  strings after browser verification exposed Date encoding in the dev server.

## Evidence

- Focused tests: 4/4.
- Workspace tests: Web 63 files / 442; API 294; shared 162; database 166
  executed with integration environment skips.
- `pnpm lint`, `pnpm typecheck`, `git diff --check`: pass.
- Next production build: 78/78 routes.
- Authenticated browser MCP: 390px and 1440px, four signal cards, no
  horizontal overflow, no console errors after a clean cache-disabled reload.

## Release boundary

No Supabase migration or hosted data, Storage object, Railway variable or
deployment, or Vercel build/promotion changed. Supabase remains the
read-only 55-row prefix; Vercel Git remains disconnected and spend-protected.
