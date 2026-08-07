import { createHash, createHmac } from 'node:crypto'
import { createSupabaseServerClient } from '@third-code-erp/auth'
import {
  cortexConversationAssistantTurnSignaturePayload,
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
} from '@third-code-erp/shared-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRfqThroughCoreApi,
  createPurchaseOrderFromBomThroughCoreApi,
  createPurchaseOrdersGroupedFromBomThroughCoreApi,
  createPurchaseOrderThroughCoreApi,
  createStockReceiptThroughCoreApi,
  createStockMovementThroughCoreApi,
  postStockMovementThroughCoreApi,
  reverseStockMovementThroughCoreApi,
  postStockReceiptThroughCoreApi,
  reverseStockReceiptThroughCoreApi,
  recordDeliveryReceiptThroughCoreApi,
  markDeliveryInTransitThroughCoreApi,
  startDeliverySitePreparationThroughCoreApi,
  completeDeliverySitePreparationThroughCoreApi,
  startDeliveryInspectionThroughCoreApi,
  completeDeliveryInspectionThroughCoreApi,
  cancelDeliveryThroughCoreApi,
  createChangeRequestThroughCoreApi,
  dispatchApprovedBomRfqThroughCoreApi,
  logRfqQuoteThroughCoreApi,
  getProjectThroughCoreApi,
  getProjectsThroughCoreApi,
  getAuditActivityThroughCoreApi,
  getAccountThroughCoreApi,
  getAccountsThroughCoreApi,
  getKycQueueThroughCoreApi,
  getInventorySummaryThroughCoreApi,
  getInventoryStockMovementsThroughCoreApi,
  getInventoryStockMovementDetailThroughCoreApi,
  getFinanceReceivablesThroughCoreApi,
  getFinancePayablesThroughCoreApi,
  getFinanceCashThroughCoreApi,
  getAssetsThroughCoreApi,
  getAssetThroughCoreApi,
  getAssetMaintenanceDueThroughCoreApi,
  getAssetMaintenanceThroughCoreApi,
  createAssetMaintenanceThroughCoreApi,
  getOpportunityThroughCoreApi,
  convertOpportunityToProjectThroughCoreApi,
  projectReadsUseCoreApi,
  projectListsUseCoreApi,
  auditActivityReadsUseCoreApi,
  accountReadsUseCoreApi,
  accountKycQueueReadsUseCoreApi,
  inventorySummaryReadsUseCoreApi,
  inventoryStockMovementReadsUseCoreApi,
  inventoryStockMovementDetailReadsUseCoreApi,
  financeReceivablesReadsUseCoreApi,
  financePayablesReadsUseCoreApi,
  financeCashReadsUseCoreApi,
  assetReadsUseCoreApi,
  assetMaintenanceReadsUseCoreApi,
  assetMaintenanceCreateWritesUseCoreApi,
  inventoryStockMovementCreateWritesUseCoreApi,
  inventoryStockMovementWorkflowUseCoreApi,
  opportunityReadsUseCoreApi,
  opportunityConversionWritesUseCoreApi,
  purchaseOrderWritesUseCoreApi,
  purchaseOrderBomWritesUseCoreApi,
  purchaseOrderBomGroupedWritesUseCoreApi,
  togalBomCommitWritesUseCoreApi,
  stockReceiptCreateWritesUseCoreApi,
  stockReceiptPostWritesUseCoreApi,
  stockReceiptReverseWritesUseCoreApi,
  deliveryReceiptWritesUseCoreApi,
  deliveryMarkInTransitWritesUseCoreApi,
  deliverySitePreparationStartWritesUseCoreApi,
  deliverySitePreparationCompleteWritesUseCoreApi,
  deliveryInspectionStartWritesUseCoreApi,
  deliveryInspectionCompleteWritesUseCoreApi,
  deliveryCancelWritesUseCoreApi,
  purchaseOrderWorkflowWritesUseCoreApi,
  changeRequestWritesUseCoreApi,
  rfqCreateWritesUseCoreApi,
  rfqAutoDispatchUsesCoreApi,
  rfqQuoteWritesUseCoreApi,
  rfqTerminalWritesUseCoreApi,
  transitionRfqThroughCoreApi,
  transitionPurchaseOrderThroughCoreApi,
  createProjectThroughCoreApi,
  updateProjectThroughCoreApi,
  adminUserRoleAssignmentWritesUseCoreApi,
  assignUserRoleThroughCoreApi,
  financeJournalPostWritesUseCoreApi,
  financeJournalReverseWritesUseCoreApi,
  financeSupplierBillPostWritesUseCoreApi,
  financeSupplierBillReverseWritesUseCoreApi,
  financeCashWorkflowWritesUseCoreApi,
  financeCashDraftWritesUseCoreApi,
  financeCustomerInvoiceIssueWritesUseCoreApi,
  financeCustomerInvoiceReverseWritesUseCoreApi,
  financeCustomerInvoiceCancelWritesUseCoreApi,
  postJournalEntryThroughCoreApi,
  postSupplierBillThroughCoreApi,
  reverseSupplierBillThroughCoreApi,
  postCashTransactionThroughCoreApi,
  reverseCashTransactionThroughCoreApi,
  saveCashDraftThroughCoreApi,
  deleteCashDraftThroughCoreApi,
  issueCustomerInvoiceThroughCoreApi,
  reverseCustomerInvoiceThroughCoreApi,
  cancelCustomerInvoiceThroughCoreApi,
  reverseJournalEntryThroughCoreApi,
  documentProcessingJobsUseCoreApi,
  documentDeleteWritesUseCoreApi,
  deleteDocumentThroughCoreApi,
  publicSigningWritesUseCoreApi,
  signPublicSignatureThroughCoreApi,
  enqueueDocumentProcessingThroughCoreApi,
  getDocumentProcessingStatusThroughCoreApi,
  cortexSearchUseCoreApi,
  searchCortexThroughCoreApi,
  cortexGraphReadsUseCoreApi,
  getCortexGraphThroughCoreApi,
  cortexEntityReadsUseCoreApi,
  getCortexEntityThroughCoreApi,
  cortexConversationReadsUseCoreApi,
  cortexConversationUserTurnWritesUseCoreApi,
  cortexConversationAssistantTurnWritesUseCoreApi,
  listCortexConversationsThroughCoreApi,
  getCortexConversationThroughCoreApi,
  appendCortexConversationUserTurnThroughCoreApi,
  claimCortexConversationAssistantTurnThroughCoreApi,
  completeCortexConversationAssistantTurnThroughCoreApi,
  cortexAssistantTurnIdempotencyKey,
  cortexSemanticIndexJobsUseCoreApi,
  createCortexSemanticIndexJobThroughCoreApi,
  getCortexSemanticIndexJobThroughCoreApi,
  financeLedgerReadsUseCoreApi,
  getFinanceLedgerThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFQ_ID = '44444444-4444-4444-8444-444444444444'
const RFQ_CREATE_RESULT = {
  rfqId: RFQ_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  projectId: PROJECT_ID,
  lineCount: 2,
  created: true,
}
const RFQ_QUOTE_RESULT = {
  quoteId: '55555555-5555-4555-8555-555555555555',
  created: true,
  statusChanged: true,
}
const PURCHASE_ORDER_RESULT = {
  purchaseOrderId: '66666666-6666-4666-8666-666666666666',
  tenantId: '22222222-2222-4222-8222-222222222222',
  poNumber: 'PO-0001',
  status: 'draft' as const,
}
const PURCHASE_ORDER_BOM_RESULT = {
  purchaseOrderId: PURCHASE_ORDER_RESULT.purchaseOrderId,
  tenantId: PURCHASE_ORDER_RESULT.tenantId,
  bomId: '99999999-9999-4999-8999-999999999999',
  poNumber: 'PO-0001',
  status: 'draft' as const,
}
const PURCHASE_ORDER_BOM_GROUPED_RESULT = {
  tenantId: PURCHASE_ORDER_RESULT.tenantId,
  bomId: '99999999-9999-4999-8999-999999999999',
  purchaseOrderIds: [PURCHASE_ORDER_RESULT.purchaseOrderId],
  groups: [
    {
      vendorId: '77777777-7777-4777-8777-777777777777',
      vendorName: 'Supplier',
      lineCount: 1,
      subtotalCents: 10_000,
    },
  ],
}
const PURCHASE_ORDER_WORKFLOW_RESULT = {
  purchaseOrderId: PURCHASE_ORDER_RESULT.purchaseOrderId,
  tenantId: PURCHASE_ORDER_RESULT.tenantId,
  action: 'pm_approve' as const,
  fromStatus: 'pending_pm_approval' as const,
  status: 'pending_commercial_approval' as const,
}
const STOCK_RECEIPT_RESULT = {
  stockReceiptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'draft' as const,
  lineCount: 1,
}
const STOCK_MOVEMENT_RESULT = {
  stockMovementId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'draft' as const,
  lineCount: 1,
}
const STOCK_RECEIPT_POST_RESULT = {
  stockReceiptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'posted' as const,
  receiptNumber: 'SR-2026-000001',
  journalEntryId: '77777777-7777-4777-8777-777777777777',
  journalEntryNumber: 'JE-2026-000001',
}
const STOCK_RECEIPT_REVERSE_RESULT = {
  stockReceiptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'reversed' as const,
  reversalJournalEntryId: '88888888-8888-4888-8888-888888888888',
  reversalJournalEntryNumber: 'JE-2026-000002',
}
const STOCK_MOVEMENT_POST_RESULT = {
  stockMovementId: STOCK_MOVEMENT_RESULT.stockMovementId,
  tenantId: STOCK_MOVEMENT_RESULT.tenantId,
  status: 'posted' as const,
  movementNumber: 'SM-2026-000001',
  journalEntryId: null,
  journalEntryNumber: null,
}
const STOCK_MOVEMENT_REVERSE_RESULT = {
  stockMovementId: STOCK_MOVEMENT_RESULT.stockMovementId,
  tenantId: STOCK_MOVEMENT_RESULT.tenantId,
  status: 'reversed' as const,
  reversalJournalEntryId: null,
  reversalJournalEntryNumber: null,
}
const DELIVERY_RECEIPT_RESULT = {
  deliveryScheduleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: '22222222-2222-4222-8222-222222222222',
  action: 'record_receipt' as const,
  fromStatus: 'in_transit' as const,
  status: 'received' as const,
}
const DELIVERY_IN_TRANSIT_RESULT = {
  deliveryScheduleId: DELIVERY_RECEIPT_RESULT.deliveryScheduleId,
  tenantId: DELIVERY_RECEIPT_RESULT.tenantId,
  action: 'mark_in_transit' as const,
  fromStatus: 'site_ready' as const,
  status: 'in_transit' as const,
}
const DELIVERY_INSPECTION_RESULT = {
  deliveryScheduleId: DELIVERY_RECEIPT_RESULT.deliveryScheduleId,
  tenantId: DELIVERY_RECEIPT_RESULT.tenantId,
  inspectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  action: 'start_inspection' as const,
  fromStatus: 'received' as const,
  status: 'inspecting' as const,
}
const DELIVERY_SITE_PREPARATION_RESULT = {
  deliveryScheduleId: DELIVERY_RECEIPT_RESULT.deliveryScheduleId,
  tenantId: DELIVERY_RECEIPT_RESULT.tenantId,
  action: 'start_site_preparation' as const,
  fromStatus: 'scheduled' as const,
  status: 'site_preparing' as const,
}
const DELIVERY_INSPECTION_COMPLETE_RESULT = {
  deliveryScheduleId: DELIVERY_RECEIPT_RESULT.deliveryScheduleId,
  tenantId: DELIVERY_RECEIPT_RESULT.tenantId,
  inspectionId: DELIVERY_INSPECTION_RESULT.inspectionId,
  action: 'complete_inspection' as const,
  fromStatus: 'inspecting' as const,
  inspectionResult: 'partial_pass' as const,
  status: 'accepted' as const,
  completedAt: '2026-08-02T12:00:00.000Z',
}
const DELIVERY_SITE_PREPARATION_COMPLETE_RESULT = {
  deliveryScheduleId: DELIVERY_SITE_PREPARATION_RESULT.deliveryScheduleId,
  tenantId: DELIVERY_SITE_PREPARATION_RESULT.tenantId,
  action: 'complete_site_preparation' as const,
  fromStatus: 'site_preparing' as const,
  status: 'site_ready' as const,
  sitePreparedAt: '2026-08-02T12:00:00.000Z',
}
const DELIVERY_CANCEL_RESULT = {
  deliveryScheduleId: DELIVERY_RECEIPT_RESULT.deliveryScheduleId,
  tenantId: DELIVERY_RECEIPT_RESULT.tenantId,
  action: 'cancel_delivery' as const,
  fromStatus: 'in_transit' as const,
  status: 'cancelled' as const,
  cancellationReason: 'Supplier delay',
  cancelledAt: '2026-08-02T12:00:00.000Z',
}
const JOURNAL_POST_RESULT = {
  journalEntryId: '77777777-7777-4777-8777-777777777777',
  tenantId: '22222222-2222-4222-8222-222222222222',
  postedNumber: 'JE-2026-000001',
}
const SUPPLIER_BILL_POST_RESULT = {
  supplierBillId: '33333333-3333-4333-8333-333333333333',
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'posted' as const,
  supplierBillNumber: 'SB-2026-000001',
  journalEntryId: '77777777-7777-4777-8777-777777777777',
  journalEntryNumber: 'JE-2026-000010',
}
const SUPPLIER_BILL_REVERSE_RESULT = {
  supplierBillId: SUPPLIER_BILL_POST_RESULT.supplierBillId,
  tenantId: SUPPLIER_BILL_POST_RESULT.tenantId,
  status: 'reversed' as const,
  reversalJournalEntryId: '88888888-8888-4888-8888-888888888888',
  reversalJournalEntryNumber: 'JE-2026-000011',
}
const CASH_POST_RESULT = {
  cashTransactionId: SUPPLIER_BILL_POST_RESULT.supplierBillId,
  tenantId: SUPPLIER_BILL_POST_RESULT.tenantId,
  status: 'posted' as const,
  cashTransactionNumber: 'CT-2026-000001',
  journalEntryId: JOURNAL_POST_RESULT.journalEntryId,
  journalEntryNumber: 'JE-2026-000012',
}
const CASH_REVERSE_RESULT = {
  cashTransactionId: CASH_POST_RESULT.cashTransactionId,
  tenantId: CASH_POST_RESULT.tenantId,
  status: 'reversed' as const,
  reversalJournalEntryId: '88888888-8888-4888-8888-888888888888',
  reversalJournalEntryNumber: 'JE-2026-000013',
}
const CASH_DRAFT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CASH_DRAFT_RESULT = {
  cashTransactionId: CASH_DRAFT_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'draft' as const,
}
const CASH_DRAFT_DELETE_RESULT = {
  cashTransactionId: CASH_DRAFT_ID,
  tenantId: CASH_DRAFT_RESULT.tenantId,
  status: 'deleted' as const,
}
const CUSTOMER_INVOICE_ISSUE_RESULT = {
  invoiceId: '33333333-3333-4333-8333-333333333333',
  tenantId: '22222222-2222-4222-8222-222222222222',
  status: 'issued' as const,
  invoiceNumber: 'INV-202608-001',
  journalEntryId: '77777777-7777-4777-8777-777777777777',
  journalEntryNumber: 'JE-2026-000014',
}
const CUSTOMER_INVOICE_REVERSE_RESULT = {
  invoiceId: CUSTOMER_INVOICE_ISSUE_RESULT.invoiceId,
  tenantId: CUSTOMER_INVOICE_ISSUE_RESULT.tenantId,
  status: 'cancelled' as const,
  reversalJournalEntryId: '88888888-8888-4888-8888-888888888888',
  reversalJournalEntryNumber: 'JE-2026-000015',
}
const CUSTOMER_INVOICE_CANCEL_RESULT = {
  invoiceId: CUSTOMER_INVOICE_ISSUE_RESULT.invoiceId,
  tenantId: CUSTOMER_INVOICE_ISSUE_RESULT.tenantId,
  status: 'cancelled' as const,
}
const JOURNAL_REVERSE_RESULT = {
  journalEntryId: JOURNAL_POST_RESULT.journalEntryId,
  tenantId: JOURNAL_POST_RESULT.tenantId,
  reversalJournalEntryId: '88888888-8888-4888-8888-888888888888',
  reversalNumber: 'JE-2026-000002',
}
const RFQ_TRANSITION_RESULT = {
  rfqId: RFQ_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  transitioned: true as const,
}
const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888'
const PUBLIC_SIGNING_TOKEN = 'a'.repeat(64)
const PUBLIC_SIGNING_RESULT = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  entityType: 'contract' as const,
  entityId: '33333333-3333-4333-8333-333333333333',
  signatureDocumentId: DOCUMENT_ID,
  signedAt: '2026-08-03T00:00:00.000Z',
}
const DOCUMENT_PROCESSING_JOB_ID = '99999999-9999-4999-8999-999999999999'
const DOCUMENT_PROCESSING_ACCEPTED = {
  jobId: DOCUMENT_PROCESSING_JOB_ID,
  status: 'queued' as const,
  documentId: DOCUMENT_ID,
  createdAt: '2026-08-02T00:00:00.000Z',
}
const DOCUMENT_PROCESSING_STATUS = {
  jobId: DOCUMENT_PROCESSING_JOB_ID,
  documentId: DOCUMENT_ID,
  status: 'succeeded' as const,
  attempts: 1,
  scopeItemsCreated: 3,
  draftBomId: null,
  warnings: [],
  failureCode: null,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:01:00.000Z',
}
const RESULT = {
  id: PROJECT_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  name: 'Updated Project',
  client: 'Updated Client',
  status: 'active' as const,
  projectType: 'fit_out' as const,
  totalSqm: 125,
  location: 'Makati',
  notes: 'Controlled update',
  updatedAt: '2026-07-28T00:00:00.000Z',
}
const ASSET_LIST_RESULT = {
  rows: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: RESULT.tenantId,
      assetTag: 'EQ-001',
      name: 'Scissor lift',
      kind: 'equipment' as const,
      status: 'active' as const,
      serialNumber: 'SL-001',
      manufacturer: 'LiftCo',
      model: 'S-20',
      assignedProjectId: PROJECT_ID,
      assignedProjectName: 'Warehouse fit-out',
      location: 'Makati',
      commissionedOn: '2026-08-01',
      retiredOn: null,
      notes: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}
const ASSET_DETAIL_RESULT = ASSET_LIST_RESULT.rows[0]!
const ASSET_MAINTENANCE_RESULT = {
  tenantId: RESULT.tenantId,
  assetId: ASSET_DETAIL_RESULT.id,
  rows: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenantId: RESULT.tenantId,
      assetId: ASSET_DETAIL_RESULT.id,
      maintenanceType: 'inspection' as const,
      summary: 'Annual inspection',
      performedOn: '2026-08-02',
      nextDueOn: '2027-08-02',
      vendorName: 'LiftCo Service',
      costCents: 12_500,
      notes: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-08-02T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
}
const ASSET_MAINTENANCE_DUE_RESULT = {
  tenantId: RESULT.tenantId,
  asOf: '2026-08-07',
  daysAhead: 30,
  rows: [
    {
      tenantId: RESULT.tenantId,
      assetId: ASSET_DETAIL_RESULT.id,
      assetTag: ASSET_DETAIL_RESULT.assetTag,
      assetName: ASSET_DETAIL_RESULT.name,
      assetKind: ASSET_DETAIL_RESULT.kind,
      assetStatus: ASSET_DETAIL_RESULT.status,
      assignedProjectId: ASSET_DETAIL_RESULT.assignedProjectId,
      assignedProjectName: ASSET_DETAIL_RESULT.assignedProjectName,
      location: ASSET_DETAIL_RESULT.location,
      maintenanceRecordId: ASSET_MAINTENANCE_RESULT.rows[0]!.id,
      maintenanceType: 'inspection' as const,
      summary: 'Annual inspection',
      performedOn: '2026-08-02',
      nextDueOn: '2026-08-20',
      daysUntilDue: 13,
      dueState: 'due_soon' as const,
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
}
const CREATED_PROJECT_RESULT = {
  ...RESULT,
  status: 'lead' as const,
  projectType: null,
  totalSqm: null,
  location: null,
  notes: null,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
}
const READ_PROJECT_RESULT = {
  ...CREATED_PROJECT_RESULT,
  accountId: null,
  createdBy: '11111111-1111-4111-8111-111111111111',
}
const AUDIT_ACTIVITY_RESULT = {
  tenantId: RESULT.tenantId,
  rows: [
    {
      id: '42',
      tenantId: RESULT.tenantId,
      actorId: '11111111-1111-4111-8111-111111111111',
      entityType: 'project',
      entityId: PROJECT_ID,
      action: 'update',
      prevHash: 'genesis',
      hash: 'a'.repeat(64),
      createdAt: '2026-08-05T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 200,
  totalPages: 1,
}
const FINANCE_RECEIVABLES_RESULT = {
  tenantId: RESULT.tenantId,
  asOfDate: '2026-08-06',
  rows: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      invoiceNumber: 'INV-2026-000001',
      status: 'partial_payment' as const,
      netAmountCents: 100_000,
      retentionCents: 10_000,
      withholdingTaxCents: 2_000,
      currentAllocatedCents: 25_000,
      retentionAllocatedCents: 0,
      currentOpenCents: 75_000,
      retentionOpenCents: 10_000,
      dueDate: '2026-08-01T00:00:00.000Z',
      issuedAt: '2026-07-01T00:00:00.000Z',
      issuanceJournalEntryId: '66666666-6666-4666-8666-666666666666',
      projectId: PROJECT_ID,
      projectName: 'Warehouse fit-out',
      accountId: '55555555-5555-4555-8555-555555555555',
      accountName: 'Acme Holdings',
    },
  ],
  total: 1,
  totalDueCents: 75_000,
  totalRetentionCents: 10_000,
  totalWithheldCents: 2_000,
  overdueTotalCents: 75_000,
  overdueCount: 1,
  page: 1,
  limit: 500,
  totalPages: 1,
}
const FINANCE_PAYABLES_RESULT = {
  tenantId: RESULT.tenantId,
  asOfDate: '2026-08-06',
  rows: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      vendorBillNumber: 'V-2026-001',
      internalNumber: 'SBL-2026-000001',
      status: 'posted' as const,
      billDate: '2026-07-01',
      dueDate: '2026-08-01',
      subtotalCents: 100_000,
      inputVatCents: 12_000,
      withholdingTaxCents: 2_000,
      totalPayableCents: 110_000,
      paidCents: 25_000,
      openCents: 85_000,
      postedAt: '2026-07-02T00:00:00.000Z',
      postingJournalEntryId: '66666666-6666-4666-8666-666666666666',
      vendorId: '55555555-5555-4555-8555-555555555555',
      vendorName: 'Acme Supply',
      purchaseOrderId: '77777777-7777-4777-8777-777777777777',
      purchaseOrderNumber: 'PO-2026-001',
      projectId: PROJECT_ID,
      projectName: 'Warehouse fit-out',
    },
  ],
  total: 1,
  totalPayableCents: 110_000,
  totalPaidCents: 25_000,
  totalOpenCents: 85_000,
  overdueOpenCents: 85_000,
  overdueCount: 1,
  draftCount: 0,
  postedOpenCount: 1,
  agingCurrentCents: 0,
  aging1To30Cents: 0,
  aging31To60Cents: 85_000,
  aging61To90Cents: 0,
  aging90PlusCents: 0,
  page: 1,
  limit: 500,
  totalPages: 1,
}
const FINANCE_CASH_RESULT = {
  tenantId: RESULT.tenantId,
  rows: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      internalNumber: 'CT-2026-000001',
      referenceNumber: 'BANK-001',
      direction: 'disbursement' as const,
      status: 'posted' as const,
      transactionDate: '2026-08-01',
      currency: 'PHP',
      amountCents: 85_000,
      postingJournalEntryId: '66666666-6666-4666-8666-666666666666',
      postedAt: '2026-08-01T02:00:00.000Z',
      cashAccountId: '55555555-5555-4555-8555-555555555555',
      cashAccountName: 'Operating bank',
      businessAccountId: null,
      businessAccountName: null,
      vendorId: '77777777-7777-4777-8777-777777777777',
      vendorName: 'Acme Supply',
    },
  ],
  total: 1,
  postedReceiptCents: 0,
  postedDisbursementCents: 85_000,
  draftCount: 0,
  postedCount: 1,
  reversedCount: 0,
  page: 1,
  limit: 500,
  totalPages: 1,
}
const ACCOUNT_LIST_RESULT = {
  rows: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: '22222222-2222-4222-8222-222222222222',
      name: 'Acme Office',
      industry: 'office' as const,
      billingAddress: null,
      primaryEmail: 'hello@example.test',
      primaryPhone: null,
      kycStatus: 'approved' as const,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T01:00:00.000Z',
      createdBy: null,
      opportunityCount: 2,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}
const ACCOUNT_DETAIL_RESULT = {
  account: {
    ...ACCOUNT_LIST_RESULT.rows[0],
    kycNotes: null,
    kycDecidedAt: null,
    kycDecidedBy: null,
    cnpsScoreX10: null,
  },
  contacts: [],
  kycArtifacts: [],
  opportunities: [],
  projects: [],
}
const ACCOUNT_KYC_QUEUE_RESULT = {
  rows: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: '22222222-2222-4222-8222-222222222222',
      name: 'Acme Office',
      industry: 'office' as const,
      createdAt: '2026-08-04T00:00:00.000Z',
      artifactCount: 3,
    },
  ],
  total: 201,
  limit: 200 as const,
  truncated: true,
}
const OPPORTUNITY_DETAIL_RESULT = {
  opportunity: {
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: '22222222-2222-4222-8222-222222222222',
    stage: 'lead' as const,
    tcvCents: 100_000,
    gpCents: 20_000,
    probability: 10,
    weightedTcvCents: 10_000,
    areaSqm: 100,
    opportunityType: 'fit-out',
    closingDate: '2026-08-10T00:00:00.000Z',
    accountId: '33333333-3333-4333-8333-333333333333',
    projectId: null,
    accountName: 'Acme Office',
    projectName: null,
  },
  progress: {
    latestPprfVersion: 2,
    latestInspection: {
      id: '55555555-5555-4555-8555-555555555555',
      status: 'submitted' as const,
    },
    designCount: 3,
    approvedDesignCount: 1,
    openChangeRequestCount: 2,
  },
}
const INVENTORY_SUMMARY_RESULT = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  uoms: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'EA',
      name: 'Each',
      decimalPlaces: 0,
      isActive: true,
    },
  ],
  warehouses: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
    },
  ],
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      code: 'CEMENT',
      description: 'Cement',
      baseUomId: '11111111-1111-4111-8111-111111111111',
      inventoryTracked: true,
      isActive: true,
    },
  ],
  projects: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Site A' }],
  balances: [
    {
      warehouseId: '33333333-3333-4333-8333-333333333333',
      warehouseCode: 'MAIN',
      warehouseName: 'Main store',
      itemId: '44444444-4444-4444-8444-444444444444',
      itemCode: 'CEMENT',
      itemDescription: 'Cement',
      uomCode: 'EA',
      quantityMicros: '4250000',
      valueCents: '10001',
    },
  ],
  balancesTruncated: false,
  receiptCounts: { draftCount: 1, postedCount: 2 },
} as const
const INVENTORY_STOCK_MOVEMENT_RESULT = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  rows: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      internalNumber: 'SM-2026-000001',
      movementType: 'transfer' as const,
      status: 'posted' as const,
      movementDate: '2026-08-05',
      reason: 'Move accepted materials',
      sourceWarehouseCode: 'MAIN',
      targetWarehouseCode: 'SITE-A',
      projectName: 'Site A',
      lineCount: 2,
      totalValueCents: '125000',
    },
  ],
  total: 1,
  page: 1,
  limit: 500,
  totalPages: 1,
} as const
const INVENTORY_STOCK_MOVEMENT_DETAIL_RESULT = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  movement: {
    id: '88888888-8888-4888-8888-888888888888',
    internalNumber: 'SM-2026-000001',
    movementType: 'transfer' as const,
    status: 'posted' as const,
    movementDate: '2026-08-05',
    currency: 'PHP',
    reason: 'Move accepted materials',
    sourceWarehouseCode: 'MAIN',
    sourceWarehouseName: 'Main store',
    targetWarehouseCode: 'SITE-A',
    targetWarehouseName: 'Site A',
    projectName: 'Site A project',
    postingJournalEntryId: '11111111-1111-4111-8111-111111111111',
    postingJournalNumber: 'JE-0001',
    reversalJournalEntryId: null,
    reversalJournalNumber: null,
    postedAt: '2026-08-05T00:00:00.000Z',
    reversedAt: null,
    reversalReason: null,
  },
  lines: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      lineNumber: 1,
      itemCode: 'CEMENT',
      description: 'Cement',
      uomCode: 'BAG',
      costCode: 'MAT-001',
      quantityMicros: '4250000',
      declaredUnitCostCents: '12500',
      postedUnitCostCents: '12500',
      postedValueCents: '53125',
    },
  ],
  ledger: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      eventType: 'transfer_out',
      occurredOn: '2026-08-05',
      itemCode: 'CEMENT',
      warehouseCode: 'MAIN',
      quantityDeltaMicros: '-4250000',
      valueDeltaCents: '-53125',
      reversesStockLedgerEntryId: null,
    },
  ],
} as const

describe('ERP Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'never-log-or-return-this-token',
            },
          },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps Cortex search on the legacy route unless the exact tenant gate matches', () => {
    vi.stubEnv('ERP_CORTEX_SEARCH_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(cortexSearchUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_CORTEX_SEARCH_VIA_API', 'TRUE')
    expect(cortexSearchUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_CORTEX_SEARCH_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS', '')
    expect(cortexSearchUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(cortexSearchUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Cortex graph reads on the legacy route unless the exact tenant gate matches', () => {
    vi.stubEnv('ERP_CORTEX_GRAPH_READS_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_GRAPH_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(cortexGraphReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_CORTEX_GRAPH_READS_VIA_API', 'TRUE')
    expect(cortexGraphReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_CORTEX_GRAPH_READS_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_GRAPH_READS_VIA_API_TENANT_IDS', '')
    expect(cortexGraphReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(cortexGraphReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Cortex entity reads on the legacy route unless the exact tenant gate matches', () => {
    vi.stubEnv('ERP_CORTEX_ENTITY_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CORTEX_ENTITY_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(cortexEntityReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_CORTEX_ENTITY_READS_VIA_API', 'TRUE')
    expect(cortexEntityReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_CORTEX_ENTITY_READS_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_ENTITY_READS_VIA_API_TENANT_IDS', '')
    expect(cortexEntityReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(cortexEntityReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Cortex conversation reads on the legacy route unless the exact tenant gate matches', () => {
    vi.stubEnv('ERP_CORTEX_CONVERSATION_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(cortexConversationReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_CORTEX_CONVERSATION_READS_VIA_API', 'TRUE')
    expect(cortexConversationReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_CORTEX_CONVERSATION_READS_VIA_API', 'true')
    vi.stubEnv('ERP_CORTEX_CONVERSATION_READS_VIA_API_TENANT_IDS', '')
    expect(cortexConversationReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(cortexConversationReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Cortex user-turn writes on the legacy route unless the exact tenant gate matches', () => {
    vi.stubEnv('ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(
      cortexConversationUserTurnWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)

    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API',
      'TRUE'
    )
    expect(
      cortexConversationUserTurnWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API',
      'true'
    )
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS',
      ''
    )
    expect(
      cortexConversationUserTurnWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)
  })

  it('writes one user turn through Core with idempotency', async () => {
    const result = {
      conversationId: '33333333-3333-4333-8333-333333333333',
      messageId: '44444444-4444-4444-8444-444444444444',
      status: 'created' as const,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      appendCortexConversationUserTurnThroughCoreApi(
        { content: 'What changed?' },
        'turn-1'
      )
    ).resolves.toEqual({ ok: true, data: result, status: 201 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/cortex/conversations/user-turns',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'What changed?' }),
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'Idempotency-Key': 'turn-1',
        }),
      })
    )
  })

  it('keeps assistant-turn authority closed unless the exact tenant gate matches', () => {
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API',
      'true'
    )
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(
      cortexConversationAssistantTurnWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)

    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API',
      'TRUE'
    )
    expect(
      cortexConversationAssistantTurnWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API',
      'true'
    )
    vi.stubEnv(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API_TENANT_IDS',
      ''
    )
    expect(
      cortexConversationAssistantTurnWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)
  })

  it('derives one stable assistant idempotency key without exposing the user key', () => {
    const key = cortexAssistantTurnIdempotencyKey('browser-turn-1')

    expect(key).toMatch(/^assistant-[0-9a-f]{64}$/)
    expect(key).toBe(cortexAssistantTurnIdempotencyKey('browser-turn-1'))
    expect(key).not.toContain('browser-turn-1')
    expect(key).not.toBe(cortexAssistantTurnIdempotencyKey('browser-turn-2'))
  })

  it('claims one assistant generation through signed authenticated Core', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const command = {
      conversationId: '33333333-3333-4333-8333-333333333333',
      userMessageId: '44444444-4444-4444-8444-444444444444',
    }
    const result = {
      status: 'claimed' as const,
      conversationId: command.conversationId,
      userMessageId: command.userMessageId,
      requestId: '55555555-5555-4555-8555-555555555555',
      claimToken: '66666666-6666-4666-8666-666666666666',
      leaseExpiresAt: '2026-08-08T00:01:00.000Z',
    }
    const secret = 'assistant-turn-test-secret-32-bytes-minimum'
    const idempotencyKey = 'assistant-test-claim'
    const epochMilliseconds = Date.parse('2026-08-08T00:00:00.000Z')
    vi.stubEnv('ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET', secret)
    vi.spyOn(Date, 'now').mockReturnValue(epochMilliseconds)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const timestamp = String(Math.floor(epochMilliseconds / 1_000))
    const commandDigest = createHash('sha256')
      .update(JSON.stringify(command), 'utf8')
      .digest('hex')
    const payload = cortexConversationAssistantTurnSignaturePayload({
      operation: 'claim',
      timestamp,
      tenantId: RESULT.tenantId,
      userId,
      idempotencyKey,
      commandDigest,
    })
    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')

    await expect(
      claimCortexConversationAssistantTurnThroughCoreApi(
        command,
        idempotencyKey,
        { tenantId: RESULT.tenantId, userId }
      )
    ).resolves.toEqual({ ok: true, data: result, status: 201 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/cortex/conversations/assistant-turns/claims',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'Idempotency-Key': idempotencyKey,
          'X-Third-Code-Timestamp': timestamp,
          'X-Third-Code-Cortex-Signature':
            `${CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION}=${signature}`,
        }),
      })
    )
  })

  it('fails assistant generation closed before auth or network when signing is absent', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      claimCortexConversationAssistantTurnThroughCoreApi(
        {
          conversationId: '33333333-3333-4333-8333-333333333333',
          userMessageId: '44444444-4444-4444-8444-444444444444',
        },
        'assistant-test-missing-secret',
        {
          tenantId: RESULT.tenantId,
          userId: '11111111-1111-4111-8111-111111111111',
        }
      )
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'Cortex assistant-turn signing is not configured.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('completes a claimed assistant turn through signed authenticated Core', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const command = {
      requestId: '55555555-5555-4555-8555-555555555555',
      claimToken: '66666666-6666-4666-8666-666666666666',
      content: 'Grounded answer',
      citationNodeIds: ['77777777-7777-4777-8777-777777777777'],
      outcome: 'deterministic_grounded' as const,
      model: 'deterministic-grounded',
    }
    const idempotencyKey = 'assistant-test-complete'
    const result = {
      status: 'created' as const,
      conversationId: '33333333-3333-4333-8333-333333333333',
      userMessageId: '44444444-4444-4444-8444-444444444444',
      messageId: '88888888-8888-4888-8888-888888888888',
    }
    vi.stubEnv(
      'ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET',
      'assistant-turn-test-secret-32-bytes-minimum'
    )
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      completeCortexConversationAssistantTurnThroughCoreApi(
        command,
        idempotencyKey,
        { tenantId: RESULT.tenantId, userId }
      )
    ).resolves.toEqual({ ok: true, data: result, status: 201 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/cortex/conversations/assistant-turns/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'Idempotency-Key': idempotencyKey,
          'X-Third-Code-Cortex-Signature': expect.stringMatching(
            /^v1=[0-9a-f]{64}$/
          ),
        }),
      })
    )
  })

  it('keeps provider-spending Cortex jobs closed without one exact tenant', () => {
    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(cortexSemanticIndexJobsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS', '*')
    expect(cortexSemanticIndexJobsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv(
      'ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(cortexSemanticIndexJobsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API', 'TRUE')
    expect(cortexSemanticIndexJobsUseCoreApi(RESULT.tenantId)).toBe(false)
  })

  it('keeps user role assignment on the server path unless the exact tenant gate matches', () => {
    vi.stubEnv('ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(
      adminUserRoleAssignmentWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)

    vi.stubEnv('ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API', 'TRUE')
    expect(
      adminUserRoleAssignmentWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)
    vi.stubEnv('ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API_TENANT_IDS',
      ''
    )
    expect(
      adminUserRoleAssignmentWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)
  })

  it('assigns a user role through Core with idempotency and validates scope', async () => {
    const userId = '77777777-7777-4777-8777-777777777777'
    const result = {
      userId,
      tenantId: RESULT.tenantId,
      previousRole: 'viewer' as const,
      role: 'pm' as const,
      status: 'updated' as const,
      updatedAt: '2026-08-07T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      assignUserRoleThroughCoreApi(
        userId,
        { expectedRole: 'viewer', role: 'pm' },
        'role-assignment-1'
      )
    ).resolves.toEqual({ ok: true, data: result })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/admin/users/${userId}/role`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ expectedRole: 'viewer', role: 'pm' }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'role-assignment-1',
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('calls the authenticated Core Cortex read and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              nodeType: 'invoice',
              title: 'Invoice 1042',
              summary: null,
              refTable: 'invoices',
              refId: '44444444-4444-4444-8444-444444444444',
              projectId: null,
              freshness: 'fresh',
              source: 'cortex',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchCortexThroughCoreApi('Concrete Tower')).resolves.toEqual({
      ok: true,
      data: {
        hits: [
          expect.objectContaining({ nodeType: 'invoice' }),
        ],
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/cortex/search?q=Concrete%20Tower&limit=20',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('keeps Finance ledger reads on the legacy path unless the exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_LEDGER_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeLedgerReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_LEDGER_READS_VIA_API', 'TRUE')
    expect(financeLedgerReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_LEDGER_READS_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS', '')
    expect(financeLedgerReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(financeLedgerReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('calls the authenticated Core Finance ledger read and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          rows: [],
          total: 0,
          totalDebitCents: 0,
          totalCreditCents: 0,
          page: 1,
          limit: 500,
          totalPages: 1,
          ledgerAccounts: [],
          businessAccounts: [],
          vendors: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getFinanceLedgerThroughCoreApi({
        accountId: RESULT.tenantId,
        customerId: undefined,
        vendorId: undefined,
        projectId: undefined,
        from: '2026-01-01',
        to: '2026-01-31',
        page: 1,
        limit: 500,
      })
    ).resolves.toMatchObject({ ok: true, data: { total: 0 } })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/ledger?accountId=${RESULT.tenantId}&from=2026-01-01&to=2026-01-31&page=1&limit=500`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('keeps Finance receivables reads on the legacy path unless the exact gate matches', () => {
    expect(financeReceivablesReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_FINANCE_RECEIVABLES_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeReceivablesReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_RECEIVABLES_READS_VIA_API', 'TRUE')
    expect(financeReceivablesReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_RECEIVABLES_READS_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS', '')
    expect(financeReceivablesReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(financeReceivablesReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('calls the authenticated Core Finance receivables read and validates balances', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(FINANCE_RECEIVABLES_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getFinanceReceivablesThroughCoreApi({
        accountId: '55555555-5555-4555-8555-555555555555',
        projectId: undefined,
        status: undefined,
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        page: 1,
        limit: 500,
      })
    ).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/finance/receivables?accountId=55555555-5555-4555-8555-555555555555&dueFrom=2026-08-01&dueTo=2026-08-31&page=1&limit=500',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('keeps Finance payables reads on the legacy path unless the exact gate matches', () => {
    expect(financePayablesReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_FINANCE_PAYABLES_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financePayablesReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_PAYABLES_READS_VIA_API', 'TRUE')
    expect(financePayablesReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_PAYABLES_READS_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS', '')
    expect(financePayablesReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(financePayablesReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('calls the authenticated Core Finance payables read and validates balances', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(FINANCE_PAYABLES_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getFinancePayablesThroughCoreApi({
        vendorId: '55555555-5555-4555-8555-555555555555',
        projectId: undefined,
        status: undefined,
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        page: 1,
        limit: 500,
      })
    ).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/finance/payables?vendorId=55555555-5555-4555-8555-555555555555&dueFrom=2026-08-01&dueTo=2026-08-31&page=1&limit=500',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('keeps Finance cash reads on the legacy path unless the exact gate matches', () => {
    expect(financeCashReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_FINANCE_CASH_READS_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(financeCashReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_CASH_READS_VIA_API', 'TRUE')
    expect(financeCashReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_CASH_READS_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS', '')
    expect(financeCashReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(financeCashReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('calls the authenticated Core Finance cash read and validates evidence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(FINANCE_CASH_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getFinanceCashThroughCoreApi({
        cashAccountId: '55555555-5555-4555-8555-555555555555',
        direction: 'receipt',
        status: undefined,
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        page: 1,
        limit: 500,
      })
    ).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/finance/cash-transactions?cashAccountId=55555555-5555-4555-8555-555555555555&direction=receipt&fromDate=2026-08-01&toDate=2026-08-31&page=1&limit=500',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('keeps Asset reads closed unless exact flag and tenant allowlist match', () => {
    expect(assetReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_ASSET_READS_VIA_API', 'true')
    vi.stubEnv('ERP_ASSET_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(assetReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_ASSET_READS_VIA_API', 'TRUE')
    expect(assetReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_ASSET_READS_VIA_API', 'true')
    vi.stubEnv('ERP_ASSET_READS_VIA_API_TENANT_IDS', '')
    expect(assetReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(assetReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('calls authenticated Core Asset reads with bounded filters and validates evidence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ASSET_LIST_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getAssetsThroughCoreApi({
        q: 'lift',
        kind: 'equipment',
        status: 'active',
        sort: 'asset_tag',
        order: 'asc',
        page: 1,
        limit: 20,
      })
    ).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/assets?q=lift&kind=equipment&status=active&sort=asset_tag&order=asc&page=1&limit=20',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('keeps asset maintenance gates closed until exact tenant flags match', () => {
    expect(assetMaintenanceReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(assetMaintenanceCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_ASSET_MAINTENANCE_READS_VIA_API', 'true')
    vi.stubEnv('ERP_ASSET_MAINTENANCE_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    vi.stubEnv('ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(assetMaintenanceReadsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(assetMaintenanceCreateWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    vi.stubEnv('ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API', 'TRUE')
    expect(assetMaintenanceCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)
  })

  it('calls authenticated asset detail and maintenance read/create routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(ASSET_DETAIL_RESULT), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ASSET_MAINTENANCE_RESULT), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ASSET_MAINTENANCE_DUE_RESULT), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ASSET_MAINTENANCE_RESULT.rows[0]), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getAssetThroughCoreApi(ASSET_DETAIL_RESULT.id)).resolves.toMatchObject({ ok: true })
    await expect(
      getAssetMaintenanceThroughCoreApi(ASSET_DETAIL_RESULT.id, { page: 1, limit: 50 })
    ).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    await expect(
      getAssetMaintenanceDueThroughCoreApi({ daysAhead: 30, page: 1, limit: 50 })
    ).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    await expect(
      createAssetMaintenanceThroughCoreApi(
        ASSET_DETAIL_RESULT.id,
        {
          maintenanceType: 'inspection',
          summary: 'Annual inspection',
          performedOn: '2026-08-02',
          nextDueOn: '2027-08-02',
          vendorName: 'LiftCo Service',
          costCents: 12_500,
          notes: null,
        },
        'maintenance-client-test'
      )
    ).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://erp-api.example.test/v1/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/maintenance?page=1&limit=50',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://erp-api.example.test/v1/assets/maintenance/due?daysAhead=30&page=1&limit=50',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://erp-api.example.test/v1/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/maintenance',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'maintenance-client-test' }),
      })
    )
  })

  it('keeps Project reads on the legacy path unless the exact gate matches', () => {
    vi.stubEnv('ERP_PROJECT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(projectReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PROJECT_READS_VIA_API', 'TRUE')
    expect(projectReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_READS_VIA_API_TENANT_IDS', '')
    expect(projectReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_READS_VIA_API_TENANT_IDS', '*')
    expect(projectReadsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(projectReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Project lists on the legacy path unless the exact gate matches', () => {
    vi.stubEnv('ERP_PROJECT_LISTS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_LISTS_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(projectListsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PROJECT_LISTS_VIA_API', 'TRUE')
    expect(projectListsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_LISTS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_LISTS_VIA_API_TENANT_IDS', '')
    expect(projectListsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_LISTS_VIA_API_TENANT_IDS', '*')
    expect(projectListsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(projectListsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Account reads on the legacy path unless the exact gate matches', () => {
    vi.stubEnv('ERP_ACCOUNT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_ACCOUNT_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    expect(accountReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_ACCOUNT_READS_VIA_API', 'TRUE')
    expect(accountReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_ACCOUNT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_ACCOUNT_READS_VIA_API_TENANT_IDS', '')
    expect(accountReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_ACCOUNT_READS_VIA_API_TENANT_IDS', '*')
    expect(accountReadsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(accountReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps the KYC queue read on the legacy path unless its exact gate matches', () => {
    vi.stubEnv('ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(accountKycQueueReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API', 'TRUE')
    expect(accountKycQueueReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API', 'true')
    vi.stubEnv('ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API_TENANT_IDS', '*')
    expect(accountKycQueueReadsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(accountKycQueueReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Opportunity reads on the legacy path unless the exact gate matches', () => {
    vi.stubEnv('ERP_OPPORTUNITY_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_OPPORTUNITY_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(opportunityReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_OPPORTUNITY_READS_VIA_API', 'TRUE')
    expect(opportunityReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_OPPORTUNITY_READS_VIA_API', 'true')
    vi.stubEnv('ERP_OPPORTUNITY_READS_VIA_API_TENANT_IDS', '*,bad')
    expect(opportunityReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_OPPORTUNITY_READS_VIA_API_TENANT_IDS', '*')
    expect(opportunityReadsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(opportunityReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Inventory summary reads on the legacy path unless the exact gate matches', () => {
    vi.stubEnv('ERP_INVENTORY_SUMMARY_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_INVENTORY_SUMMARY_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(inventorySummaryReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_INVENTORY_SUMMARY_READS_VIA_API', 'TRUE')
    expect(inventorySummaryReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_INVENTORY_SUMMARY_READS_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_SUMMARY_READS_VIA_API_TENANT_IDS', 'bad')
    expect(inventorySummaryReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_INVENTORY_SUMMARY_READS_VIA_API_TENANT_IDS', '*')
    expect(inventorySummaryReadsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(inventorySummaryReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Stock Movement register reads fail-closed unless the exact gate matches', () => {
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS',
      RESULT.tenantId
    )
    expect(inventoryStockMovementReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API', 'TRUE')
    expect(inventoryStockMovementReadsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS', 'bad')
    expect(inventoryStockMovementReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(inventoryStockMovementReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Stock Movement detail reads independently fail-closed', () => {
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS',
      RESULT.tenantId
    )
    expect(inventoryStockMovementDetailReadsUseCoreApi(RESULT.tenantId)).toBe(
      true
    )

    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API', 'TRUE')
    expect(inventoryStockMovementDetailReadsUseCoreApi(RESULT.tenantId)).toBe(
      false
    )

    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS', 'bad')
    expect(inventoryStockMovementDetailReadsUseCoreApi(RESULT.tenantId)).toBe(
      false
    )
    expect(inventoryStockMovementDetailReadsUseCoreApi('not-a-uuid')).toBe(
      false
    )
  })

  it('keeps Won-to-Project delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(opportunityConversionWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API', 'TRUE')
    expect(opportunityConversionWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API_TENANT_IDS', '')
    expect(opportunityConversionWritesUseCoreApi(RESULT.tenantId)).toBe(false)
    expect(opportunityConversionWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Purchase Order writes fail-closed unless its independent gate matches', () => {
    vi.stubEnv('ERP_PO_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PO_CREATE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(purchaseOrderWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PO_CREATE_WRITES_VIA_API', 'TRUE')
    expect(purchaseOrderWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PO_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PO_CREATE_WRITES_VIA_API_TENANT_IDS', '')
    expect(purchaseOrderWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_PO_CREATE_WRITES_VIA_API_TENANT_IDS',
      'not-a-uuid'
    )
    expect(purchaseOrderWritesUseCoreApi(RESULT.tenantId)).toBe(false)
  })

  it('keeps BOM Purchase Order delegation fail-closed unless its gate matches', () => {
    vi.stubEnv('ERP_PO_BOM_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(purchaseOrderBomWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PO_BOM_CREATE_WRITES_VIA_API', 'TRUE')
    expect(purchaseOrderBomWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PO_BOM_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(purchaseOrderBomWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(purchaseOrderBomWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps grouped BOM Purchase Order delegation fail-closed unless its gate matches', () => {
    vi.stubEnv('ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(purchaseOrderBomGroupedWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API', 'TRUE')
    expect(purchaseOrderBomGroupedWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(purchaseOrderBomGroupedWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(purchaseOrderBomGroupedWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Togal BOM commit delegation fail-closed unless its gate matches', () => {
    vi.stubEnv('ERP_BOM_TOGAL_COMMIT_VIA_API', 'true')
    vi.stubEnv(
      'ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(togalBomCommitWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_BOM_TOGAL_COMMIT_VIA_API', 'TRUE')
    expect(togalBomCommitWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_BOM_TOGAL_COMMIT_VIA_API', 'true')
    vi.stubEnv('ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS', '')
    expect(togalBomCommitWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS', '*')
    expect(togalBomCommitWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(togalBomCommitWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps PO workflow delegation fail-closed unless its independent gate matches', () => {
    vi.stubEnv('ERP_PO_WORKFLOW_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PO_WORKFLOW_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(purchaseOrderWorkflowWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PO_WORKFLOW_WRITES_VIA_API', 'TRUE')
    expect(purchaseOrderWorkflowWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PO_WORKFLOW_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PO_WORKFLOW_WRITES_VIA_API_TENANT_IDS', '*')
    expect(purchaseOrderWorkflowWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(purchaseOrderWorkflowWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Stock Receipt delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_INVENTORY_RECEIPT_CREATE_VIA_API', 'true')
    vi.stubEnv(
      'ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS',
      RESULT.tenantId
    )
    expect(stockReceiptCreateWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_INVENTORY_RECEIPT_CREATE_VIA_API', 'TRUE')
    expect(stockReceiptCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_INVENTORY_RECEIPT_CREATE_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS', '*')
    expect(stockReceiptCreateWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(stockReceiptCreateWritesUseCoreApi('not-a-uuid')).toBe(false)

    vi.stubEnv(
      'ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(stockReceiptCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)
  })

  it('keeps Stock Movement draft creation delegation independently fail-closed', () => {
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API', 'true')
    vi.stubEnv(
      'ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS',
      RESULT.tenantId
    )
    expect(inventoryStockMovementCreateWritesUseCoreApi(RESULT.tenantId)).toBe(
      true
    )
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API', 'TRUE')
    expect(inventoryStockMovementCreateWritesUseCoreApi(RESULT.tenantId)).toBe(
      false
    )
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS', '*')
    expect(inventoryStockMovementCreateWritesUseCoreApi(RESULT.tenantId)).toBe(
      true
    )
    expect(inventoryStockMovementCreateWritesUseCoreApi('not-a-uuid')).toBe(
      false
    )
  })

  it('keeps Stock Movement posting and reversal delegation independently fail-closed', () => {
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API', 'true')
    vi.stubEnv(
      'ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS',
      RESULT.tenantId
    )
    expect(inventoryStockMovementWorkflowUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API', 'TRUE')
    expect(inventoryStockMovementWorkflowUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS', '*')
    expect(inventoryStockMovementWorkflowUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(inventoryStockMovementWorkflowUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Stock Receipt post and reverse delegation independently fail-closed', () => {
    vi.stubEnv('ERP_INVENTORY_RECEIPT_POST_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_RECEIPT_POST_TENANT_IDS', RESULT.tenantId)
    expect(stockReceiptPostWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    vi.stubEnv('ERP_INVENTORY_RECEIPT_POST_VIA_API', 'TRUE')
    expect(stockReceiptPostWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_INVENTORY_RECEIPT_REVERSE_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS', '*')
    expect(stockReceiptReverseWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(stockReceiptReverseWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps delivery receipt delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_RECEIPT_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(deliveryReceiptWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DELIVERY_RECEIPT_WRITES_VIA_API', 'TRUE')
    expect(deliveryReceiptWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DELIVERY_RECEIPT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS', '*')
    expect(deliveryReceiptWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(deliveryReceiptWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends and validates an idempotent delivery receipt command', async () => {
    const command = { notes: 'DR-42, packaging intact' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_RECEIPT_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      recordDeliveryReceiptThroughCoreApi(
        DELIVERY_RECEIPT_RESULT.deliveryScheduleId,
        command,
        'delivery-receipt-1'
      )
    ).resolves.toEqual({ ok: true, data: DELIVERY_RECEIPT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_RECEIPT_RESULT.deliveryScheduleId}/receipt`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-receipt-1',
        }),
      })
    )
  })

  it('keeps delivery in-transit delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(deliveryMarkInTransitWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API', 'TRUE')
    expect(deliveryMarkInTransitWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API_TENANT_IDS', '*')
    expect(deliveryMarkInTransitWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(deliveryMarkInTransitWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends and validates an idempotent delivery in-transit command', async () => {
    const command = {}
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_IN_TRANSIT_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      markDeliveryInTransitThroughCoreApi(
        DELIVERY_IN_TRANSIT_RESULT.deliveryScheduleId,
        command,
        'delivery-in-transit-1'
      )
    ).resolves.toEqual({ ok: true, data: DELIVERY_IN_TRANSIT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_IN_TRANSIT_RESULT.deliveryScheduleId}/in-transit`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-in-transit-1',
        }),
      })
    )
  })

  it('keeps delivery site-preparation-start delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(
      deliverySitePreparationStartWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)

    vi.stubEnv('ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API', 'TRUE')
    expect(
      deliverySitePreparationStartWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)

    vi.stubEnv('ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(
      deliverySitePreparationStartWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)
    expect(deliverySitePreparationStartWritesUseCoreApi('not-a-uuid')).toBe(
      false
    )
  })

  it('sends and validates an idempotent delivery site-preparation-start command', async () => {
    const command = {}
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_SITE_PREPARATION_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      startDeliverySitePreparationThroughCoreApi(
        DELIVERY_SITE_PREPARATION_RESULT.deliveryScheduleId,
        command,
        'delivery-site-preparation-1'
      )
    ).resolves.toEqual({ ok: true, data: DELIVERY_SITE_PREPARATION_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_SITE_PREPARATION_RESULT.deliveryScheduleId}/site-preparation/start`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-site-preparation-1',
        }),
      })
    )
  })

  it('keeps delivery site-preparation-completion delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(
      deliverySitePreparationCompleteWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)

    vi.stubEnv('ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API', 'TRUE')
    expect(
      deliverySitePreparationCompleteWritesUseCoreApi(RESULT.tenantId)
    ).toBe(false)

    vi.stubEnv('ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(
      deliverySitePreparationCompleteWritesUseCoreApi(RESULT.tenantId)
    ).toBe(true)
    expect(deliverySitePreparationCompleteWritesUseCoreApi('not-a-uuid')).toBe(
      false
    )
  })

  it('sends and validates an idempotent site-preparation-completion command', async () => {
    const command = { notes: 'Staging bay and hoist cleared' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_SITE_PREPARATION_COMPLETE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      completeDeliverySitePreparationThroughCoreApi(
        DELIVERY_SITE_PREPARATION_COMPLETE_RESULT.deliveryScheduleId,
        command,
        'delivery-site-preparation-complete-1'
      )
    ).resolves.toEqual({
      ok: true,
      data: DELIVERY_SITE_PREPARATION_COMPLETE_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_SITE_PREPARATION_COMPLETE_RESULT.deliveryScheduleId}/site-preparation/complete`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-site-preparation-complete-1',
        }),
      })
    )
  })

  it('keeps delivery inspection-start delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(deliveryInspectionStartWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API', 'TRUE')
    expect(deliveryInspectionStartWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS', '*')
    expect(deliveryInspectionStartWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(deliveryInspectionStartWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends and validates an idempotent delivery inspection-start command', async () => {
    const command = {}
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_INSPECTION_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      startDeliveryInspectionThroughCoreApi(
        DELIVERY_INSPECTION_RESULT.deliveryScheduleId,
        command,
        'delivery-inspection-1'
      )
    ).resolves.toEqual({ ok: true, data: DELIVERY_INSPECTION_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_INSPECTION_RESULT.deliveryScheduleId}/inspection/start`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-inspection-1',
        }),
      })
    )
  })

  it('keeps delivery inspection-complete delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(deliveryInspectionCompleteWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API', 'TRUE')
    expect(deliveryInspectionCompleteWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(deliveryInspectionCompleteWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(deliveryInspectionCompleteWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends and validates an idempotent delivery inspection-complete command', async () => {
    const command = {
      result: 'partial_pass' as const,
      defectNotes: 'Two brackets scratched',
      acceptanceNotes: 'Replace next visit',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_INSPECTION_COMPLETE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      completeDeliveryInspectionThroughCoreApi(
        DELIVERY_INSPECTION_COMPLETE_RESULT.deliveryScheduleId,
        command,
        'delivery-inspection-complete-1'
      )
    ).resolves.toEqual({
      ok: true,
      data: DELIVERY_INSPECTION_COMPLETE_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_INSPECTION_COMPLETE_RESULT.deliveryScheduleId}/inspection/complete`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-inspection-complete-1',
        }),
      })
    )
  })

  it('keeps delivery cancellation delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DELIVERY_CANCEL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(deliveryCancelWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DELIVERY_CANCEL_WRITES_VIA_API', 'TRUE')
    expect(deliveryCancelWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DELIVERY_CANCEL_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS', '*')
    expect(deliveryCancelWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(deliveryCancelWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends and validates an idempotent delivery cancellation command', async () => {
    const command = { reason: 'Supplier delay' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELIVERY_CANCEL_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      cancelDeliveryThroughCoreApi(
        DELIVERY_CANCEL_RESULT.deliveryScheduleId,
        command,
        'delivery-cancel-1'
      )
    ).resolves.toEqual({ ok: true, data: DELIVERY_CANCEL_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/deliveries/${DELIVERY_CANCEL_RESULT.deliveryScheduleId}/cancel`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-cancel-1',
        }),
      })
    )
  })

  it('sends an idempotent Stock Receipt command and validates result', async () => {
    const command = {
      warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      purchaseOrderId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      deliveryScheduleId: null,
      supplierDeliveryReference: 'DR-000184',
      receivedDate: '2026-08-02',
      notes: null,
      lines: [
        {
          poLineItemId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          quantity: '12.500000',
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(STOCK_RECEIPT_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createStockReceiptThroughCoreApi(command, 'stock-receipt-1')
    ).resolves.toEqual({ ok: true, data: STOCK_RECEIPT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/inventory/stock-receipts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
        headers: expect.objectContaining({
          'Idempotency-Key': 'stock-receipt-1',
        }),
      })
    )
  })

  it('sends an idempotent Stock Movement command and validates result', async () => {
    const command = {
      movementType: 'transfer' as const,
      sourceWarehouseId: '33333333-3333-4333-8333-333333333333',
      targetWarehouseId: '44444444-4444-4444-8444-444444444444',
      projectId: null,
      movementDate: '2026-08-05',
      reason: 'Move accepted materials',
      lines: [
        {
          materialItemId: '55555555-5555-4555-8555-555555555555',
          quantity: '1.25',
          costCodeId: null,
          declaredUnitCostPhp: null,
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(STOCK_MOVEMENT_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createStockMovementThroughCoreApi(command, 'stock-movement-1')
    ).resolves.toEqual({ ok: true, data: STOCK_MOVEMENT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/inventory/stock-movements',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
        headers: expect.objectContaining({
          'Idempotency-Key': 'stock-movement-1',
        }),
      })
    )
  })

  it('fails closed when Stock Receipt core returns an invalid result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...STOCK_RECEIPT_RESULT, lineCount: 0 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    await expect(
      createStockReceiptThroughCoreApi(
        {
          warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          purchaseOrderId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          receivedDate: '2026-08-02',
          lines: [
            {
              poLineItemId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              quantity: '1',
            },
          ],
        },
        'stock-receipt-1'
      )
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid Stock Receipt result.',
    })
  })

  it('calls the authenticated Core Cortex graph read and validates the response', async () => {
    const nodeId = '33333333-3333-4333-8333-333333333333'
    const refId = '44444444-4444-4444-8444-444444444444'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          focusNodeId: nodeId,
          nodes: [
            {
              id: nodeId,
              type: 'journal_entry',
              title: 'Journal 1042',
              refTable: 'journal_entries',
              refId,
              projectId: null,
            },
          ],
          links: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getCortexGraphThroughCoreApi({
        refTable: 'journal_entries',
        refId,
      })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ focusNodeId: nodeId }),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/cortex/graph?refTable=journal_entries&refId=${refId}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('rejects a Cortex graph response with the wrong focus shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ nodes: [], links: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getCortexGraphThroughCoreApi({
        refTable: 'journal_entries',
        refId: '44444444-4444-4444-8444-444444444444',
      })
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'ERP Core API returned an invalid Cortex graph result.',
    })
  })

  it('calls the authenticated Core Cortex entity read and validates the response', async () => {
    const refId = '44444444-4444-4444-8444-444444444444'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          found: true,
          summary: 'Journal context',
          citations: [],
          relationships: [],
          evidence: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getCortexEntityThroughCoreApi({
        refTable: 'journal_entries',
        refId,
      })
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ summary: 'Journal context' }),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/cortex/entity/journal_entries/${refId}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('calls authenticated Core Cortex conversation list and detail reads', async () => {
    const conversationId = '33333333-3333-4333-8333-333333333333'
    const timestamp = '2026-08-07T00:00:00.000Z'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conversations: [
              {
                id: conversationId,
                title: 'Finance thread',
                created_at: timestamp,
                updated_at: timestamp,
                context: null,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ context: null, messages: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listCortexConversationsThroughCoreApi()).resolves.toEqual({
      ok: true,
      data: {
        conversations: [
          expect.objectContaining({ id: conversationId, context: null }),
        ],
      },
    })
    await expect(
      getCortexConversationThroughCoreApi(conversationId)
    ).resolves.toEqual({
      ok: true,
      data: { context: null, messages: [] },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://erp-api.example.test/v1/cortex/conversations',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://erp-api.example.test/v1/cortex/conversations/${conversationId}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    )
  })

  it('rejects an invalid Core Cortex conversation projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ conversations: [], tenantId: 'leak' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    await expect(listCortexConversationsThroughCoreApi()).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'ERP Core API returned an invalid Cortex conversation list.',
    })
  })

  it('rejects an invalid Cortex entity success payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            found: false,
            summary: '',
            citations: [],
            relationships: [],
            evidence: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )

    await expect(
      getCortexEntityThroughCoreApi({
        refTable: 'journal_entries',
        refId: '44444444-4444-4444-8444-444444444444',
      })
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'ERP Core API returned an invalid Cortex entity result.',
    })
  })

  it('creates one cost-consented Cortex index job through authenticated Core', async () => {
    const jobId = '44444444-4444-4444-8444-444444444444'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jobId,
          status: 'queued',
          maxNodes: 64,
          backlogAtRequest: 90,
          createdAt: '2026-08-07T00:00:00.000Z',
        }),
        { status: 202, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createCortexSemanticIndexJobThroughCoreApi(
        { maxNodes: 64, costConsent: true },
        'index-1'
      )
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ jobId, status: 'queued' }),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/cortex/semantic-index-jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ maxNodes: 64, costConsent: true }),
        headers: expect.objectContaining({
          'idempotency-key': 'index-1',
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('polls and validates one Cortex semantic index job', async () => {
    const jobId = '44444444-4444-4444-8444-444444444444'
    const payload = {
      jobId,
      status: 'succeeded',
      maxNodes: 64,
      backlogAtRequest: 64,
      processedNodes: 64,
      attempts: 1,
      providerCalls: 1,
      failureCode: null,
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:01:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getCortexSemanticIndexJobThroughCoreApi(jobId)
    ).resolves.toEqual({ ok: true, data: payload })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/cortex/semantic-index-jobs/${jobId}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    )
  })

  it('rejects a Core semantic index state above the one-call ceiling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jobId: '44444444-4444-4444-8444-444444444444',
            status: 'processing',
            maxNodes: 64,
            backlogAtRequest: 64,
            processedNodes: 0,
            attempts: 1,
            providerCalls: 2,
            failureCode: null,
            createdAt: '2026-08-07T00:00:00.000Z',
            updatedAt: '2026-08-07T00:01:00.000Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )
    await expect(
      getCortexSemanticIndexJobThroughCoreApi(
        '44444444-4444-4444-8444-444444444444'
      )
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'ERP Core API returned an invalid semantic index status.',
    })
  })

  it('sends and validates Stock Receipt post and reverse commands', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(STOCK_RECEIPT_POST_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(STOCK_RECEIPT_REVERSE_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      postStockReceiptThroughCoreApi(
        STOCK_RECEIPT_RESULT.stockReceiptId,
        { postingDate: '2026-08-02' },
        'stock-receipt-post-1'
      )
    ).resolves.toEqual({ ok: true, data: STOCK_RECEIPT_POST_RESULT })
    await expect(
      reverseStockReceiptThroughCoreApi(
        STOCK_RECEIPT_RESULT.stockReceiptId,
        { postingDate: '2026-08-02', reason: 'Supplier correction' },
        'stock-receipt-reverse-1'
      )
    ).resolves.toEqual({ ok: true, data: STOCK_RECEIPT_REVERSE_RESULT })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://erp-api.example.test/v1/inventory/stock-receipts/${STOCK_RECEIPT_RESULT.stockReceiptId}/post`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'stock-receipt-post-1',
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://erp-api.example.test/v1/inventory/stock-receipts/${STOCK_RECEIPT_RESULT.stockReceiptId}/reverse`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'stock-receipt-reverse-1',
        }),
      })
    )
  })

  it('sends and validates idempotent Stock Movement post and reverse commands', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(STOCK_MOVEMENT_POST_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(STOCK_MOVEMENT_REVERSE_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      postStockMovementThroughCoreApi(
        STOCK_MOVEMENT_RESULT.stockMovementId,
        {},
        'stock-movement-post-1'
      )
    ).resolves.toEqual({ ok: true, data: STOCK_MOVEMENT_POST_RESULT, status: 200 })
    await expect(
      reverseStockMovementThroughCoreApi(
        STOCK_MOVEMENT_RESULT.stockMovementId,
        { reason: 'Supplier correction', reversalDate: '2026-08-05' },
        'stock-movement-reverse-1'
      )
    ).resolves.toEqual({
      ok: true,
      data: STOCK_MOVEMENT_REVERSE_RESULT,
      status: 200,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://erp-api.example.test/v1/inventory/stock-movements/${STOCK_MOVEMENT_RESULT.stockMovementId}/post`,
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: expect.objectContaining({
          'Idempotency-Key': 'stock-movement-post-1',
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://erp-api.example.test/v1/inventory/stock-movements/${STOCK_MOVEMENT_RESULT.stockMovementId}/reverse`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reason: 'Supplier correction',
          reversalDate: '2026-08-05',
        }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'stock-movement-reverse-1',
        }),
      })
    )
  })

  it('keeps finance journal posting delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeJournalPostWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API', 'TRUE')
    expect(financeJournalPostWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(financeJournalPostWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(financeJournalPostWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps finance journal reversal delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeJournalReverseWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API', 'TRUE')
    expect(financeJournalReverseWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(financeJournalReverseWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(financeJournalReverseWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Supplier Bill posting delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeSupplierBillPostWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API', 'TRUE')
    expect(financeSupplierBillPostWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(financeSupplierBillPostWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(financeSupplierBillPostWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps Supplier Bill reversal delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeSupplierBillReverseWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API', 'TRUE')
    expect(financeSupplierBillReverseWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(financeSupplierBillReverseWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(financeSupplierBillReverseWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps cash posting and reversal delegation fail-closed unless one exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeCashWorkflowWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API', 'TRUE')
    expect(financeCashWorkflowWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API_TENANT_IDS', '*')
    expect(financeCashWorkflowWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(financeCashWorkflowWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps cash draft delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(financeCashDraftWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API', 'TRUE')
    expect(financeCashDraftWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API_TENANT_IDS', '*')
    expect(financeCashDraftWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(financeCashDraftWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps customer invoice issuance delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API_TENANT_IDS',
      CUSTOMER_INVOICE_ISSUE_RESULT.tenantId
    )
    expect(
      financeCustomerInvoiceIssueWritesUseCoreApi(
        CUSTOMER_INVOICE_ISSUE_RESULT.tenantId
      )
    ).toBe(true)

    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API', 'TRUE')
    expect(
      financeCustomerInvoiceIssueWritesUseCoreApi(
        CUSTOMER_INVOICE_ISSUE_RESULT.tenantId
      )
    ).toBe(false)

    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(
      financeCustomerInvoiceIssueWritesUseCoreApi(
        CUSTOMER_INVOICE_ISSUE_RESULT.tenantId
      )
    ).toBe(true)
    expect(financeCustomerInvoiceIssueWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps customer invoice reversal delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API_TENANT_IDS',
      CUSTOMER_INVOICE_REVERSE_RESULT.tenantId
    )
    expect(
      financeCustomerInvoiceReverseWritesUseCoreApi(
        CUSTOMER_INVOICE_REVERSE_RESULT.tenantId
      )
    ).toBe(true)

    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API', 'TRUE')
    expect(
      financeCustomerInvoiceReverseWritesUseCoreApi(
        CUSTOMER_INVOICE_REVERSE_RESULT.tenantId
      )
    ).toBe(false)

    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(
      financeCustomerInvoiceReverseWritesUseCoreApi(
        CUSTOMER_INVOICE_REVERSE_RESULT.tenantId
      )
    ).toBe(true)
    expect(financeCustomerInvoiceReverseWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps customer invoice cancellation delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API_TENANT_IDS',
      CUSTOMER_INVOICE_CANCEL_RESULT.tenantId
    )
    expect(
      financeCustomerInvoiceCancelWritesUseCoreApi(
        CUSTOMER_INVOICE_CANCEL_RESULT.tenantId
      )
    ).toBe(true)

    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API', 'TRUE')
    expect(
      financeCustomerInvoiceCancelWritesUseCoreApi(
        CUSTOMER_INVOICE_CANCEL_RESULT.tenantId
      )
    ).toBe(false)

    vi.stubEnv('ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API_TENANT_IDS',
      '*'
    )
    expect(
      financeCustomerInvoiceCancelWritesUseCoreApi(
        CUSTOMER_INVOICE_CANCEL_RESULT.tenantId
      )
    ).toBe(true)
    expect(financeCustomerInvoiceCancelWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends an idempotent cash posting command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CASH_POST_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      postCashTransactionThroughCoreApi(
        CASH_POST_RESULT.cashTransactionId,
        { postingDate: '2026-08-02' },
        'cash-post-1'
      )
    ).resolves.toEqual({ ok: true, data: CASH_POST_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/cash-transactions/${CASH_POST_RESULT.cashTransactionId}/post`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ postingDate: '2026-08-02' }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'cash-post-1',
        }),
      })
    )
  })

  it('sends an idempotent cash reversal command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CASH_REVERSE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      reverseCashTransactionThroughCoreApi(
        CASH_REVERSE_RESULT.cashTransactionId,
        { reason: 'Bank returned transfer', postingDate: '2026-08-03' },
        'cash-reverse-1'
      )
    ).resolves.toEqual({ ok: true, data: CASH_REVERSE_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/cash-transactions/${CASH_REVERSE_RESULT.cashTransactionId}/reverse`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reason: 'Bank returned transfer',
          postingDate: '2026-08-03',
        }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'cash-reverse-1',
        }),
      })
    )
  })

  it('sends an idempotent cash draft save and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CASH_DRAFT_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const command = {
      cashAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      direction: 'receipt' as const,
      counterpartyId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      referenceNumber: 'RCPT-001',
      transactionDate: '2026-08-03',
      notes: null,
      allocations: [
        {
          allocationType: 'customer_current_due' as const,
          targetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          description: null,
          amountCents: 10_000,
        },
      ],
    }
    await expect(
      saveCashDraftThroughCoreApi(command, 'cash-draft-save-1')
    ).resolves.toEqual({ ok: true, data: CASH_DRAFT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/finance/cash-transactions/drafts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'cash-draft-save-1',
        }),
      })
    )
  })

  it('sends an idempotent cash draft deletion and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CASH_DRAFT_DELETE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteCashDraftThroughCoreApi(CASH_DRAFT_ID, 'cash-draft-delete-1')
    ).resolves.toEqual({ ok: true, data: CASH_DRAFT_DELETE_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/cash-transactions/${CASH_DRAFT_ID}/draft`,
      expect.objectContaining({
        method: 'DELETE',
        body: '{}',
        headers: expect.objectContaining({
          'Idempotency-Key': 'cash-draft-delete-1',
        }),
      })
    )
  })

  it('sends an idempotent customer invoice issuance command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CUSTOMER_INVOICE_ISSUE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      issueCustomerInvoiceThroughCoreApi(
        CUSTOMER_INVOICE_ISSUE_RESULT.invoiceId,
        { postingDate: '2026-08-03' },
        'invoice-issue-1'
      )
    ).resolves.toEqual({ ok: true, data: CUSTOMER_INVOICE_ISSUE_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/customer-invoices/${CUSTOMER_INVOICE_ISSUE_RESULT.invoiceId}/issue`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ postingDate: '2026-08-03' }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'invoice-issue-1',
        }),
      })
    )
  })

  it('sends an idempotent customer invoice reversal command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CUSTOMER_INVOICE_REVERSE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      reverseCustomerInvoiceThroughCoreApi(
        CUSTOMER_INVOICE_REVERSE_RESULT.invoiceId,
        {
          reason: 'Customer-approved correction',
          postingDate: '2026-08-03',
        },
        'invoice-reverse-1'
      )
    ).resolves.toEqual({ ok: true, data: CUSTOMER_INVOICE_REVERSE_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/customer-invoices/${CUSTOMER_INVOICE_REVERSE_RESULT.invoiceId}/reverse`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reason: 'Customer-approved correction',
          postingDate: '2026-08-03',
        }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'invoice-reverse-1',
        }),
      })
    )
  })

  it('sends an idempotent customer invoice cancellation command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CUSTOMER_INVOICE_CANCEL_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      cancelCustomerInvoiceThroughCoreApi(
        CUSTOMER_INVOICE_CANCEL_RESULT.invoiceId,
        {},
        'invoice-cancel-1'
      )
    ).resolves.toEqual({ ok: true, data: CUSTOMER_INVOICE_CANCEL_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/customer-invoices/${CUSTOMER_INVOICE_CANCEL_RESULT.invoiceId}/cancel`,
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: expect.objectContaining({
          'Idempotency-Key': 'invoice-cancel-1',
        }),
      })
    )
  })

  it('keeps document processing delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DOCUMENT_PROCESSING_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DOCUMENT_PROCESSING_TENANT_IDS',
      RESULT.tenantId
    )
    expect(documentProcessingJobsUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DOCUMENT_PROCESSING_VIA_API', 'TRUE')
    expect(documentProcessingJobsUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DOCUMENT_PROCESSING_VIA_API', 'true')
    vi.stubEnv('ERP_DOCUMENT_PROCESSING_TENANT_IDS', '*')
    expect(documentProcessingJobsUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(documentProcessingJobsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps document deletion delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_DOCUMENT_DELETE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(documentDeleteWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_DOCUMENT_DELETE_WRITES_VIA_API', 'TRUE')
    expect(documentDeleteWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_DOCUMENT_DELETE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(documentDeleteWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(documentDeleteWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends an idempotent document deletion and validates the result', async () => {
    const result = {
      documentId: DOCUMENT_ID,
      tenantId: RESULT.tenantId,
      projectId: PROJECT_ID,
      storagePath: `${RESULT.tenantId}/${PROJECT_ID}/drawing.dwg`,
      status: 'deleted' as const,
      derivedScopeItemsRemoved: 2,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteDocumentThroughCoreApi(DOCUMENT_ID, 'document-delete-1')
    ).resolves.toEqual({ ok: true, data: result })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/documents/${DOCUMENT_ID}`,
      expect.objectContaining({
        method: 'DELETE',
        body: '{}',
        headers: expect.objectContaining({
          'Idempotency-Key': 'document-delete-1',
        }),
      })
    )
  })

  it('returns a terminal error when document deletion Core is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }))
    )

    await expect(
      deleteDocumentThroughCoreApi(DOCUMENT_ID, 'document-delete-2')
    ).resolves.toEqual({
      ok: false,
      error: 'Document was not deleted.',
    })
  })

  it('keeps public signing delegation fail-closed unless its exact gate matches', () => {
    vi.stubEnv('ERP_PUBLIC_SIGNING_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PUBLIC_SIGNING_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(publicSigningWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_PUBLIC_SIGNING_VIA_API', 'TRUE')
    expect(publicSigningWritesUseCoreApi(RESULT.tenantId)).toBe(false)
  })

  it('posts a token-authorized signature without forwarding an authenticated bearer', async () => {
    const body = {
      signerName: 'Ana Reyes',
      signerEmail: 'ana@example.com',
      signatureDataUrl: 'data:image/png;base64,abc=',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PUBLIC_SIGNING_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      signPublicSignatureThroughCoreApi(
        PUBLIC_SIGNING_TOKEN,
        body,
        'public-signing-1'
      )
    ).resolves.toEqual({ ok: true, data: PUBLIC_SIGNING_RESULT })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/public/signatures/${PUBLIC_SIGNING_TOKEN}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        headers: expect.objectContaining({
          'Idempotency-Key': 'public-signing-1',
        }),
      })
    )
    expect(request.headers).not.toHaveProperty('authorization')
  })

  it('returns a terminal error when Core signing is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }))
    )
    await expect(
      signPublicSignatureThroughCoreApi(
        PUBLIC_SIGNING_TOKEN,
        {
          signerName: 'Ana Reyes',
          signerEmail: null,
          signatureDataUrl: 'data:image/png;base64,abc=',
        },
        'public-signing-2'
      )
    ).resolves.toEqual({ ok: false, error: 'Could not record signature. Try again.' })
  })

  it('queues idempotent document processing and validates accepted output', async () => {
    const command = {
      mode: 'cad' as const,
      requestedFormat: 'dwg' as const,
      createDraftBom: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DOCUMENT_PROCESSING_ACCEPTED), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      enqueueDocumentProcessingThroughCoreApi(
        DOCUMENT_ID,
        command,
        'cad-processing-1'
      )
    ).resolves.toEqual({ ok: true, data: DOCUMENT_PROCESSING_ACCEPTED })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/documents/${DOCUMENT_ID}/processing-jobs`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'cad-processing-1',
        }),
      })
    )
  })

  it('reads tenant-scoped document processing status through core', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DOCUMENT_PROCESSING_STATUS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getDocumentProcessingStatusThroughCoreApi(DOCUMENT_PROCESSING_JOB_ID)
    ).resolves.toEqual({ ok: true, data: DOCUMENT_PROCESSING_STATUS })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/document-processing-jobs/${DOCUMENT_PROCESSING_JOB_ID}`,
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('keeps Change Request delegation fail-closed unless its independent gate matches', () => {
    vi.stubEnv('ERP_CHANGE_REQUEST_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_CHANGE_REQUEST_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(changeRequestWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_CHANGE_REQUEST_WRITES_VIA_API', 'TRUE')
    expect(changeRequestWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_CHANGE_REQUEST_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_CHANGE_REQUEST_WRITES_VIA_API_TENANT_IDS', '*')
    expect(changeRequestWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(changeRequestWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends an idempotent Change Request command and validates result', async () => {
    const result = {
      changeRequestId: '66666666-6666-4666-8666-666666666666',
      tenantId: RESULT.tenantId,
      status: 'open' as const,
      created: true,
    }
    const command = {
      requestedByName: 'Client PM',
      description: 'Move the wall.',
      priority: 'minor' as const,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createChangeRequestThroughCoreApi(
        '33333333-3333-4333-8333-333333333333',
        command,
        'change-request-1'
      )
    ).resolves.toEqual({ ok: true, data: result })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/crm/opportunities/33333333-3333-4333-8333-333333333333/change-requests',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({
          'Idempotency-Key': 'change-request-1',
        }),
      })
    )
  })

  it('sends an idempotent Purchase Order command and validates result', async () => {
    const command = {
      projectId: PROJECT_ID,
      vendorId: null,
      deliveryDate: null,
      notes: null,
      lines: [
        {
          description: 'Concrete',
          quantity: 1,
          unitCostCents: 10_000,
          costCodeId: '77777777-7777-4777-8777-777777777777',
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PURCHASE_ORDER_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createPurchaseOrderThroughCoreApi(command, 'po-create-1')
    ).resolves.toEqual({ ok: true, data: PURCHASE_ORDER_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/procurement/purchase-orders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
        headers: expect.objectContaining({
          'Idempotency-Key': 'po-create-1',
        }),
      })
    )
  })

  it('does not fall back to a direct write when core rejects the command', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'command disabled' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    await expect(
      createPurchaseOrderThroughCoreApi(
        {
          projectId: PROJECT_ID,
          vendorId: null,
          deliveryDate: null,
          notes: null,
          lines: [
            {
              description: 'Concrete',
              quantity: 1,
              unitCostCents: 10_000,
              costCodeId: '77777777-7777-4777-8777-777777777777',
            },
          ],
        },
        'po-create-1'
      )
    ).resolves.toEqual({ ok: false, error: 'command disabled' })
  })

  it('sends an idempotent BOM Purchase Order command and validates result', async () => {
    const command = {
      bomId: PURCHASE_ORDER_BOM_RESULT.bomId,
      projectId: PROJECT_ID,
      vendorId: null,
      deliveryDate: null,
      notes: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PURCHASE_ORDER_BOM_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createPurchaseOrderFromBomThroughCoreApi(command, 'bom-po-create-1')
    ).resolves.toEqual({ ok: true, data: PURCHASE_ORDER_BOM_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/procurement/purchase-orders/from-bom',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
        headers: expect.objectContaining({
          'Idempotency-Key': 'bom-po-create-1',
        }),
      })
    )
  })

  it('sends a keyed PO workflow command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PURCHASE_ORDER_WORKFLOW_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionPurchaseOrderThroughCoreApi(
        PURCHASE_ORDER_RESULT.purchaseOrderId,
        { action: 'pm_approve' },
        'po-workflow-1'
      )
    ).resolves.toEqual({
      ok: true,
      data: PURCHASE_ORDER_WORKFLOW_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/procurement/purchase-orders/66666666-6666-4666-8666-666666666666/workflow',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'pm_approve' }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'po-workflow-1',
        }),
      })
    )
  })

  it('sends an idempotent journal post command and validates result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(JOURNAL_POST_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      postJournalEntryThroughCoreApi(
        JOURNAL_POST_RESULT.journalEntryId,
        'journal-post-1'
      )
    ).resolves.toEqual({ ok: true, data: JOURNAL_POST_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/finance/journals/77777777-7777-4777-8777-777777777777/post',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          journalEntryId: JOURNAL_POST_RESULT.journalEntryId,
        }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'journal-post-1',
        }),
      })
    )
  })

  it('sends an idempotent journal reversal command and validates result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(JOURNAL_REVERSE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      reverseJournalEntryThroughCoreApi(
        JOURNAL_REVERSE_RESULT.journalEntryId,
        {
          reason: 'Correct duplicate accrual',
          postingDate: '2026-08-02',
        },
        'journal-reverse-1'
      )
    ).resolves.toEqual({ ok: true, data: JOURNAL_REVERSE_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/journals/${JOURNAL_REVERSE_RESULT.journalEntryId}/reverse`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reason: 'Correct duplicate accrual',
          postingDate: '2026-08-02',
        }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'journal-reverse-1',
        }),
      })
    )
  })

  it('sends an idempotent Supplier Bill posting command and validates result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SUPPLIER_BILL_POST_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      postSupplierBillThroughCoreApi(
        SUPPLIER_BILL_POST_RESULT.supplierBillId,
        { postingDate: '2026-08-02' },
        'supplier-bill-post-1'
      )
    ).resolves.toEqual({ ok: true, data: SUPPLIER_BILL_POST_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/supplier-bills/${SUPPLIER_BILL_POST_RESULT.supplierBillId}/post`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ postingDate: '2026-08-02' }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'supplier-bill-post-1',
        }),
      })
    )
  })

  it('sends an idempotent Supplier Bill reversal command and validates result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SUPPLIER_BILL_REVERSE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      reverseSupplierBillThroughCoreApi(
        SUPPLIER_BILL_REVERSE_RESULT.supplierBillId,
        {
          reason: 'Vendor issued a corrected bill',
          postingDate: '2026-08-02',
        },
        'supplier-bill-reverse-1'
      )
    ).resolves.toEqual({ ok: true, data: SUPPLIER_BILL_REVERSE_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/finance/supplier-bills/${SUPPLIER_BILL_REVERSE_RESULT.supplierBillId}/reverse`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reason: 'Vendor issued a corrected bill',
          postingDate: '2026-08-02',
        }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'supplier-bill-reverse-1',
        }),
      })
    )
  })

  it('forwards a UUID correlation header to the Nest command', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateProjectThroughCoreApi(PROJECT_ID, {
        name: RESULT.name,
        client: RESULT.client,
        status: RESULT.status,
        projectType: RESULT.projectType,
        totalSqm: RESULT.totalSqm,
        location: RESULT.location,
        notes: RESULT.notes,
        expectedUpdatedAt: '2026-07-27T00:00:00.000Z',
      })
    ).resolves.toEqual({ ok: true, data: RESULT })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(request.headers).toMatchObject({
      authorization: 'Bearer never-log-or-return-this-token',
      'content-type': 'application/json',
      'x-request-id': expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
    })
  })

  it('creates a Project through the Nest command boundary and validates its response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CREATED_PROJECT_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createProjectThroughCoreApi({
        name: 'New Project',
        client: 'New Client',
        status: 'lead',
        projectType: null,
        totalSqm: null,
        location: null,
        notes: null,
      }, 'project-create-1')
    ).resolves.toEqual({ ok: true, data: CREATED_PROJECT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/projects',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'project-create-1',
        }),
        body: JSON.stringify({
          name: 'New Project',
          client: 'New Client',
          status: 'lead',
          projectType: null,
          totalSqm: null,
          location: null,
          notes: null,
        }),
      })
    )
  })

  it('converts a won Opportunity through the Nest command boundary', async () => {
    const result = {
      ok: true as const,
      opportunityId: '33333333-3333-4333-8333-333333333333',
      projectId: PROJECT_ID,
      checklistId: '55555555-5555-4555-8555-555555555555',
      tenantId: RESULT.tenantId,
      createdProject: true,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      convertOpportunityToProjectThroughCoreApi(
        result.opportunityId,
        'opportunity-convert-1'
      )
    ).resolves.toEqual({ ok: true, data: result, status: 200 })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/opportunities/${result.opportunityId}/convert-to-project`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'opportunity-convert-1',
        }),
        body: '{}',
      })
    )
  })

  it('reads a Project through the Nest boundary and validates ownership metadata', async () => {
    vi.stubEnv('ERP_PROJECT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_READS_VIA_API_TENANT_IDS', RESULT.tenantId)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(READ_PROJECT_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getProjectThroughCoreApi(PROJECT_ID)
    ).resolves.toEqual({ ok: true, data: READ_PROJECT_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('keeps audit activity adapter fail-closed and validates the redacted result', async () => {
    expect(auditActivityReadsUseCoreApi(RESULT.tenantId)).toBe(false)
    vi.stubEnv('ERP_AUDIT_ACTIVITY_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_AUDIT_ACTIVITY_READS_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(auditActivityReadsUseCoreApi(RESULT.tenantId)).toBe(true)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(AUDIT_ACTIVITY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getAuditActivityThroughCoreApi({
        entityIds: [PROJECT_ID],
        page: 1,
        limit: 200,
      })
    ).resolves.toEqual({ ok: true, data: AUDIT_ACTIVITY_RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/audit/activity?entityIds=${PROJECT_ID}&page=1&limit=200`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('lists Projects through the Nest boundary and validates the result envelope', async () => {
    const query = {
      q: 'office',
      status: 'active' as const,
      projectType: 'fit_out' as const,
      sort: 'name' as const,
      order: 'asc' as const,
      page: 2,
      limit: 50,
    }
    const listResult = {
      rows: [READ_PROJECT_RESULT],
      total: 51,
      page: 2,
      limit: 50,
      totalPages: 2,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(listResult), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProjectsThroughCoreApi(query)).resolves.toEqual({
      ok: true,
      data: listResult,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/projects?q=office&status=active&projectType=fit_out&sort=name&order=asc&page=2&limit=50',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('lists Accounts through the Nest boundary and validates the result envelope', async () => {
    const query = {
      q: 'office',
      industry: 'office' as const,
      kycStatus: 'approved' as const,
      sort: 'name' as const,
      order: 'asc' as const,
      page: 1,
      limit: 20,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ACCOUNT_LIST_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getAccountsThroughCoreApi(query)).resolves.toEqual({
      ok: true,
      data: ACCOUNT_LIST_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/crm/accounts?q=office&industry=office&kycStatus=approved&sort=name&order=asc&page=1&limit=20',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('reads an Account detail graph through the Nest boundary', async () => {
    const accountId = '33333333-3333-4333-8333-333333333333'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ACCOUNT_DETAIL_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getAccountThroughCoreApi(accountId)).resolves.toEqual({
      ok: true,
      data: ACCOUNT_DETAIL_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/accounts/${accountId}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('reads the KYC queue through the Nest boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ACCOUNT_KYC_QUEUE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getKycQueueThroughCoreApi()).resolves.toEqual({
      ok: true,
      data: ACCOUNT_KYC_QUEUE_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/crm/accounts/kyc-queue',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('reads the Inventory summary through the Nest boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(INVENTORY_SUMMARY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getInventorySummaryThroughCoreApi()).resolves.toEqual({
      ok: true,
      data: INVENTORY_SUMMARY_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/inventory/summary',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('reads the Stock Movement register through the Nest boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(INVENTORY_STOCK_MOVEMENT_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getInventoryStockMovementsThroughCoreApi({
        movementType: 'transfer',
        status: 'posted',
        page: 1,
        limit: 500,
      })
    ).resolves.toEqual({
      ok: true,
      data: INVENTORY_STOCK_MOVEMENT_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/inventory/stock-movements?movementType=transfer&status=posted&page=1&limit=500',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('reads Stock Movement detail through the Nest boundary', async () => {
    const movementId = INVENTORY_STOCK_MOVEMENT_DETAIL_RESULT.movement.id
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(INVENTORY_STOCK_MOVEMENT_DETAIL_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getInventoryStockMovementDetailThroughCoreApi(movementId)
    ).resolves.toEqual({
      ok: true,
      data: INVENTORY_STOCK_MOVEMENT_DETAIL_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/inventory/stock-movements/${movementId}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
        }),
      })
    )
  })

  it('reads an Opportunity detail through the Nest boundary', async () => {
    const opportunityId = OPPORTUNITY_DETAIL_RESULT.opportunity.id
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(OPPORTUNITY_DETAIL_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getOpportunityThroughCoreApi(opportunityId)).resolves.toEqual({
      ok: true,
      data: OPPORTUNITY_DETAIL_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/opportunities/${opportunityId}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('maps an Opportunity detail 404 to a not-found result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    )

    await expect(
      getOpportunityThroughCoreApi(OPPORTUNITY_DETAIL_RESULT.opportunity.id)
    ).resolves.toEqual({ ok: false, error: 'Opportunity not found.' })
  })

  it('maps an Account detail 404 to a not-found result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    )

    await expect(
      getAccountThroughCoreApi('33333333-3333-4333-8333-333333333333')
    ).resolves.toEqual({ ok: false, error: 'Account not found.' })
  })

  it('keeps RFQ quote writes on the legacy path unless its exact flag and tenant match', () => {
    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API', 'TRUE')
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(rfqQuoteWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('keeps RFQ creation legacy unless its independent gate matches', () => {
    vi.stubEnv('ERP_RFQ_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(rfqCreateWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_RFQ_CREATE_WRITES_VIA_API', 'TRUE')
    expect(rfqCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(rfqCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS',
      'not-a-uuid'
    )
    expect(rfqCreateWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(rfqCreateWritesUseCoreApi(RESULT.tenantId)).toBe(true)
  })

  it('keeps automatic RFQ dispatch on Inngest unless its independent gate matches', () => {
    vi.stubEnv('ERP_RFQ_AUTO_DISPATCH_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(rfqAutoDispatchUsesCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_RFQ_AUTO_DISPATCH_VIA_API', 'TRUE')
    expect(rfqAutoDispatchUsesCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_AUTO_DISPATCH_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(rfqAutoDispatchUsesCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS',
      '*'
    )
    expect(rfqAutoDispatchUsesCoreApi(RESULT.tenantId)).toBe(true)
    expect(rfqAutoDispatchUsesCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends a strict RFQ creation command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RFQ_CREATE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createRfqThroughCoreApi({ bomId: PROJECT_ID })
    ).resolves.toEqual({
      ok: true,
      data: RFQ_CREATE_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/procurement/rfqs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ bomId: PROJECT_ID }),
        cache: 'no-store',
      })
    )
  })

  it('fails closed on an invalid RFQ creation result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...RFQ_CREATE_RESULT,
            lineCount: -1,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    )

    await expect(
      createRfqThroughCoreApi({ bomId: PROJECT_ID })
    ).resolves.toEqual({
      ok: false,
      error:
        'ERP Core API returned an invalid RFQ creation result.',
    })
  })

  it('queues strict approved-BOM dispatch and validates the result', async () => {
    const result = {
      jobId:
        'rfq1-22222222-2222-4222-8222-222222222222-33333333-3333-4333-8333-333333333333',
      enqueued: true,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      dispatchApprovedBomRfqThroughCoreApi({
        bomId: PROJECT_ID,
      })
    ).resolves.toEqual({ ok: true, data: result })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/procurement/rfqs/dispatch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ bomId: PROJECT_ID }),
        cache: 'no-store',
      })
    )
  })

  it('fails closed on an invalid automatic dispatch result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jobId: '',
            enqueued: true,
          }),
          {
            status: 202,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    )

    await expect(
      dispatchApprovedBomRfqThroughCoreApi({
        bomId: PROJECT_ID,
      })
    ).resolves.toEqual({
      ok: false,
      error:
        'ERP Core API returned an invalid RFQ dispatch result.',
    })
  })

  it('sends a strict RFQ quote command and validates the result', async () => {
    const command = {
      submissionId: '66666666-6666-4666-8666-666666666666',
      bomLineItemId: '77777777-7777-4777-8777-777777777777',
      vendorId: '88888888-8888-4888-8888-888888888888',
      unitPriceCents: 125_050,
      leadTimeDays: 14,
      validUntil: '2026-08-31T00:00:00.000Z',
      notes: 'Includes delivery',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RFQ_QUOTE_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      logRfqQuoteThroughCoreApi(RFQ_ID, command)
    ).resolves.toEqual({
      ok: true,
      data: RFQ_QUOTE_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/rfqs/${RFQ_ID}/quotes`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
      })
    )
  })

  it('keeps RFQ terminal writes legacy unless its independent gate matches', () => {
    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API', 'TRUE')
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS',
      'not-a-uuid'
    )
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS', '*')
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(true)
  })

  it('sends a strict RFQ terminal command and validates the result', async () => {
    const command = {
      command: 'cancel' as const,
      reason: 'Supplier withdrew',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RFQ_TRANSITION_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionRfqThroughCoreApi(RFQ_ID, command)
    ).resolves.toEqual({
      ok: true,
      data: RFQ_TRANSITION_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/rfqs/${RFQ_ID}/transitions`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
      })
    )
  })

  it('fails closed on an invalid RFQ terminal result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...RFQ_TRANSITION_RESULT,
            transitioned: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    )

    await expect(
      transitionRfqThroughCoreApi(RFQ_ID, {
        command: 'complete',
      })
    ).resolves.toEqual({
      ok: false,
      error:
        'ERP Core API returned an invalid RFQ transition result.',
    })
  })

  it('sends an idempotent grouped BOM Purchase Order command and validates result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PURCHASE_ORDER_BOM_GROUPED_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const command = { bomId: PURCHASE_ORDER_BOM_RESULT.bomId }
    await expect(
      createPurchaseOrdersGroupedFromBomThroughCoreApi(
        command,
        'grouped-bom-po-create-1'
      )
    ).resolves.toEqual({
      ok: true,
      data: PURCHASE_ORDER_BOM_GROUPED_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/procurement/purchase-orders/from-bom/grouped',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'grouped-bom-po-create-1',
        }),
      })
    )
  })
})
