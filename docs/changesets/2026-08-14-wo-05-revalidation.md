# WO-05 location dimension revalidation

## Status

PARTIALLY VERIFIED. The local M-02 migration, parser boundary, location review
queue, project-scoped assignment guard, and static gates pass. Staging/hosted
replay and authenticated browser verification remain unavailable.

## Work completed

- Restored the root `test:wo-05-migration` and `verify:wo-05-database` commands.
- Added the WO-05 static migration gate to the CI unit-test job.
- Revalidated additive `project_locations` and location-review tables with
  tenant/project composite constraints, RLS, force-RLS, indexes, and audit
  triggers.
- Preserved `description_original`, parsed only approved room-prefix forms,
  normalized the item description only when a location is resolved, and queued
  unparseable descriptions for human review.
- Revalidated the project-scoped location trigger and the cross-location rollup
  path without changing `bom_line_items.id` or downstream foreign keys.

## Verification

- PASS — `pnpm test:wo-05-migration` (1/1).
- PASS — `node scripts/verify-wo-05-migration.mjs`.
- PASS — `node --check scripts/verify-wo-05-database.mjs`.
- PASS — `node scripts/verify-build-ops-invariants.mjs`.
- PASS — `git diff --check`.
- BLOCKED — `pnpm verify:wo-05-database`, staging replay, authenticated
  location-picker browser E2E, and the project-wide Vinyl Plank rollup against
  real data; Docker/Supabase and an approved staging target are unavailable.

## Safety

No hosted migration, production data mutation, destructive SQL, or downstream
foreign-key rewrite was performed.
