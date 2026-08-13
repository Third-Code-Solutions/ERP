# BOM rate-source hardening

Date: 2026-08-13

## Scope

- Removed the editable line-level `Markup %` field and table column from the
  BOM Builder.
- Manual BOM rows now use an explicit flat unit-cost calculation.
- DUPA and client BOQ rate sources are shown as source badges instead of being
  represented as an ad-hoc markup.
- Pricing-breakdown chips now use persisted rate source/provenance and expose
  DUPA, client BOQ, manual, and unresolved states accurately.
- Kept the legacy database column additive for migration compatibility; new
  manual rows write `markup_bps = 0`.

## Verification

- PASS — shared-types BOM calculation test: 33/33.
- PASS — web pricing-breakdown unit tests: 2/2.
- PASS — monorepo typecheck: 5/5 task packages.
- PASS — no `Markup`, `markup_bps`, or markup input references remain in the
  BOM Builder UI paths.

## WO-07 follow-up

- Added a division-grouped BOM view with named unassigned bucket, preserved
  source order, top-level division subtotals, and child-row indentation.
- Loaded persisted DUPA headers and material/labour/equipment children into
  the BOM view. Work-item unit rate and line total display the derived DUPA
  rate; detail is behind an accessible progressive-disclosure control.
- Replaced supplier description matching with the canonical
  `dupa_material_lines.catalog_item_id` -> `price_history` path. Unbound rows
  remain visibly unpriced and retain manual vendor assignment as fallback.
- PASS — focused BOM/API tests: 9/9.
- PASS — full web unit suite: 336/336, with 2 database-environment suites
  skipped as expected without `DATABASE_URL`.
- PASS — isolated web production build: 79 routes generated.
- PASS — installed-Chrome browser smoke against the production build: 8/8.
