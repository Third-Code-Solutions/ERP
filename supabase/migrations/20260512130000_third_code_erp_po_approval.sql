-- =============================================================================
-- Third Code ERP Refactor — PO 3-Step Approval (US-Pre-003)
-- Spec: apps/web/REFACTOR.md US-Pre-003
-- Additively extends purchase_order_status enum with the current approval labels
-- and adds approval-stamp columns to purchase_orders.
-- Legacy values retained (draft / submitted / confirmed / partial_delivery /
-- delivered / cancelled); no row updates needed.
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'pending_pm_approval';
ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'pending_commercial_approval';
ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'pending_scm_issuance';
ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'issued';
ALTER TYPE purchase_order_status ADD VALUE IF NOT EXISTS 'fully_delivered';

COMMIT;

BEGIN;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pm_approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pm_approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS commercial_approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS commercial_approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS scm_issued_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS scm_issued_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_email_sent_at TIMESTAMPTZ;

COMMIT;
