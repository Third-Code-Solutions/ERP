import { pgEnum } from 'drizzle-orm/pg-core'

// ABI Ops role taxonomy. Legacy values (owner/estimator/pm) are retained
// for back-compat — Postgres enums cannot drop values without table rewrites.
// New ABI Ops roles per REFACTOR.md §2 sit alongside them.
export const roleEnum = pgEnum('role', [
  // Legacy (retained for back-compat; new users get the ABI roles)
  'owner',
  'estimator',
  'pm',
  // ABI Ops roles
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
])

// KYC review status for Account onboarding (REFACTOR M1 US-001..US-003)
export const kycStatusEnum = pgEnum('kyc_status', [
  'pending',
  'approved',
  'flagged',
  'rejected',
  'not_required',
])

// Industry classification on Account record
export const accountIndustryEnum = pgEnum('account_industry', [
  'retail',
  'office',
  'food_and_beverage',
  'healthcare',
  'hospitality',
  'industrial',
  'residential',
  'mixed_use',
  'other',
])

// KYC artifact type — one row per required document
export const kycArtifactTypeEnum = pgEnum('kyc_artifact_type', [
  'afs_year_1',
  'afs_year_2',
  'afs_year_3',
  'bir_2303',
  'vat_certificate',
  'top_suppliers',
  'top_clients',
  'other',
])

// ABI Ops pipeline stages per REFACTOR.md M1 US-002.
// Legacy stages (opportunity_creation, scoping, resubmission, closed_won,
// closed_lost) retained for back-compat — PG enums cannot DROP values.
// New ABI stages: lead, site_survey, design, contract, won, lost.
// Canonical 8-stage flow: lead → site_survey → design → bom_submission →
// negotiation → contract → won (with lost reachable from any).
export const opportunityStageEnum = pgEnum('opportunity_stage', [
  // Legacy
  'opportunity_creation',
  'scoping',
  'resubmission',
  'closed_won',
  'closed_lost',
  // ABI Ops 8-stage flow
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  'lost',
])

export const projectStatusEnum = pgEnum('project_status', [
  'lead',
  'active',
  'on_hold',
  'completed',
  'cancelled',
])

export const projectTypeEnum = pgEnum('project_type', [
  'mep',
  'fit_out',
  'interior',
  'mixed',
])

export const bomStatusEnum = pgEnum('bom_status', [
  'draft',
  'approved',
  'locked',
  'archived',
])

export const documentTypeEnum = pgEnum('document_type', [
  'dxf',
  'pdf',
  'image',
  'contract',
  'bom',
  'invoice',
  'po',
  'other',
])

// PO status. Legacy values (submitted/confirmed/delivered) retained for
// back-compat. New ABI 3-step flow per REFACTOR.md US-Pre-003:
// draft → pending_pm_approval → pending_commercial_approval →
// pending_scm_issuance → issued → partial_delivered → fully_delivered.
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  // Legacy
  'draft',
  'submitted',
  'confirmed',
  'partial_delivery',
  'delivered',
  'cancelled',
  // ABI 3-step approval flow
  'pending_pm_approval',
  'pending_commercial_approval',
  'pending_scm_issuance',
  'issued',
  'fully_delivered',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'partial_payment',
  'paid',
  'overdue',
  'cancelled',
])

// Phase 3 — Cost Tracking (F3.2). Actual cost incurred per project.
export const costCategoryEnum = pgEnum('cost_category', [
  'material',
  'labour',
  'subcontractor',
  'equipment',
  'overhead',
  'other',
])

export const costSourceEnum = pgEnum('cost_source', [
  'manual',
  'po_derived',
  'import',
])
