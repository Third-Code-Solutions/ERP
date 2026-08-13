# BUILD OPS PRD schema contradiction

## Status

BLOCKED for schema refactor planning. Read-only target catalog contradicts a
locked v1.3 PRD fact; no schema mutation performed.

## Evidence

The attached PRD says `scope_items` does not exist and that
`bom_line_items.id` is the scope spine. The configured Supabase target
currently contains both `public.scope_items` and `public.bom_line_items`.

- `public.scope_items`: 12 columns, including `project_id`, `description`,
  `quantity`, `unit_cost_cents`, and `line_total_cents`.
- `public.bom_line_items`: 17 columns, including `bom_id`, `parent_id`,
  `description`, and integer-centavo pricing.
- Cost, PO, project-budget, and RFQ foreign keys point to
  `bom_line_items(tenant_id, id)`.
- `scope_items` still has direct project/tenant foreign keys.

Repository code and historical migrations still reference `scope_items`,
including CAD persistence, Cortex records, schema, RLS, and integration tests.

## Required decision before WO-04 or any scope migration

1. Confirm whether target is stale legacy state or whether the v1.3 assertion
   is incorrect for this project.
2. Preserve `bom_line_items` downstream references; no FK re-pointing or
   destructive removal is permitted.
3. Define additive coexistence/backfill strategy on staging, with exact row
   counts and rollback/recovery evidence.

No `scope_items` table or `scope_item_id` column was created by this work.
