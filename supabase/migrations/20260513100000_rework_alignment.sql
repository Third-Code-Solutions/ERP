-- =============================================================================
-- Third Code ERP Refactor — Phase 10 (workflow-alignment delta)
--
-- Closes the four functional gaps identified against the Rework.com showcase:
--   A) Delivery / Inspection / Acceptance state machine
--      → delivery_schedules + delivery_inspections
--   A) Progress Milestone Claim entity
--      → progress_claims + progress_claim_documents
--   C) Auto-generated Weekly Report
--      → weekly_reports
--   E) Customer Portal — continuous read-only client access
--      → customer_portal_sessions
--
-- Every new table gets tenant-scoped RLS + hash-chained audit trigger.
-- Idempotent; safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE delivery_status AS ENUM (
  'scheduled', 'site_preparing', 'site_ready', 'in_transit',
  'received', 'inspecting', 'accepted', 'rejected', 'cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE inspection_result AS ENUM (
  'pending', 'pass', 'fail', 'partial_pass'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE progress_claim_status AS ENUM (
  'draft', 'submitted', 'certificate_pending', 'certified',
  'handed_over_finance', 'invoiced', 'paid', 'rejected', 'cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE progress_claim_document_kind AS ENUM (
  'photo', 'certificate', 'measurement', 'other'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- delivery_schedules — one row per scheduled delivery from a PO
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_schedules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id        UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  status                   delivery_status NOT NULL DEFAULT 'scheduled',
  scheduled_date           TIMESTAMPTZ,
  site_address             TEXT,
  site_contact_name        VARCHAR(255),
  site_contact_phone       VARCHAR(64),
  site_preparation_notes   TEXT,
  site_prepared_at         TIMESTAMPTZ,
  site_prepared_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at              TIMESTAMPTZ,
  received_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  received_notes           TEXT,
  rejected_at              TIMESTAMPTZ,
  rejected_reason          TEXT,
  accepted_at              TIMESTAMPTZ,
  accepted_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_schedules_tenant         ON delivery_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_schedules_po             ON delivery_schedules (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_schedules_tenant_status  ON delivery_schedules (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_schedules_scheduled      ON delivery_schedules (scheduled_date);

CREATE TABLE IF NOT EXISTS delivery_inspections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_schedule_id     UUID NOT NULL REFERENCES delivery_schedules(id) ON DELETE CASCADE,
  inspector_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  result                   inspection_result NOT NULL DEFAULT 'pending',
  defect_notes             TEXT,
  acceptance_notes         TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_inspections_tenant   ON delivery_inspections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_inspections_schedule ON delivery_inspections (delivery_schedule_id);

-- -----------------------------------------------------------------------------
-- progress_claims — milestone-based billing claims
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_claims (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id                  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claim_number                VARCHAR(32) NOT NULL,
  milestone_pct               INTEGER NOT NULL,
  amount_cents                BIGINT NOT NULL DEFAULT 0,
  description                 TEXT,
  status                      progress_claim_status NOT NULL DEFAULT 'draft',
  submitted_at                TIMESTAMPTZ,
  submitted_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  certified_at                TIMESTAMPTZ,
  certified_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  certificate_document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
  handed_over_to_finance_at   TIMESTAMPTZ,
  handed_over_to_finance_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  invoice_id                  UUID REFERENCES invoices(id) ON DELETE SET NULL,
  paid_at                     TIMESTAMPTZ,
  rejected_at                 TIMESTAMPTZ,
  rejected_reason             TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_milestone_pct_range CHECK (milestone_pct >= 0 AND milestone_pct <= 100)
);
CREATE INDEX IF NOT EXISTS idx_progress_claims_tenant        ON progress_claims (tenant_id);
CREATE INDEX IF NOT EXISTS idx_progress_claims_project       ON progress_claims (project_id);
CREATE INDEX IF NOT EXISTS idx_progress_claims_tenant_status ON progress_claims (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_claims_tenant_number
  ON progress_claims (tenant_id, claim_number);

CREATE TABLE IF NOT EXISTS progress_claim_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id     UUID NOT NULL REFERENCES progress_claims(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind         progress_claim_document_kind NOT NULL DEFAULT 'photo',
  caption      VARCHAR(255),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_progress_claim_docs_claim ON progress_claim_documents (claim_id);

-- -----------------------------------------------------------------------------
-- weekly_reports — generated weekly report snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_ending         TIMESTAMPTZ NOT NULL,
  snapshot            JSONB NOT NULL,
  report_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_tenant  ON weekly_reports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_project ON weekly_reports (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_project_week
  ON weekly_reports (project_id, week_ending);

-- -----------------------------------------------------------------------------
-- customer_portal_sessions — long-lived client read-only tokens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_portal_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  viewer_email    VARCHAR(255),
  viewer_name     VARCHAR(255),
  token_hash      VARCHAR(128) NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  last_viewed_at  TIMESTAMPTZ,
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_tenant  ON customer_portal_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_project ON customer_portal_sessions (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_portal_sessions_hash
  ON customer_portal_sessions (token_hash);

-- -----------------------------------------------------------------------------
-- RLS + audit triggers — single DO block
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'delivery_schedules', 'delivery_inspections',
    'progress_claims', 'progress_claim_documents',
    'weekly_reports', 'customer_portal_sessions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_read"   ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_insert" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_update" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_delete" ON %I', t, t);

    EXECUTE format('CREATE POLICY "%s_tenant_read"   ON %I FOR SELECT USING (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_insert" ON %I FOR INSERT WITH CHECK (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_update" ON %I FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_delete" ON %I FOR DELETE USING (tenant_id = auth_tenant_id())', t, t);

    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger()',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
