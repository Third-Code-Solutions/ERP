-- =============================================================================
-- Third Code ERP Phase 1-4 polish migration (2026-05-10)
--
-- 1. project_comments table — PRD F1.2 ("Comments, activity feed, @mentions")
-- 2. opportunities.lost_reason — captures why a deal closed lost (PRD F1.3
--    implied via stage transition log; this stores the reason explicitly)
-- 3. po_line_items.received_qty / received_at / received_by — partial
--    receipts at the line level (PRD F3.1 delivery tracking)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. project_comments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_id    UUID REFERENCES project_comments(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  -- mentioned user ids — populated by application from `@email` patterns.
  -- Stored as a UUID array so we can index/filter on it later if we surface
  -- a "mentions me" inbox.
  mentions     UUID[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_comments_tenant_id
  ON project_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_project_created
  ON project_comments(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_comments_author
  ON project_comments(author_id);
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_comments_tenant_read" ON project_comments
  FOR SELECT
  USING (tenant_id = auth_tenant_id());
CREATE POLICY "project_comments_tenant_insert" ON project_comments
  FOR INSERT
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "project_comments_tenant_update" ON project_comments
  FOR UPDATE
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "project_comments_tenant_delete" ON project_comments
  FOR DELETE
  USING (tenant_id = auth_tenant_id());
-- -----------------------------------------------------------------------------
-- 2. opportunities.lost_reason
-- -----------------------------------------------------------------------------
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS lost_reason TEXT;
-- -----------------------------------------------------------------------------
-- 3. po_line_items received-qty tracking
-- -----------------------------------------------------------------------------
ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS received_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES users(id) ON DELETE SET NULL;
