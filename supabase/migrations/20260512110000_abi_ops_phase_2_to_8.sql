-- =============================================================================
-- ABI Ops Refactor — Phases 2-8 (Module Schemas)
--
-- Spec:  apps/web/REFACTOR.md M2..M7 + cross-cutting
-- Plan:  docs/superpowers/plans/2026-05-12-abi-ops-refactor.md
--
-- Creates schemas for:
--   M2 — pprf_submissions, site_inspections (+photos +rfis), design_files
--        (+versions), change_requests
--   M3 — material_items, rate_cards, mapping_config, bom_portal_tokens,
--        rfqs, rfq_quotes
--   M4 — pre_con_checklist_templates, pre_con_checklists,
--        pre_con_checklist_items, permits, permit_documents, contracts
--   M5 — daily_tasks, variation_orders, master_schedules, progress_updates
--   M6 — punchlist_items, punchlist_photos, turnover_packages,
--        certificates_of_completion
--   M7 — warranty_tickets, ticket_messages, warranty_portal_tokens,
--        cnps_surveys
--   Cross-cutting — notifications, sla_logs
--
-- Every new table gets:
--   - tenant_id-scoped RLS (4 policies: SELECT, INSERT, UPDATE, DELETE)
--   - Hash-chained audit trigger via audit_log_trigger()
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Enums for M2..M8
-- -----------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE inspection_status AS ENUM ('draft', 'submitted', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rfi_priority AS ENUM ('minor', 'major'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE design_file_type AS ENUM ('initial_layout', 'final_rendering', 'animation', 'revised'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE change_request_priority AS ENUM ('minor', 'major'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rfq_status AS ENUM ('pending', 'quotes_received', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE checklist_item_status AS ENUM ('not_started', 'in_progress', 'blocked', 'done'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE permit_type AS ENUM ('building_admin_vetting', 'lgu_building_permit', 'dole_permit'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE permit_status AS ENUM ('not_started', 'submitted', 'additional_docs_required', 'under_review', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE contract_status AS ENUM ('draft', 'pending_signature', 'signed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('pending', 'done', 'skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE variation_order_status AS ENUM ('draft', 'pending_commercial_pricing', 'pending_client_signature', 'signed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE variation_order_change_type AS ENUM ('client_initiated', 'site_condition', 'design_error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE punchlist_status AS ENUM ('open', 'in_progress', 'for_inspection', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE punchlist_priority AS ENUM ('low', 'medium', 'high', 'critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE coc_status AS ENUM ('draft', 'pending_signature', 'signed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('open', 'acknowledged', 'scheduled', 'in_progress', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_category AS ENUM ('civil', 'electrical', 'plumbing', 'mep', 'finishes', 'fixtures', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'sms'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- M2 — Proposal Workflow
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pprf_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  payload         JSONB NOT NULL,
  submitted_at    TIMESTAMPTZ,
  submitted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pprf_tenant_id          ON pprf_submissions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pprf_opportunity_id     ON pprf_submissions (opportunity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pprf_opportunity_version
  ON pprf_submissions (opportunity_id, version);

CREATE TABLE IF NOT EXISTS site_inspections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id      UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status              inspection_status NOT NULL DEFAULT 'draft',
  payload             JSONB NOT NULL,
  pdf_document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
  submitted_at        TIMESTAMPTZ,
  submitted_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_inspections_tenant_id      ON site_inspections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_inspections_opportunity_id ON site_inspections (opportunity_id);

CREATE TABLE IF NOT EXISTS site_inspection_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inspection_id  UUID NOT NULL REFERENCES site_inspections(id) ON DELETE CASCADE,
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  caption        VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_inspection_photos_inspection ON site_inspection_photos (inspection_id);

CREATE TABLE IF NOT EXISTS site_inspection_rfis (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inspection_id  UUID NOT NULL REFERENCES site_inspections(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  priority       rfi_priority NOT NULL DEFAULT 'minor',
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_inspection_rfis_inspection ON site_inspection_rfis (inspection_id);

CREATE TABLE IF NOT EXISTS design_files (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id              UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  file_type                   design_file_type NOT NULL,
  name                        VARCHAR(255) NOT NULL,
  is_ready_for_presentation   BOOLEAN NOT NULL DEFAULT false,
  is_client_approved          BOOLEAN NOT NULL DEFAULT false,
  client_approved_at          TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_design_files_tenant_id      ON design_files (tenant_id);
CREATE INDEX IF NOT EXISTS idx_design_files_opportunity_id ON design_files (opportunity_id);

CREATE TABLE IF NOT EXISTS design_file_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  design_file_id  UUID NOT NULL REFERENCES design_files(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  notes           TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_design_file_versions_design_file ON design_file_versions (design_file_id);

CREATE TABLE IF NOT EXISTS change_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id              UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  requested_by_name           VARCHAR(255),
  description                 TEXT NOT NULL,
  priority                    change_request_priority NOT NULL DEFAULT 'minor',
  affected_design_file_id     UUID REFERENCES design_files(id) ON DELETE SET NULL,
  resolved_at                 TIMESTAMPTZ,
  resolved_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_requests_tenant_id      ON change_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_opportunity_id ON change_requests (opportunity_id);

-- -----------------------------------------------------------------------------
-- M3 — BOM Engine extras
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS material_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         VARCHAR(64) NOT NULL,
  description  TEXT NOT NULL,
  category     VARCHAR(120),
  unit         VARCHAR(32) NOT NULL,
  wastage_bps  INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_material_items_tenant_id ON material_items (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_items_tenant_code ON material_items (tenant_id, code);

CREATE TABLE IF NOT EXISTS rate_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_item_id  UUID NOT NULL REFERENCES material_items(id) ON DELETE CASCADE,
  vendor_id         UUID REFERENCES vendors(id) ON DELETE CASCADE,
  unit_price_cents  BIGINT NOT NULL,
  lead_time_days    INTEGER,
  is_preferred      BOOLEAN NOT NULL DEFAULT false,
  effective_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_cards_tenant_id    ON rate_cards (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_material_item ON rate_cards (material_item_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_vendor       ON rate_cards (vendor_id);

CREATE TABLE IF NOT EXISTS mapping_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_label      VARCHAR(255) NOT NULL,
  material_item_id  UUID NOT NULL REFERENCES material_items(id) ON DELETE CASCADE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mapping_config_tenant_id   ON mapping_config (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_config_tenant_label
  ON mapping_config (tenant_id, source_label);

CREATE TABLE IF NOT EXISTS bom_portal_tokens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bom_id                   UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  token_hash               VARCHAR(128) NOT NULL,
  expires_at               TIMESTAMPTZ NOT NULL,
  used_at                  TIMESTAMPTZ,
  docuseal_submission_id   VARCHAR(128),
  docuseal_slug            VARCHAR(128),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bom_portal_tokens_tenant_id ON bom_portal_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bom_portal_tokens_bom_id    ON bom_portal_tokens (bom_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_portal_tokens_hash ON bom_portal_tokens (token_hash);

CREATE TABLE IF NOT EXISTS rfqs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bom_id       UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  status       rfq_status NOT NULL DEFAULT 'pending',
  line_items   JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfqs_tenant_id ON rfqs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_bom_id    ON rfqs (bom_id);

CREATE TABLE IF NOT EXISTS rfq_quotes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_id             UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  vendor_id          UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  material_item_id   UUID REFERENCES material_items(id) ON DELETE SET NULL,
  unit_price_cents   BIGINT NOT NULL,
  lead_time_days     INTEGER,
  valid_until        TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq_id    ON rfq_quotes (rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_vendor_id ON rfq_quotes (vendor_id);

-- -----------------------------------------------------------------------------
-- M4 — Pre-Construction
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pre_con_checklist_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL DEFAULT 'default',
  items       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcc_templates_tenant_id ON pre_con_checklist_templates (tenant_id);

CREATE TABLE IF NOT EXISTS pre_con_checklists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id  UUID REFERENCES pre_con_checklist_templates(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pre_con_checklists_tenant_id  ON pre_con_checklists (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pre_con_checklists_project_id ON pre_con_checklists (project_id);

CREATE TABLE IF NOT EXISTS pre_con_checklist_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  checklist_id             UUID NOT NULL REFERENCES pre_con_checklists(id) ON DELETE CASCADE,
  title                    VARCHAR(255) NOT NULL,
  owner_role               VARCHAR(64),
  sla_days                 INTEGER,
  status                   checklist_item_status NOT NULL DEFAULT 'not_started',
  blocker_reason           TEXT,
  depends_on_item_id       UUID,
  completed_at             TIMESTAMPTZ,
  completed_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  sla_clock_started_at     TIMESTAMPTZ,
  sla_breached_at          TIMESTAMPTZ,
  attachment_document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcc_items_checklist_id  ON pre_con_checklist_items (checklist_id);
CREATE INDEX IF NOT EXISTS idx_pcc_items_tenant_status ON pre_con_checklist_items (tenant_id, status);

CREATE TABLE IF NOT EXISTS permits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  permit_type              permit_type NOT NULL,
  status                   permit_status NOT NULL DEFAULT 'not_started',
  submitted_at             TIMESTAMPTZ,
  expected_approval_at     TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  last_status_change_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permits_tenant_id     ON permits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_permits_project_id    ON permits (project_id);
CREATE INDEX IF NOT EXISTS idx_permits_tenant_status ON permits (tenant_id, status);

CREATE TABLE IF NOT EXISTS permit_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  permit_id          UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  document_id        UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  note               VARCHAR(255),
  submission_round   INTEGER NOT NULL DEFAULT 1,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permit_documents_permit_id ON permit_documents (permit_id);

CREATE TABLE IF NOT EXISTS contracts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bom_id                   UUID REFERENCES boms(id) ON DELETE SET NULL,
  status                   contract_status NOT NULL DEFAULT 'draft',
  docuseal_submission_id   VARCHAR(128),
  docuseal_slug            VARCHAR(128),
  signed_document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  signed_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id  ON contracts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts (project_id);

-- -----------------------------------------------------------------------------
-- M5 — Construction
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  role                VARCHAR(64),
  due_date            TIMESTAMPTZ NOT NULL,
  status              task_status NOT NULL DEFAULT 'pending',
  completion_notes    TEXT,
  completed_at        TIMESTAMPTZ,
  completed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_tenant_id      ON daily_tasks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_project_id     ON daily_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_assignee_due   ON daily_tasks (assignee_id, due_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_tenant_status  ON daily_tasks (tenant_id, status);

CREATE TABLE IF NOT EXISTS variation_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vo_number                VARCHAR(32) NOT NULL,
  description              TEXT NOT NULL,
  change_type              variation_order_change_type NOT NULL,
  cost_impact_cents        BIGINT NOT NULL DEFAULT 0,
  time_impact_days         INTEGER NOT NULL DEFAULT 0,
  status                   variation_order_status NOT NULL DEFAULT 'draft',
  docuseal_submission_id   VARCHAR(128),
  signed_document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  signed_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_vos_tenant_id  ON variation_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vos_project_id ON variation_orders (project_id);

CREATE TABLE IF NOT EXISTS master_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL DEFAULT 'Level 1 Master Schedule',
  tasks        JSONB NOT NULL,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_master_schedules_tenant_id  ON master_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_master_schedules_project_id ON master_schedules (project_id);

CREATE TABLE IF NOT EXISTS progress_updates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_ending           TIMESTAMPTZ NOT NULL,
  percent_by_category   JSONB NOT NULL,
  notes                 TEXT,
  submitted_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progress_updates_tenant_id   ON progress_updates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_progress_updates_project_week ON progress_updates (project_id, week_ending);

-- -----------------------------------------------------------------------------
-- M6 — Post-Construction
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS punchlist_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,
  location            VARCHAR(255),
  trade               VARCHAR(120),
  priority            punchlist_priority NOT NULL DEFAULT 'medium',
  status              punchlist_status NOT NULL DEFAULT 'open',
  due_date            TIMESTAMPTZ,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_text    VARCHAR(255),
  pe_signed_off_at    TIMESTAMPTZ,
  pe_signed_off_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_punchlist_tenant_id      ON punchlist_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_project_id     ON punchlist_items (project_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_tenant_status  ON punchlist_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_punchlist_project_trade  ON punchlist_items (project_id, trade);

CREATE TABLE IF NOT EXISTS punchlist_photos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  punchlist_item_id   UUID NOT NULL REFERENCES punchlist_items(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  caption             VARCHAR(255),
  is_before           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punchlist_photos_item ON punchlist_photos (punchlist_item_id);

CREATE TABLE IF NOT EXISTS turnover_packages (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id                     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  as_built_document_id           UUID REFERENCES documents(id) ON DELETE SET NULL,
  om_manual_document_id          UUID REFERENCES documents(id) ON DELETE SET NULL,
  warranty_cert_document_id      UUID REFERENCES documents(id) ON DELETE SET NULL,
  keys_log_document_id           UUID REFERENCES documents(id) ON DELETE SET NULL,
  compiled_at                    TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turnover_project_id ON turnover_packages (project_id);

CREATE TABLE IF NOT EXISTS certificates_of_completion (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id                    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status                        coc_status NOT NULL DEFAULT 'draft',
  docuseal_submission_id        VARCHAR(128),
  signed_document_id            UUID REFERENCES documents(id) ON DELETE SET NULL,
  signed_at                     TIMESTAMPTZ,
  warranty_period_starts_at     TIMESTAMPTZ,
  warranty_period_ends_at       TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coc_project_id ON certificates_of_completion (project_id);

-- -----------------------------------------------------------------------------
-- M7 — Warranty + CX
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warranty_tickets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id                  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id                  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ticket_number               VARCHAR(32) NOT NULL,
  category                    ticket_category NOT NULL DEFAULT 'other',
  description                 TEXT NOT NULL,
  location                    VARCHAR(255),
  status                      ticket_status NOT NULL DEFAULT 'open',
  submitted_by_name           VARCHAR(255),
  submitted_by_email          VARCHAR(255),
  acknowledged_at             TIMESTAMPTZ,
  scheduled_at                TIMESTAMPTZ,
  closed_at                   TIMESTAMPTZ,
  sla_breached_ack            BOOLEAN NOT NULL DEFAULT false,
  sla_breached_schedule       BOOLEAN NOT NULL DEFAULT false,
  service_report_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_tenant_id     ON warranty_tickets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_project_id    ON warranty_tickets (project_id);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_tenant_status ON warranty_tickets (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_tickets_tenant_number
  ON warranty_tickets (tenant_id, ticket_number);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id      UUID NOT NULL REFERENCES warranty_tickets(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  is_internal    BOOLEAN NOT NULL DEFAULT false,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_name    VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS warranty_portal_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token_hash   VARCHAR(128) NOT NULL,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_portal_tokens_hash ON warranty_portal_tokens (token_hash);

CREATE TABLE IF NOT EXISTS cnps_surveys (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id             UUID NOT NULL REFERENCES warranty_tickets(id) ON DELETE CASCADE,
  account_id            UUID REFERENCES accounts(id) ON DELETE SET NULL,
  score                 INTEGER,
  comment               TEXT,
  sent_at               TIMESTAMPTZ,
  responded_at          TIMESTAMPTZ,
  response_token_hash   VARCHAR(128),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cnps_tenant_id  ON cnps_surveys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cnps_ticket_id  ON cnps_surveys (ticket_id);
CREATE INDEX IF NOT EXISTS idx_cnps_account_id ON cnps_surveys (account_id);

-- -----------------------------------------------------------------------------
-- Cross-cutting — notifications + SLA logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_email     VARCHAR(255),
  channel             notification_channel NOT NULL DEFAULT 'in_app',
  subject             VARCHAR(255) NOT NULL,
  body                TEXT,
  link_url            VARCHAR(512),
  payload             JSONB,
  is_read             BOOLEAN NOT NULL DEFAULT false,
  read_at             TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id        ON notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications (recipient_user_id, is_read);

CREATE TABLE IF NOT EXISTS sla_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   VARCHAR(64) NOT NULL,
  entity_id     UUID NOT NULL,
  sla_label     VARCHAR(120) NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_seconds   JSONB NOT NULL,
  warned_at     TIMESTAMPTZ,
  breached_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sla_logs_tenant_id ON sla_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sla_logs_entity    ON sla_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sla_logs_open      ON sla_logs (tenant_id, completed_at);

-- -----------------------------------------------------------------------------
-- RLS + audit triggers for all new tables.
-- Use a DO block to loop over the table list so the body stays terse.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'pprf_submissions', 'site_inspections', 'site_inspection_photos', 'site_inspection_rfis',
    'design_files', 'design_file_versions', 'change_requests',
    'material_items', 'rate_cards', 'mapping_config', 'bom_portal_tokens',
    'rfqs', 'rfq_quotes',
    'pre_con_checklist_templates', 'pre_con_checklists', 'pre_con_checklist_items',
    'permits', 'permit_documents', 'contracts',
    'daily_tasks', 'variation_orders', 'master_schedules', 'progress_updates',
    'punchlist_items', 'punchlist_photos', 'turnover_packages', 'certificates_of_completion',
    'warranty_tickets', 'ticket_messages', 'warranty_portal_tokens', 'cnps_surveys',
    'notifications', 'sla_logs'
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
