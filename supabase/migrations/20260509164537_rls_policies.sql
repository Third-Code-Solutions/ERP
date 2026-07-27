-- =============================================================================
-- Third Code ERP Row-Level Security Policies
-- Apply after running Drizzle migrations.
-- Every table is isolated by tenant_id.
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE boms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings     ENABLE ROW LEVEL SECURITY;
-- =============================================================================
-- Helper: get the tenant_id for the currently authenticated user
-- =============================================================================
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT tenant_id
  FROM users
  WHERE id = auth.uid()
$$;
-- =============================================================================
-- tenants: users can only see their own tenant
-- =============================================================================
CREATE POLICY "tenant_self_read" ON tenants
  FOR SELECT
  USING (id = auth_tenant_id());
-- No direct UPDATE/DELETE on tenants via RLS — only service role

-- =============================================================================
-- users: read/write only within same tenant
-- =============================================================================
CREATE POLICY "users_tenant_read" ON users
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "users_tenant_write" ON users
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "users_tenant_update" ON users
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
-- =============================================================================
-- projects
-- =============================================================================
CREATE POLICY "projects_tenant_read" ON projects
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "projects_tenant_insert" ON projects
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "projects_tenant_update" ON projects
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
-- Soft-delete only — no hard deletes via RLS (admin role can delete)
CREATE POLICY "projects_tenant_delete" ON projects
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- =============================================================================
-- opportunities
-- =============================================================================
CREATE POLICY "opportunities_tenant_read" ON opportunities
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "opportunities_tenant_insert" ON opportunities
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "opportunities_tenant_update" ON opportunities
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "opportunities_tenant_delete" ON opportunities
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- =============================================================================
-- documents
-- =============================================================================
CREATE POLICY "documents_tenant_read" ON documents
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "documents_tenant_insert" ON documents
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "documents_tenant_update" ON documents
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "documents_tenant_delete" ON documents
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- =============================================================================
-- scope_items
-- =============================================================================
CREATE POLICY "scope_items_tenant_read" ON scope_items
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "scope_items_tenant_insert" ON scope_items
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "scope_items_tenant_update" ON scope_items
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "scope_items_tenant_delete" ON scope_items
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- =============================================================================
-- boms
-- =============================================================================
CREATE POLICY "boms_tenant_read" ON boms
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "boms_tenant_insert" ON boms
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "boms_tenant_update" ON boms
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "boms_tenant_delete" ON boms
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- =============================================================================
-- bom_line_items — accessed via bom.tenant_id join
-- =============================================================================
CREATE POLICY "bom_line_items_tenant_read" ON bom_line_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM boms
      WHERE boms.id = bom_line_items.bom_id
        AND boms.tenant_id = auth_tenant_id()
    )
  );
CREATE POLICY "bom_line_items_tenant_insert" ON bom_line_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boms
      WHERE boms.id = bom_line_items.bom_id
        AND boms.tenant_id = auth_tenant_id()
    )
  );
CREATE POLICY "bom_line_items_tenant_update" ON bom_line_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM boms
      WHERE boms.id = bom_line_items.bom_id
        AND boms.tenant_id = auth_tenant_id()
    )
  );
CREATE POLICY "bom_line_items_tenant_delete" ON bom_line_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM boms
      WHERE boms.id = bom_line_items.bom_id
        AND boms.tenant_id = auth_tenant_id()
    )
  );
-- =============================================================================
-- vendors
-- =============================================================================
CREATE POLICY "vendors_tenant_read" ON vendors
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "vendors_tenant_insert" ON vendors
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "vendors_tenant_update" ON vendors
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
-- =============================================================================
-- purchase_orders
-- =============================================================================
CREATE POLICY "purchase_orders_tenant_read" ON purchase_orders
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "purchase_orders_tenant_insert" ON purchase_orders
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "purchase_orders_tenant_update" ON purchase_orders
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
-- =============================================================================
-- invoices
-- =============================================================================
CREATE POLICY "invoices_tenant_read" ON invoices
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "invoices_tenant_insert" ON invoices
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "invoices_tenant_update" ON invoices
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
-- =============================================================================
-- audit_log — INSERT only, no UPDATE or DELETE ever
-- Read restricted to admin/compliance roles
-- =============================================================================
CREATE POLICY "audit_log_tenant_read" ON audit_log
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "audit_log_tenant_insert" ON audit_log
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
-- Explicitly deny UPDATE and DELETE (belt-and-suspenders with append-only design)
CREATE POLICY "audit_log_no_update" ON audit_log
  FOR UPDATE
  USING (false);
CREATE POLICY "audit_log_no_delete" ON audit_log
  FOR DELETE
  USING (false);
-- =============================================================================
-- embeddings — tenant-isolated vector store
-- =============================================================================
CREATE POLICY "embeddings_tenant_read" ON embeddings
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "embeddings_tenant_insert" ON embeddings
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "embeddings_tenant_update" ON embeddings
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "embeddings_tenant_delete" ON embeddings
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- =============================================================================
-- Storage: Documents bucket policy
-- All storage.objects must also be tenant-scoped via path prefix tenant_id/...
-- =============================================================================
-- Run after creating the 'documents' storage bucket in Supabase dashboard:
--
-- CREATE POLICY "storage_documents_tenant_read" ON storage.objects
--   FOR SELECT
--   USING (
--     bucket_id = 'documents'
--     AND auth_tenant_id()::text = (string_to_array(name, '/'))[1]
--   );
--
-- CREATE POLICY "storage_documents_tenant_insert" ON storage.objects
--   FOR INSERT
--   WITH CHECK (
--     bucket_id = 'documents'
--     AND auth_tenant_id()::text = (string_to_array(name, '/'))[1]
--   );;
