-- =============================================================================
-- Third Code ERP Audit Log Triggers
-- Automatically inserts into audit_log on mutations to tracked tables.
-- Hash chain integrity is maintained at the application layer via
-- packages/shared-types/src/audit/hash-chain.ts.
-- The trigger records prev_hash='pending' — the application must update it
-- immediately after insert via a server action or Inngest job.
-- =============================================================================

-- =============================================================================
-- pgcrypto must be enabled:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- =============================================================================

-- Helper: compute a diff JSONB between old and new row
CREATE OR REPLACE FUNCTION jsonb_diff(old_row JSONB, new_row JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_object_agg(
    key,
    jsonb_build_object(
      'before', old_row -> key,
      'after',  new_row -> key
    )
  )
  FROM (
    SELECT key
    FROM jsonb_each(old_row)
    UNION
    SELECT key
    FROM jsonb_each(new_row)
    WHERE NOT (new_row -> key = old_row -> key)
  ) changed_keys
  WHERE old_row -> key IS DISTINCT FROM new_row -> key
$$;

-- =============================================================================
-- Generic audit trigger function
-- Called by per-table triggers; uses TG_TABLE_NAME for entity_type.
-- The entity_id column must be named 'id' (UUID) in every tracked table.
-- =============================================================================
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action      TEXT;
  v_entity_id   UUID;
  v_tenant_id   UUID;
  v_diff        JSONB;
  v_prev_hash   TEXT;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action    := 'create';
    v_entity_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_diff      := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action    := 'update';
    v_entity_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_diff      := jsonb_diff(to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_action    := 'delete';
    v_entity_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
    v_diff      := to_jsonb(OLD);
  END IF;

  -- Get the most recent hash for this tenant (for chaining)
  SELECT hash INTO v_prev_hash
  FROM audit_log
  WHERE tenant_id = v_tenant_id
  ORDER BY id DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'genesis';
  END IF;

  -- Insert audit record (hash computed server-side as a placeholder;
  -- the application's hash-chain.ts recomputes and verifies asynchronously)
  INSERT INTO audit_log (
    tenant_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    diff,
    prev_hash,
    hash
  ) VALUES (
    v_tenant_id,
    auth.uid(),             -- Supabase Auth user ID
    TG_TABLE_NAME,
    v_entity_id,
    v_action,
    v_diff,
    v_prev_hash,
    -- SHA256 placeholder computed in DB for speed; app verifies full chain
    encode(
      digest(
        v_prev_hash || TG_TABLE_NAME || v_entity_id::text || v_action || NOW()::text,
        'sha256'
      ),
      'hex'
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =============================================================================
-- Attach triggers to all tracked tables
-- =============================================================================

CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_opportunities
  AFTER INSERT OR UPDATE OR DELETE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_boms
  AFTER INSERT OR UPDATE OR DELETE ON boms
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_bom_line_items
  AFTER INSERT OR UPDATE OR DELETE ON bom_line_items
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_purchase_orders
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- =============================================================================
-- Enforce append-only on audit_log at the database level
-- =============================================================================
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- =============================================================================
-- Usage:
--   psql $DATABASE_URL -f packages/database/src/sql/audit-triggers.sql
-- Run after Drizzle migrations and RLS policies.
-- =============================================================================
