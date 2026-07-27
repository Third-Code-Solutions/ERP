-- =============================================================================
-- Third Code ERP Refactor — Phase 1b (8-Stage Pipeline)
-- Spec: apps/web/REFACTOR.md M1 US-002
-- Additively extends opportunity_stage enum with the current canonical labels.
-- Legacy values retained; no row updates needed.
-- =============================================================================

BEGIN;

ALTER TYPE opportunity_stage ADD VALUE IF NOT EXISTS 'lead';
ALTER TYPE opportunity_stage ADD VALUE IF NOT EXISTS 'site_survey';
ALTER TYPE opportunity_stage ADD VALUE IF NOT EXISTS 'design';
ALTER TYPE opportunity_stage ADD VALUE IF NOT EXISTS 'contract';
ALTER TYPE opportunity_stage ADD VALUE IF NOT EXISTS 'won';
ALTER TYPE opportunity_stage ADD VALUE IF NOT EXISTS 'lost';

COMMIT;
