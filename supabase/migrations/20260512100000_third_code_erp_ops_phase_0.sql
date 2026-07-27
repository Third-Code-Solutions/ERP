-- =============================================================================
-- Third Code ERP Refactor — Phase 0 (Foundation)
--
-- Spec:  apps/web/REFACTOR.md §1 Purpose, §2 Roles, §3 M1 (US-001..US-005)
-- Plan:  docs/superpowers/plans/2026-05-12-third-code-erp-refactor.md (Chunk 1)
--
-- Adds:
--   - 9 new role enum values (admin/sales/commercial/design/sd_pm_pe/
--     finance/procurement/safety/cx) — legacy values retained.
--   - Three new enums (kyc_status, account_industry, kyc_artifact_type).
--   - accounts, contacts, account_kyc_artifacts tables with RLS.
--   - Nullable account_id FK on opportunities + projects.
--   - CHECK constraint: opportunities must have account_id or project_id.
--   - Audit triggers on the three new tables.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Role enum expansion (additive — legacy values stay)
--    Each ADD VALUE is its own statement so a failure in one doesn't poison
--    the rest of the transaction.
-- -----------------------------------------------------------------------------
ALTER TYPE role ADD VALUE IF NOT EXISTS 'commercial';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'design';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'sd_pm_pe';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'procurement';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'safety';
ALTER TYPE role ADD VALUE IF NOT EXISTS 'cx';

COMMIT;

-- -----------------------------------------------------------------------------
-- The remaining DDL runs in its own transaction so that the enum additions
-- above are visible to subsequent statements (Postgres requires enum
-- additions to be committed before they're usable in the same xact).
-- -----------------------------------------------------------------------------
BEGIN;

-- -----------------------------------------------------------------------------
-- 2) New enums for accounts + KYC artifacts
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'flagged', 'rejected', 'not_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_industry AS ENUM (
    'retail', 'office', 'food_and_beverage', 'healthcare',
    'hospitality', 'industrial', 'residential', 'mixed_use', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_artifact_type AS ENUM (
    'afs_year_1', 'afs_year_2', 'afs_year_3',
    'bir_2303', 'vat_certificate',
    'top_suppliers', 'top_clients', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 3) accounts  — top-level commercial entity (REFACTOR M1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  industry        account_industry NOT NULL DEFAULT 'other',
  billing_address TEXT,
  primary_email   VARCHAR(255),
  primary_phone   VARCHAR(64),
  kyc_status      kyc_status NOT NULL DEFAULT 'pending',
  kyc_notes       TEXT,
  kyc_decided_at  TIMESTAMPTZ,
  kyc_decided_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  cnps_score_x10  VARCHAR(8),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id      ON accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant_kyc     ON accounts (tenant_id, kyc_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_tenant_name ON accounts (tenant_id, name);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_tenant_read"   ON accounts;
DROP POLICY IF EXISTS "accounts_tenant_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_tenant_update" ON accounts;
DROP POLICY IF EXISTS "accounts_tenant_delete" ON accounts;

CREATE POLICY "accounts_tenant_read"   ON accounts FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "accounts_tenant_insert" ON accounts FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "accounts_tenant_update" ON accounts FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "accounts_tenant_delete" ON accounts FOR DELETE USING (tenant_id = auth_tenant_id());

-- -----------------------------------------------------------------------------
-- 4) contacts — people inside an Account
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  full_name   VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(64),
  role_title  VARCHAR(120),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id  ON contacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_email ON contacts (account_id, email);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_tenant_read"   ON contacts;
DROP POLICY IF EXISTS "contacts_tenant_insert" ON contacts;
DROP POLICY IF EXISTS "contacts_tenant_update" ON contacts;
DROP POLICY IF EXISTS "contacts_tenant_delete" ON contacts;

CREATE POLICY "contacts_tenant_read"   ON contacts FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "contacts_tenant_insert" ON contacts FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "contacts_tenant_update" ON contacts FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "contacts_tenant_delete" ON contacts FOR DELETE USING (tenant_id = auth_tenant_id());

-- -----------------------------------------------------------------------------
-- 5) account_kyc_artifacts — one row per required KYC document
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_kyc_artifacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  artifact_type kyc_artifact_type NOT NULL,
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  notes         TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_kyc_tenant_id    ON account_kyc_artifacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_account_kyc_account_id   ON account_kyc_artifacts (account_id);
CREATE INDEX IF NOT EXISTS idx_account_kyc_account_type ON account_kyc_artifacts (account_id, artifact_type);

ALTER TABLE account_kyc_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_kyc_tenant_read"   ON account_kyc_artifacts;
DROP POLICY IF EXISTS "account_kyc_tenant_insert" ON account_kyc_artifacts;
DROP POLICY IF EXISTS "account_kyc_tenant_update" ON account_kyc_artifacts;
DROP POLICY IF EXISTS "account_kyc_tenant_delete" ON account_kyc_artifacts;

CREATE POLICY "account_kyc_tenant_read"   ON account_kyc_artifacts FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "account_kyc_tenant_insert" ON account_kyc_artifacts FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "account_kyc_tenant_update" ON account_kyc_artifacts FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "account_kyc_tenant_delete" ON account_kyc_artifacts FOR DELETE USING (tenant_id = auth_tenant_id());

-- -----------------------------------------------------------------------------
-- 6) Wire opportunities + projects to accounts
--    `account_id` is added as nullable to preserve legacy rows. Newly
--    created opportunities will set this; once Phase 1 ships, the UI
--    will not allow opps without an Account.
-- -----------------------------------------------------------------------------
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS account_id UUID
  REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE opportunities ALTER COLUMN project_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE opportunities ADD CONSTRAINT opp_account_or_project
    CHECK (account_id IS NOT NULL OR project_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities (account_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS account_id UUID
  REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_account_id ON projects (account_id);

-- -----------------------------------------------------------------------------
-- 7) Audit triggers — extend hash-chained audit coverage to the new tables
--    The audit_log_trigger function is defined in 20260509164538_audit_triggers.sql.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_accounts              ON accounts;
DROP TRIGGER IF EXISTS audit_contacts              ON contacts;
DROP TRIGGER IF EXISTS audit_account_kyc_artifacts ON account_kyc_artifacts;

CREATE TRIGGER audit_accounts
  AFTER INSERT OR UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_account_kyc_artifacts
  AFTER INSERT OR UPDATE OR DELETE ON account_kyc_artifacts
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

COMMIT;
