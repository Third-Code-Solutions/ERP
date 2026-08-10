import { pgEnum } from 'drizzle-orm/pg-core'

// Third Code ERP role taxonomy. Legacy values (owner/estimator/pm) are retained
// for back-compat — Postgres enums cannot drop values without table rewrites.
// New Third Code ERP roles per REFACTOR.md §2 sit alongside them.
export const roleEnum = pgEnum('role', [
  // Legacy (retained for back-compat; new users get the current ERP roles)
  'owner',
  'estimator',
  'pm',
  // Third Code ERP roles
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

export const cadEvidenceCommitRequestStateEnum = pgEnum(
  'cad_evidence_commit_request_state',
  ['processing', 'succeeded']
)

export const publicSigningRequestStateEnum = pgEnum(
  'public_signing_request_state',
  ['processing', 'succeeded']
)

export const vendorConfirmationStateEnum = pgEnum(
  'vendor_confirmation_state',
  ['pending', 'accepted', 'declined', 'changes_requested']
)

export const vendorConfirmationRequestStateEnum = pgEnum(
  'vendor_confirmation_request_state',
  ['processing', 'succeeded']
)

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

// Third Code ERP pipeline stages per REFACTOR.md M1 US-002.
// Legacy stages (opportunity_creation, scoping, resubmission, closed_won,
// closed_lost) retained for back-compat — PG enums cannot DROP values.
// Current pipeline stages: lead, site_survey, design, contract, won, lost.
// Canonical 8-stage flow: lead → site_survey → design → bom_submission →
// negotiation → contract → won (with lost reachable from any).
export const opportunityStageEnum = pgEnum('opportunity_stage', [
  // Legacy
  'opportunity_creation',
  'scoping',
  'resubmission',
  'closed_won',
  'closed_lost',
  // Third Code ERP 8-stage flow
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

export const projectCreateRequestStateEnum = pgEnum(
  'project_create_request_state',
  ['processing', 'succeeded']
)

export const projectCommentCreateRequestStateEnum = pgEnum(
  'project_comment_create_request_state',
  ['processing', 'succeeded']
)

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

export const documentIntakeRequestStateEnum = pgEnum(
  'document_intake_request_state',
  ['processing', 'succeeded']
)

export const documentProcessingModeEnum = pgEnum(
  'document_processing_mode',
  ['cad']
)

export const documentProcessingRequestedFormatEnum = pgEnum(
  'document_processing_requested_format',
  ['auto', 'dxf', 'dwg']
)

export const documentProcessingFileFormatEnum = pgEnum(
  'document_processing_file_format',
  ['dxf', 'dwg']
)

export const documentProcessingStatusEnum = pgEnum(
  'document_processing_status',
  ['queued', 'processing', 'succeeded', 'failed']
)

// PO status. Legacy values (submitted/confirmed/delivered) retained for
// back-compat. Current 3-step flow per REFACTOR.md US-Pre-003:
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
  // Current 3-step approval flow
  'pending_pm_approval',
  'pending_commercial_approval',
  'pending_scm_issuance',
  'issued',
  'partial_delivered',
  'fully_delivered',
])

export const purchaseOrderCreateRequestStateEnum = pgEnum(
  'purchase_order_create_request_state',
  ['processing', 'succeeded']
)

export const purchaseOrderWorkflowActionEnum = pgEnum(
  'purchase_order_workflow_action',
  [
    'submit_pm_approval',
    'pm_approve',
    'commercial_approve',
    'reject',
    'scm_issue',
  ]
)

export const purchaseOrderWorkflowRequestStateEnum = pgEnum(
  'purchase_order_workflow_request_state',
  ['processing', 'succeeded']
)

export const journalPostRequestStateEnum = pgEnum(
  'journal_post_request_state',
  ['processing', 'succeeded']
)

export const journalReverseRequestStateEnum = pgEnum(
  'journal_reverse_request_state',
  ['processing', 'succeeded']
)

export const supplierBillPostRequestStateEnum = pgEnum(
  'supplier_bill_post_request_state',
  ['processing', 'succeeded']
)

export const supplierBillReverseRequestStateEnum = pgEnum(
  'supplier_bill_reverse_request_state',
  ['processing', 'succeeded']
)

export const cashTransactionWorkflowActionEnum = pgEnum(
  'cash_transaction_workflow_action',
  ['post', 'reverse']
)

export const cashTransactionWorkflowRequestStateEnum = pgEnum(
  'cash_transaction_workflow_request_state',
  ['processing', 'succeeded']
)

export const cashTransactionDraftRequestActionEnum = pgEnum(
  'cash_transaction_draft_request_action',
  ['save', 'delete']
)

export const cashTransactionDraftRequestStateEnum = pgEnum(
  'cash_transaction_draft_request_state',
  ['processing', 'succeeded']
)

export const documentDeleteRequestStateEnum = pgEnum(
  'document_delete_request_state',
  ['processing', 'succeeded']
)

export const customerInvoiceIssueRequestStateEnum = pgEnum(
  'customer_invoice_issue_request_state',
  ['processing', 'succeeded']
)

export const customerInvoiceReverseRequestStateEnum = pgEnum(
  'customer_invoice_reverse_request_state',
  ['processing', 'succeeded']
)

export const customerInvoiceCancelRequestStateEnum = pgEnum(
  'customer_invoice_cancel_request_state',
  ['processing', 'succeeded']
)

export const customerInvoiceDraftCreateRequestStateEnum = pgEnum(
  'customer_invoice_draft_create_request_state',
  ['processing', 'succeeded']
)

export const stockReceiptWorkflowActionEnum = pgEnum(
  'stock_receipt_workflow_action',
  ['post', 'reverse']
)

export const stockReceiptWorkflowRequestStateEnum = pgEnum(
  'stock_receipt_workflow_request_state',
  ['processing', 'succeeded']
)

export const deliveryWorkflowActionEnum = pgEnum(
  'delivery_workflow_action',
  [
    'record_receipt',
    'mark_in_transit',
    'start_inspection',
    'complete_inspection',
    'cancel_delivery',
    'start_site_preparation',
    'complete_site_preparation',
  ]
)

export const deliveryWorkflowRequestStateEnum = pgEnum(
  'delivery_workflow_request_state',
  ['processing', 'succeeded']
)

export const deliveryScheduleCreateRequestStateEnum = pgEnum(
  'delivery_schedule_create_request_state',
  ['processing', 'succeeded']
)

export const togalBomCommitRequestStateEnum = pgEnum(
  'togal_bom_commit_request_state',
  ['processing', 'succeeded']
)

export const opportunityProjectConversionRequestStateEnum = pgEnum(
  'opportunity_project_conversion_request_state',
  ['processing', 'succeeded']
)

export const opportunityStageTransitionRequestStateEnum = pgEnum(
  'opportunity_stage_transition_request_state',
  ['processing', 'succeeded']
)

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

export const costEntryCreateRequestStateEnum = pgEnum(
  'cost_entry_create_request_state',
  ['processing', 'succeeded']
)

export const userRoleAssignmentRequestStateEnum = pgEnum(
  'user_role_assignment_request_state',
  ['processing', 'succeeded']
)

export const costEntryDeleteRequestStateEnum = pgEnum(
  'cost_entry_delete_request_state',
  ['processing', 'succeeded']
)

export const costEntryRestoreRequestStateEnum = pgEnum(
  'cost_entry_restore_request_state',
  ['processing', 'succeeded']
)

// Accounting ledger foundation.
export const fiscalPeriodStatusEnum = pgEnum('fiscal_period_status', [
  'open',
  'closed',
])

export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
])

export const normalBalanceEnum = pgEnum('normal_balance', [
  'debit',
  'credit',
])

export const journalEntryStatusEnum = pgEnum('journal_entry_status', [
  'draft',
  'posted',
])

export const journalSourceEnum = pgEnum('journal_source', [
  'manual',
  'system',
  'reversal',
])

export const supplierBillStatusEnum = pgEnum('supplier_bill_status', [
  'draft',
  'posted',
  'reversed',
])

export const cashAccountKindEnum = pgEnum('cash_account_kind', [
  'cash',
  'bank',
  'e_wallet',
])

export const cashTransactionDirectionEnum = pgEnum(
  'cash_transaction_direction',
  ['receipt', 'disbursement']
)

export const cashTransactionStatusEnum = pgEnum('cash_transaction_status', [
  'draft',
  'posted',
  'reversed',
])

export const cashAllocationTypeEnum = pgEnum('cash_allocation_type', [
  'customer_current_due',
  'customer_retention',
  'supplier_bill',
])

export const bankStatementStatusEnum = pgEnum('bank_statement_status', [
  'draft',
  'reconciled',
  'voided',
])

export const stockReceiptStatusEnum = pgEnum('stock_receipt_status', [
  'draft',
  'posted',
  'reversed',
])

export const stockReceiptCreateRequestStateEnum = pgEnum(
  'stock_receipt_create_request_state',
  ['processing', 'succeeded']
)

export const stockMovementCreateRequestStateEnum = pgEnum(
  'stock_movement_create_request_state',
  ['processing', 'succeeded']
)

export const stockMovementWorkflowActionEnum = pgEnum(
  'stock_movement_workflow_action',
  ['post', 'reverse']
)

export const stockMovementWorkflowRequestStateEnum = pgEnum(
  'stock_movement_workflow_request_state',
  ['processing', 'succeeded']
)

export const changeRequestCreateRequestStateEnum = pgEnum(
  'change_request_create_request_state',
  ['processing', 'succeeded']
)

export const stockLedgerEventTypeEnum = pgEnum('stock_ledger_event_type', [
  'receipt',
  'receipt_reversal',
  'transfer_out',
  'transfer_in',
  'consumption',
  'adjustment',
  'movement_reversal',
])

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'transfer',
  'consumption',
  'adjustment',
])

export const stockMovementStatusEnum = pgEnum('stock_movement_status', [
  'draft',
  'posted',
  'reversed',
])

export const projectBudgetStatusEnum = pgEnum('project_budget_status', [
  'draft',
  'pending_approval',
  'approved',
  'superseded',
  'rejected',
])

export const budgetControlModeEnum = pgEnum('budget_control_mode', [
  'monitor',
  'warn',
  'block',
])

export const assetKindEnum = pgEnum('asset_kind', [
  'equipment',
  'vehicle',
  'tool',
  'fixture',
  'other',
])

export const assetStatusEnum = pgEnum('asset_status', [
  'active',
  'maintenance',
  'retired',
])

export const assetMaintenanceTypeEnum = pgEnum('asset_maintenance_type', [
  'preventive',
  'inspection',
  'repair',
  'calibration',
  'other',
])

export const assetMaintenanceCreateRequestStateEnum = pgEnum(
  'asset_maintenance_create_request_state',
  ['processing', 'succeeded']
)

export const cortexConversationTurnRequestStateEnum = pgEnum(
  'cortex_conversation_turn_request_state',
  ['processing', 'succeeded']
)

export const cortexAssistantTurnRequestStateEnum = pgEnum(
  'cortex_assistant_turn_request_state',
  ['processing', 'succeeded']
)
