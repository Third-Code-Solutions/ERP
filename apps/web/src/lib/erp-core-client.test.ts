import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRfqThroughCoreApi,
  createPurchaseOrderFromBomThroughCoreApi,
  createPurchaseOrdersGroupedFromBomThroughCoreApi,
  createPurchaseOrderThroughCoreApi,
  createStockReceiptThroughCoreApi,
  postStockReceiptThroughCoreApi,
  reverseStockReceiptThroughCoreApi,
  recordDeliveryReceiptThroughCoreApi,
  startDeliverySitePreparationThroughCoreApi,
  completeDeliverySitePreparationThroughCoreApi,
  startDeliveryInspectionThroughCoreApi,
  completeDeliveryInspectionThroughCoreApi,
  cancelDeliveryThroughCoreApi,
  createChangeRequestThroughCoreApi,
  dispatchApprovedBomRfqThroughCoreApi,
  logRfqQuoteThroughCoreApi,
  projectWritesUseCoreApi,
  purchaseOrderWritesUseCoreApi,
  purchaseOrderBomWritesUseCoreApi,
  purchaseOrderBomGroupedWritesUseCoreApi,
  stockReceiptCreateWritesUseCoreApi,
  stockReceiptPostWritesUseCoreApi,
  stockReceiptReverseWritesUseCoreApi,
  deliveryReceiptWritesUseCoreApi,
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
  updateProjectThroughCoreApi,
  financeJournalPostWritesUseCoreApi,
  financeJournalReverseWritesUseCoreApi,
  financeSupplierBillPostWritesUseCoreApi,
  financeSupplierBillReverseWritesUseCoreApi,
  postJournalEntryThroughCoreApi,
  postSupplierBillThroughCoreApi,
  reverseSupplierBillThroughCoreApi,
  reverseJournalEntryThroughCoreApi,
  documentProcessingJobsUseCoreApi,
  enqueueDocumentProcessingThroughCoreApi,
  getDocumentProcessingStatusThroughCoreApi,
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
const DELIVERY_RECEIPT_RESULT = {
  deliveryScheduleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: '22222222-2222-4222-8222-222222222222',
  action: 'record_receipt' as const,
  fromStatus: 'in_transit' as const,
  status: 'received' as const,
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

describe('ERP Core client', () => {
  beforeEach(() => {
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

  it('keeps legacy writes active unless the flag and tenant allowlist both match', () => {
    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', '')
    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'false')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'TRUE')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API_TENANT_IDS', '')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      ` ${RESULT.tenantId},aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa `
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API_TENANT_IDS', '*')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(projectWritesUseCoreApi('not-a-uuid')).toBe(false)
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
