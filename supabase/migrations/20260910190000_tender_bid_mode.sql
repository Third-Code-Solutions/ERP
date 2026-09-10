-- Tender / bid mode: opportunity-level intake for client TOR/BOQ, deviations,
-- weighted evaluation, and internal vendor scoring.
--
-- Client-issued BOQ remains an evidence document until opportunity conversion;
-- no pre-award bom_line_items are created here.

DO $$
BEGIN
  CREATE TYPE tender_package_status AS ENUM ('draft', 'open', 'evaluating', 'submitted', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tender_source_mode AS ENUM ('client_issued_boq', 'abi_generated_bom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tender_deviation_category AS ENUM ('scope', 'quantity', 'unit', 'exclusion', 'schedule', 'commercial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tender_deviation_status AS ENUM ('open', 'responded', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tender_criterion_type AS ENUM ('price', 'technical', 'schedule', 'safety', 'experience', 'commercial', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tender_vendor_profile_status AS ENUM ('draft', 'reviewing', 'qualified', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tender_packages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id      UUID NOT NULL,
  title               VARCHAR(255) NOT NULL,
  reference           VARCHAR(120) NOT NULL,
  source_mode         tender_source_mode NOT NULL,
  status              tender_package_status NOT NULL DEFAULT 'draft',
  tor_document_id     UUID,
  boq_document_id     UUID,
  bound_bom_id        UUID,
  closing_at          TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,
  client_request_id   UUID,
  version             INTEGER NOT NULL DEFAULT 1,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tender_packages_title_nonempty CHECK (title = btrim(title) AND length(title) > 0),
  CONSTRAINT tender_packages_reference_nonempty CHECK (reference = btrim(reference) AND length(reference) > 0),
  CONSTRAINT tender_packages_version_positive CHECK (version > 0),
  CONSTRAINT tender_packages_opportunity_tenant_fk FOREIGN KEY (tenant_id, opportunity_id) REFERENCES opportunities(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_packages_tor_document_tenant_fk FOREIGN KEY (tenant_id, tor_document_id) REFERENCES documents(tenant_id, id) ON DELETE SET NULL (tor_document_id),
  CONSTRAINT tender_packages_boq_document_tenant_fk FOREIGN KEY (tenant_id, boq_document_id) REFERENCES documents(tenant_id, id) ON DELETE SET NULL (boq_document_id),
  CONSTRAINT tender_packages_bound_bom_tenant_fk FOREIGN KEY (tenant_id, bound_bom_id) REFERENCES boms(tenant_id, id) ON DELETE SET NULL (bound_bom_id),
  CONSTRAINT tender_packages_created_by_tenant_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_packages_tenant_id_id ON tender_packages(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_packages_tenant_client_request ON tender_packages(tenant_id, client_request_id);
CREATE INDEX IF NOT EXISTS idx_tender_packages_tenant_id ON tender_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tender_packages_opportunity_id ON tender_packages(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tender_packages_tenant_status ON tender_packages(tenant_id, status);

CREATE TABLE IF NOT EXISTS tender_deviations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tender_id           UUID NOT NULL,
  category            tender_deviation_category NOT NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT NOT NULL,
  source_reference    VARCHAR(255) NOT NULL DEFAULT '',
  response            TEXT NOT NULL DEFAULT '',
  owner_id            UUID,
  status              tender_deviation_status NOT NULL DEFAULT 'open',
  version             INTEGER NOT NULL DEFAULT 1,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tender_deviations_version_positive CHECK (version > 0),
  CONSTRAINT tender_deviations_tender_tenant_fk FOREIGN KEY (tenant_id, tender_id) REFERENCES tender_packages(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_deviations_owner_tenant_fk FOREIGN KEY (tenant_id, owner_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL (owner_id),
  CONSTRAINT tender_deviations_created_by_tenant_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_deviations_tenant_id_id ON tender_deviations(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_tender_deviations_tenant_id ON tender_deviations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tender_deviations_tender_id ON tender_deviations(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_deviations_tender_status ON tender_deviations(tender_id, status);

CREATE TABLE IF NOT EXISTS tender_evaluation_criteria (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tender_id           UUID NOT NULL,
  name                VARCHAR(160) NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  criterion_type      tender_criterion_type NOT NULL,
  weight_bps          INTEGER NOT NULL,
  is_required         BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  version             INTEGER NOT NULL DEFAULT 1,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tender_criteria_weight_bps CHECK (weight_bps > 0 AND weight_bps <= 10000),
  CONSTRAINT tender_criteria_version_positive CHECK (version > 0),
  CONSTRAINT tender_criteria_tender_tenant_fk FOREIGN KEY (tenant_id, tender_id) REFERENCES tender_packages(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_criteria_created_by_tenant_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_criteria_tenant_id_id ON tender_evaluation_criteria(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_criteria_tender_name ON tender_evaluation_criteria(tenant_id, tender_id, name);
CREATE INDEX IF NOT EXISTS idx_tender_criteria_tender_id ON tender_evaluation_criteria(tender_id);

CREATE TABLE IF NOT EXISTS tender_vendor_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tender_id           UUID NOT NULL,
  vendor_id           UUID NOT NULL,
  trade               VARCHAR(120) NOT NULL DEFAULT '',
  capability_summary  TEXT NOT NULL DEFAULT '',
  qualification_summary TEXT NOT NULL DEFAULT '',
  availability_notes  TEXT NOT NULL DEFAULT '',
  compliance_notes    TEXT NOT NULL DEFAULT '',
  status              tender_vendor_profile_status NOT NULL DEFAULT 'draft',
  version             INTEGER NOT NULL DEFAULT 1,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tender_vendor_profiles_version_positive CHECK (version > 0),
  CONSTRAINT tender_vendor_profiles_tender_tenant_fk FOREIGN KEY (tenant_id, tender_id) REFERENCES tender_packages(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_vendor_profiles_vendor_tenant_fk FOREIGN KEY (tenant_id, vendor_id) REFERENCES vendors(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tender_vendor_profiles_created_by_tenant_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL (created_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_vendor_profiles_tenant_id_id ON tender_vendor_profiles(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_vendor_profiles_tender_vendor ON tender_vendor_profiles(tenant_id, tender_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_tender_vendor_profiles_tender_id ON tender_vendor_profiles(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_vendor_profiles_vendor_id ON tender_vendor_profiles(vendor_id);

CREATE TABLE IF NOT EXISTS tender_evaluation_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tender_id           UUID NOT NULL,
  vendor_profile_id   UUID NOT NULL,
  criterion_id        UUID NOT NULL,
  score_bps           INTEGER NOT NULL,
  notes               TEXT NOT NULL DEFAULT '',
  reviewed_by         UUID,
  reviewed_at         TIMESTAMPTZ,
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tender_evaluation_scores_score_bps CHECK (score_bps >= 0 AND score_bps <= 10000),
  CONSTRAINT tender_evaluation_scores_version_positive CHECK (version > 0),
  CONSTRAINT tender_evaluation_scores_tender_tenant_fk FOREIGN KEY (tenant_id, tender_id) REFERENCES tender_packages(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_evaluation_scores_profile_tenant_fk FOREIGN KEY (tenant_id, vendor_profile_id) REFERENCES tender_vendor_profiles(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_evaluation_scores_criterion_tenant_fk FOREIGN KEY (tenant_id, criterion_id) REFERENCES tender_evaluation_criteria(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tender_evaluation_scores_reviewed_by_tenant_fk FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id) ON DELETE SET NULL (reviewed_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_evaluation_scores_tenant_id_id ON tender_evaluation_scores(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tender_evaluation_scores_profile_criterion ON tender_evaluation_scores(tenant_id, vendor_profile_id, criterion_id);
CREATE INDEX IF NOT EXISTS idx_tender_evaluation_scores_tender_id ON tender_evaluation_scores(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_evaluation_scores_profile_id ON tender_evaluation_scores(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_tender_evaluation_scores_criterion_id ON tender_evaluation_scores(criterion_id);

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tender_packages', 'tender_deviations', 'tender_evaluation_criteria',
    'tender_vendor_profiles', 'tender_evaluation_scores'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_read" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_insert" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_update" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_delete" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_read" ON %I FOR SELECT USING (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_insert" ON %I FOR INSERT WITH CHECK (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_update" ON %I FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_tenant_delete" ON %I FOR DELETE USING (tenant_id = auth_tenant_id())', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger()', t, t);
  END LOOP;
END $$;
