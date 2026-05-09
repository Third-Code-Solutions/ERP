import { pgEnum } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', [
  'owner',
  'admin',
  'estimator',
  'sales',
  'pm',
  'viewer',
])

export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
  'closed_won',
  'closed_lost',
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

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'submitted',
  'confirmed',
  'partial_delivery',
  'delivered',
  'cancelled',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'partial_payment',
  'paid',
  'overdue',
  'cancelled',
])
