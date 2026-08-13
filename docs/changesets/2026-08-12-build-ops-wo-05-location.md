# WO-05 BOM location dimension

## Status

PARTIALLY VERIFIED. The additive location model, parser, review queue, and
project-scoped rollup pass local PostgreSQL 17, type, static migration, and
browser checks. The hosted migration was not applied because the provider
migration ledger is divergent and the pending release is blocked by unresolved
duplicate PO numbers.

## Delivered

- Added additive `project_locations` and
  `bom_line_item_location_reviews` tables with tenant/project composite
  constraints, RLS, force-RLS, indexes, and audit triggers.
- Preserved `bom_line_items.description_original`; parsed approved leading
  room separators into project locations while keeping unparseable lines in a
  durable review queue.
- Added project-scoped location validation and a database trigger that rejects
  cross-project assignments.
- Added location review, creation, assignment, resolution, approval gating,
  and project-wide location rollup server actions.
- Added responsive review UI and BOM line location controls. Manual lines
  without a location now enter the same approval-blocking review path.
- Added migration/static/database verification and CI hooks for WO-05.

## Verification

- PASS `pnpm --filter @third-code-erp/shared-types typecheck`
- PASS `pnpm --filter @third-code-erp/database typecheck`
- PASS `pnpm --filter @third-code-erp/web typecheck`
- PASS `pnpm test:wo-05-migration`
- PASS `pnpm test` (shared 116, database 99 with root DB skips, API 44, web 321)
- PASS isolated PostgreSQL 17 lane: 59 migrations, schema sha256
  `9DFDAD24DA48FC69ECC99D03396EABEBACCB72EFC3F2E6FB974A13ADCFECB5CD`,
  236/236 database tests without skips, and 3 API database integration tests
- PASS WO-05 database verifier and manual parser, cross-project trigger, and
  rollup fixtures in the isolated lane
- PASS built-runtime Playwright public frontend E2E (desktop/tablet/mobile,
  metadata, health, interaction, console and page-error checks)
- PASS `pnpm ci:actionlint`

## Not run / blocked

- NOT RUN hosted migration. Remote Supabase remains at 55 applied migrations;
  its current `bom_line_items` schema does not contain the WO-04/WO-05 fields,
  and the new location tables are absent.
- FAILED authenticated hosted smoke on the BOM route because the remote schema
  is behind the local application. This is an expected release mismatch, not
  a green E2E result.
- NOT RUN production deployment or post-deployment smoke. No hosted database
  or production application mutation was performed.
