-- =============================================================================
-- BuildOps harden-loop migration (2026-05-10)
-- 1. po_line_items RLS (was missing — CRITICAL tenant-leak risk)
-- 2. invoices unique constraint on (tenant_id, invoice_number) for atomic
--    BIR-compliant numbering via retry-on-conflict
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. po_line_items — accessed via po.tenant_id join (mirrors bom_line_items)
-- -----------------------------------------------------------------------------
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_line_items_tenant_read" ON po_line_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = po_line_items.po_id
        AND purchase_orders.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "po_line_items_tenant_insert" ON po_line_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = po_line_items.po_id
        AND purchase_orders.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "po_line_items_tenant_update" ON po_line_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = po_line_items.po_id
        AND purchase_orders.tenant_id = auth_tenant_id()
    )
  );

CREATE POLICY "po_line_items_tenant_delete" ON po_line_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE purchase_orders.id = po_line_items.po_id
        AND purchase_orders.tenant_id = auth_tenant_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 2. invoices — enforce continuous BIR-compliant numbering atomically
-- The application code uses retry-on-conflict to allocate the next sequence
-- without relying on read-then-write. Without this constraint, two concurrent
-- writes could allocate the same number.
-- -----------------------------------------------------------------------------
ALTER TABLE invoices
  ADD CONSTRAINT invoices_tenant_invoice_number_unique
  UNIQUE (tenant_id, invoice_number);
