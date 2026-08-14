# WO-08 revalidation — generic takeoff importer

Date: 2026-08-14

Status: PARTIALLY VERIFIED

## Source-backed changes

- Revalidated the generic CSV/XLSX importer as a producer-neutral flow with preview, saved per-source mapping, UOM/division/duplicate validation, unresolved-row reporting, and manual-entry availability.
- Added a blocking source gate for the additive takeoff migration. The gate requires tenant-scoped dimensions, `drawing_revision_id`, `(takeoff_import_id, source_row_key)` identity, unresolved review storage, RLS, audit triggers, and the AI no-price-before-DUPA guard.
- Replaced the migration's destructive-looking `DROP TRIGGER IF EXISTS` pattern with an idempotent catalog-checked trigger creation block.
- Added a source contract gate for I-10: re-import uses `ON CONFLICT` on the source-row identity, does not delete/reinsert BOM lines, does not overwrite `notes` vendor evidence, preserves DUPA-owned values, and binds imported lines to the drawing revision.

## Verification

- PASS — `pnpm test:wo-08-contract` (2/2 source gates).
- PASS — `node scripts/verify-wo-08-migration.mjs`.
- PASS — `node scripts/verify-wo-08-import-contract.mjs`.
- PASS — `node scripts/verify-build-ops-invariants.mjs`.
- PASS — JavaScript syntax checks for the new gates.
- PASS — `package.json` JSON parse.
- PASS — `git diff --check` (only line-ending normalization warnings).
- NOT RUN — Vitest parser/API/integration tests; the current checkout has no runnable Vitest binary because the frozen dependency install is incomplete.
- NOT RUN — PostgreSQL migration replay and I-10 runtime test; the Docker daemon/Supabase CLI are unavailable in this environment.
- NOT RUN — real historical ABI/Togal XLSX import; no source export was supplied and WO-09 remains blocked on the real templates.

## Remaining boundary

The implementation is source-verified only. Database behavior, browser behavior, vendor preservation against real rows, and a real mapped XLSX remain open until the repository has a working PostgreSQL/Supabase runtime and the ABI source exports are available. No migration was applied and no production or hosted data was changed.
