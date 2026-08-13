# WO-06 DUPA engine foundation

## Status

BLOCKED for canonical sign-off. The exact rational engine and D-2 boundary are
implemented locally and the additive M-03/M-04 database foundation passes the
isolated PostgreSQL lane, but the PRD's canonical worked example is internally
inconsistent with its listed centavo inputs. No WO-06 UI or hosted migration
was applied.

## Delivered

- Added a bigint/rational DUPA cascade for material, labour, equipment, direct,
  indirect, configurable VAT base, total, and unit rate.
- Kept intermediate arithmetic unrounded and applies half-up rounding only to
  persisted/presented centavos.
- Added a BOQ boundary that accepts only persisted DUPA H as the unit rate and
  rejects G-sourced values.
- Added validation for positive header quantity/productivity and bounded basis
  points.
- Added Drizzle schema coverage for DUPA headers/lines and rate libraries:
  material catalog, crew roles, equipment catalog, assemblies, templates, and
  price history.
- Added additive migration `20260812180000_wo_06_dupa_engine.sql` with
  tenant-composite foreign keys, forced RLS, explicit Supabase grants, audit
  triggers, classified-work identity guard, database-side recomputation, H
  synchronization, and trigger-owned computed totals.
- Added static migration, read-only database, and transactional behavior gates.

## Verification

- PASS `pnpm --filter @third-code-erp/shared-types test -- src/bom/__tests__/dupa.test.ts` (5 tests)
- PASS `pnpm --filter @third-code-erp/shared-types typecheck`
- PASS `pnpm test:wo-06-migration`
- PASS isolated PostgreSQL 17/Redis 7.4.9 lane: 60 migrations, 236/236
  database tests with no skips, 3 API database integration tests, and WO-04,
  WO-05, and WO-06 database gates.
- PASS `pnpm verify:wo-06-database-behavior` against the isolated database:
  cascade math, H-to-BOQ sync, crew-rate refresh, VAT-base switch, audit
  emission, and unclassified-work rejection.
- PASS authenticated column-grant check: computed DUPA totals are not writable
  by the browser role.

## Blocker

The PDF-listed rates produce `G=1,621,751` and `H=16,217,506` under exact
rational arithmetic, while the PRD mandates `G=1,621,750` and
`H=16,217,500`. See
`docs/blockers/2026-08-12-wo-06-canonical-math-contradiction.md` for the
calculation and required ABI decision. Do not add a rounding exception.

## Release boundary

The hosted Supabase project remains unchanged. Provider/source migration
reconciliation and the duplicate `PO-0002` decision remain open blockers;
therefore this migration is not authorized for hosted application.
