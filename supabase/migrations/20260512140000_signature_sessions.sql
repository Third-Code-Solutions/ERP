-- =============================================================================
-- ABI Ops — Canvas-based in-app signing (DocuSeal alternative)
--
-- Adds signature_sessions table + RLS + audit trigger. Lets clients sign
-- BOMs / Contracts / VOs / COCs via an HTML5 canvas pad on the public
-- /portal/sign/[token] route. Co-exists with the DocuSeal client — when
-- DOCUSEAL_API_URL is set, server actions still call DocuSeal; otherwise
-- they create a signature_sessions row and return a canvas-signing URL.
--
-- Idempotent.
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE signable_entity_type AS ENUM (
    'bom', 'contract', 'variation_order', 'coc'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS signature_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type            signable_entity_type NOT NULL,
  entity_id              UUID NOT NULL,
  token_hash             VARCHAR(128) NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  signer_name            VARCHAR(255),
  signer_email           VARCHAR(255),
  signer_ip              VARCHAR(45),
  signer_user_agent      TEXT,
  signed_at              TIMESTAMPTZ,
  signature_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  revoked_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_sessions_tenant ON signature_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_signature_sessions_entity ON signature_sessions (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_sessions_hash ON signature_sessions (token_hash);

ALTER TABLE signature_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signature_sessions_tenant_read"   ON signature_sessions;
DROP POLICY IF EXISTS "signature_sessions_tenant_insert" ON signature_sessions;
DROP POLICY IF EXISTS "signature_sessions_tenant_update" ON signature_sessions;
DROP POLICY IF EXISTS "signature_sessions_tenant_delete" ON signature_sessions;

CREATE POLICY "signature_sessions_tenant_read"   ON signature_sessions FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "signature_sessions_tenant_insert" ON signature_sessions FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "signature_sessions_tenant_update" ON signature_sessions FOR UPDATE USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "signature_sessions_tenant_delete" ON signature_sessions FOR DELETE USING (tenant_id = auth_tenant_id());

DROP TRIGGER IF EXISTS audit_signature_sessions ON signature_sessions;
CREATE TRIGGER audit_signature_sessions
  AFTER INSERT OR UPDATE OR DELETE ON signature_sessions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

COMMIT;
