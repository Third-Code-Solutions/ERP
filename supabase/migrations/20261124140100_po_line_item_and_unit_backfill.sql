-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- S1 backfill: link Purchase Order lines written before the
-- link_po_line_item_and_unit insert trigger (20261124140000) existed. Data
-- only; this file creates, alters and drops nothing.
--
-- One UPDATE of po_line_items:
--   * material_item_id = coalesce(material_item_id, the same-tenant
--     material_items row with exactly the line code);
--   * uom_id = coalesce(uom_id, resolve_unit_of_measure(tenant_id, unit)).
-- It fills only NULLs, never crosses tenants, and touches only lines where at
-- least one value changes, so a re-run updates nothing. Lines on a deactivated
-- Cost Code are skipped: guard_po_line_budget_dimension would refuse to touch
-- them. It aborts with no change if a line it touches already has a Stock
-- Receipt (guard_po_line_stock_fields) or has no Purchase Order in its tenant
-- (guard_po_line_budget_dimension).
--
-- Locks: ROW EXCLUSIVE on po_line_items plus a row lock on each updated line,
-- so reads and inserts of new lines (linked by the trigger) are not blocked.
-- Each updated line fires guard_po_line_budget_dimension,
-- guard_po_line_stock_fields and audit_po_line_items; the audit trigger takes
-- that tenant's audit advisory lock (pg_advisory_xact_lock in
-- audit_log_trigger, 20260812155000) after the row lock and holds it until
-- commit. reset_stock_receipt_projection fires once for the statement.
-- Lock order: app transactions take a line's row lock and the tenant audit lock
-- in either order (the audit trigger after a line write, or an app audit row
-- before it), so no single order here matches every caller. A conflict that
-- waits longer than lock_timeout, or a deadlock, aborts this one transaction
-- with no change. Re-run it: the UPDATE is idempotent.
--
-- Rollback: the backfill is not reverted, because its links are valid ones the
-- receipt guard accepts. To undo it, set material_item_id and uom_id back to
-- NULL only for the line ids and columns saved before the release (a line
-- received since is frozen by guard_po_line_stock_fields). Then:
--   begin;
--   set local lock_timeout = '5s';
--   set local statement_timeout = '60s';
--   delete from supabase_migrations.schema_migrations where version = '20261124140100';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update public.po_line_items line
   set material_item_id = coalesce(
         line.material_item_id,
         (
           select item.id
           from public.material_items item
           where item.tenant_id = line.tenant_id
             and item.code = line.code
         )
       ),
       uom_id = coalesce(
         line.uom_id,
         public.resolve_unit_of_measure(line.tenant_id, line.unit)
       )
 where (
     (
       line.material_item_id is null
       and line.code is not null
       and exists (
         select 1
         from public.material_items item
         where item.tenant_id = line.tenant_id
           and item.code = line.code
       )
     )
     or (
       line.uom_id is null
       and line.unit is not null
       and public.resolve_unit_of_measure(line.tenant_id, line.unit) is not null
     )
   )
   and (
     line.cost_code_id is null
     or exists (
       select 1
       from public.cost_codes cost_code
       where cost_code.id = line.cost_code_id
         and cost_code.tenant_id = line.tenant_id
         and cost_code.is_active
     )
   );

commit;
