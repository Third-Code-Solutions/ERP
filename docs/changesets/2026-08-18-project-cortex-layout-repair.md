# Project detail and Cortex layout repair — 2026-08-18

## Status

**PARTIALLY VERIFIED.** The supplied project-detail UI is repaired and has
local authenticated desktop and mobile browser evidence. This change has not
been pushed or deployed.

## Changes

- Repaired the project-context rail that placed a three-column relationship
  card inside each column of a two-column grid. The compact project variant is
  now one readable card per row in a bounded 288–320px supporting rail.
- Kept the Cortex graph and evidence capability intact while reducing the
  project-detail context pack to the first four connections and sources.
  Focused graph links expose the complete set rather than hiding it.
- Moved excess summary text behind a native, keyboard-accessible details
  control and added visible focus states for the new graph links.
- Made long project names wrap safely on narrow screens instead of clipping
  with an ellipsis.
- Added a read-only authenticated Playwright regression covering desktop and
  mobile geometry, title clipping, card overflow, inter-card label collision,
  unexpected same-origin failures, and browser/page errors.

## Verification

- PASS — targeted Vitest suite: 9 tests across Cortex route context,
  relationship-list, and project-command-center behavior.
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — `pnpm --filter @third-code-erp/web lint`.
- PASS — `pnpm --filter @third-code-erp/web build` (Next.js 15.5.23).
- PASS — local authenticated Chromium check against the exact project record
  in the supplied screenshot at 1440px and 390px. It found no horizontal
  page/card overflow, no cross-card label collision, no clipped project title,
  and no unexpected console, page, or same-origin request failures.
- PASS — inspected the resulting desktop and mobile screenshots.
- NOT RUN — hosted deployment and hosted-browser verification; neither was
  authorized by this UI repair.
- FAILED — repository-wide `git diff --check` remains red on pre-existing
  unrelated whitespace diagnostics. This changeset's scoped diff is clean.

## Environment and release boundary

The local checks ran under Node 24.16.0 although the package declares Node
22.x; pnpm emitted an engine warning. No commit, push, deployment, migration,
provider change, or hosted business-data mutation occurred.
