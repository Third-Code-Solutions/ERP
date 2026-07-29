import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createRfqFromBomRecord: vi.fn(),
  notifyRfqCreated: vi.fn(),
  logRfqQuoteRecord: vi.fn(),
  rfqQuoteWritesUseCoreApi: vi.fn(),
  logRfqQuoteThroughCoreApi: vi.fn(),
  rfqTerminalWritesUseCoreApi: vi.fn(),
  transitionRfqThroughCoreApi: vi.fn(),
  transitionRfqRecord: vi.fn(),
  notifyRfqCompleted: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {},
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
}))

vi.mock('@/lib/procurement/rfq-service', () => ({
  createRfqFromBomRecord: mocks.createRfqFromBomRecord,
  notifyRfqCreated: mocks.notifyRfqCreated,
}))

vi.mock('@/lib/procurement/rfq-workflow-service', () => ({
  logRfqQuoteRecord: mocks.logRfqQuoteRecord,
  transitionRfqRecord: mocks.transitionRfqRecord,
  notifyRfqCompleted: mocks.notifyRfqCompleted,
}))

vi.mock('@/lib/erp-core-client', () => ({
  rfqQuoteWritesUseCoreApi: mocks.rfqQuoteWritesUseCoreApi,
  logRfqQuoteThroughCoreApi: mocks.logRfqQuoteThroughCoreApi,
  rfqTerminalWritesUseCoreApi:
    mocks.rfqTerminalWritesUseCoreApi,
  transitionRfqThroughCoreApi:
    mocks.transitionRfqThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  cancelRfq,
  completeRfq,
  createRfqFromBom,
  logQuote,
} from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RFQ_ID = '55555555-5555-4555-8555-555555555555'
const LINE_ID = '66666666-6666-4666-8666-666666666666'
const VENDOR_ID = '77777777-7777-4777-8777-777777777777'
const SUBMISSION_ID = '88888888-8888-4888-8888-888888888888'

describe('RFQ Server Action authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.can.mockReturnValue(true)
    mocks.createRfqFromBomRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 1,
      created: true,
    })
    mocks.notifyRfqCreated.mockResolvedValue(undefined)
    mocks.logRfqQuoteRecord.mockResolvedValue({
      quoteId: '99999999-9999-4999-8999-999999999999',
      created: true,
      statusChanged: true,
    })
    mocks.rfqQuoteWritesUseCoreApi.mockReturnValue(false)
    mocks.logRfqQuoteThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        quoteId: '99999999-9999-4999-8999-999999999999',
        created: true,
        statusChanged: true,
      },
    })
    mocks.rfqTerminalWritesUseCoreApi.mockReturnValue(false)
    mocks.transitionRfqThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rfqId: RFQ_ID,
        tenantId: TENANT_ID,
        transitioned: true,
      },
    })
    mocks.transitionRfqRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      transitioned: true,
    })
    mocks.notifyRfqCompleted.mockResolvedValue(undefined)
  })

  it('ignores an injected system option and derives tenant/actor from auth', async () => {
    const invokeWithInjectedOption = createRfqFromBom as unknown as (
      bomId: string,
      option: { systemTenantId: string }
    ) => Promise<unknown>

    await expect(
      invokeWithInjectedOption(BOM_ID, {
        systemTenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).resolves.toEqual({ rfqId: RFQ_ID })

    expect(mocks.requireUserProfile).toHaveBeenCalledOnce()
    expect(mocks.createRfqFromBomRecord).toHaveBeenCalledWith({
      bomId: BOM_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      source: 'manual',
    })
    expect(mocks.notifyRfqCreated).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/procurement/rfqs'
    )
  })

  it('denies a manual caller without rfq.dispatch', async () => {
    mocks.can.mockReturnValue(false)

    await expect(createRfqFromBom(BOM_ID)).resolves.toEqual({
      error:
        'Forbidden: role "procurement" lacks "rfq.dispatch"',
    })
    expect(mocks.createRfqFromBomRecord).not.toHaveBeenCalled()
  })

  it('does not duplicate notification when the transaction returns a retry', async () => {
    mocks.createRfqFromBomRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 1,
      created: false,
    })

    await expect(createRfqFromBom(BOM_ID)).resolves.toEqual({
      rfqId: RFQ_ID,
    })
    expect(mocks.notifyRfqCreated).not.toHaveBeenCalled()
  })

  it('keeps the committed RFQ successful when post-commit notification fails', async () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    mocks.notifyRfqCreated.mockRejectedValue(
      new Error('notification unavailable')
    )

    await expect(createRfqFromBom(BOM_ID)).resolves.toEqual({
      rfqId: RFQ_ID,
    })
    expect(warn).toHaveBeenCalledWith(
      '[createRfqFromBom] notification dispatch failed'
    )
    warn.mockRestore()
  })

  it('forwards a bounded quote command with server-derived authority', async () => {
    const formData = new FormData()
    formData.set('rfq_id', RFQ_ID)
    formData.set('bom_line_item_id', LINE_ID)
    formData.set('vendor_id', VENDOR_ID)
    formData.set('submission_id', SUBMISSION_ID)
    formData.set('unit_price_cents', '125050')
    formData.set('lead_time_days', '14')
    formData.set('valid_until', '2026-08-31T00:00:00.000Z')
    formData.set('notes', '  Includes delivery  ')

    await expect(logQuote(formData)).resolves.toEqual({})

    expect(mocks.logRfqQuoteRecord).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      rfqId: RFQ_ID,
      bomLineItemId: LINE_ID,
      vendorId: VENDOR_ID,
      submissionId: SUBMISSION_ID,
      unitPriceCents: 125050,
      leadTimeDays: 14,
      validUntil: new Date('2026-08-31T00:00:00.000Z'),
      notes: 'Includes delivery',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/procurement/rfqs/${RFQ_ID}`
    )
  })

  it('rejects an unkeyed quote before transaction authority', async () => {
    const formData = new FormData()
    formData.set('rfq_id', RFQ_ID)
    formData.set('bom_line_item_id', LINE_ID)
    formData.set('vendor_id', VENDOR_ID)
    formData.set('unit_price_cents', '100')

    const result = await logQuote(formData)

    expect(result.error).toContain('submission_id')
    expect(mocks.logRfqQuoteRecord).not.toHaveBeenCalled()
  })

  it('uses the Nest quote command only for an explicitly enabled tenant', async () => {
    mocks.rfqQuoteWritesUseCoreApi.mockReturnValue(true)
    const formData = new FormData()
    formData.set('rfq_id', RFQ_ID)
    formData.set('bom_line_item_id', LINE_ID)
    formData.set('vendor_id', VENDOR_ID)
    formData.set('submission_id', SUBMISSION_ID)
    formData.set('unit_price_cents', '125050')
    formData.set('lead_time_days', '14')
    formData.set('valid_until', '2026-08-31T00:00:00.000Z')
    formData.set('notes', '  Includes delivery  ')

    await expect(logQuote(formData)).resolves.toEqual({})

    expect(mocks.logRfqQuoteThroughCoreApi).toHaveBeenCalledWith(
      RFQ_ID,
      {
        submissionId: SUBMISSION_ID,
        bomLineItemId: LINE_ID,
        vendorId: VENDOR_ID,
        unitPriceCents: 125050,
        leadTimeDays: 14,
        validUntil: '2026-08-31T00:00:00.000Z',
        notes: 'Includes delivery',
      }
    )
    expect(mocks.logRfqQuoteRecord).not.toHaveBeenCalled()
  })

  it('fails closed when the enabled Nest quote command is unavailable', async () => {
    mocks.rfqQuoteWritesUseCoreApi.mockReturnValue(true)
    mocks.logRfqQuoteThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No quote was committed.',
    })
    const formData = new FormData()
    formData.set('rfq_id', RFQ_ID)
    formData.set('bom_line_item_id', LINE_ID)
    formData.set('vendor_id', VENDOR_ID)
    formData.set('submission_id', SUBMISSION_ID)
    formData.set('unit_price_cents', '100')

    await expect(logQuote(formData)).resolves.toEqual({
      error: 'ERP Core API is unavailable. No quote was committed.',
    })
    expect(mocks.logRfqQuoteRecord).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('completes through the transaction service then notifies', async () => {
    await expect(completeRfq(RFQ_ID)).resolves.toEqual({})

    expect(mocks.transitionRfqRecord).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      rfqId: RFQ_ID,
      command: 'complete',
    })
    expect(mocks.notifyRfqCompleted).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      rfqId: RFQ_ID,
    })
  })

  it('keeps a completed transition successful when notification fails', async () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    mocks.notifyRfqCompleted.mockRejectedValue(
      new Error('notification unavailable')
    )

    await expect(completeRfq(RFQ_ID)).resolves.toEqual({})
    expect(warn).toHaveBeenCalledWith(
      '[completeRfq] notification dispatch failed'
    )
    warn.mockRestore()
  })

  it('completes through Nest only for an explicitly enabled tenant', async () => {
    mocks.rfqTerminalWritesUseCoreApi.mockReturnValue(true)

    await expect(completeRfq(RFQ_ID)).resolves.toEqual({})

    expect(mocks.transitionRfqThroughCoreApi).toHaveBeenCalledWith(
      RFQ_ID,
      { command: 'complete' }
    )
    expect(mocks.transitionRfqRecord).not.toHaveBeenCalled()
    expect(mocks.notifyRfqCompleted).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      rfqId: RFQ_ID,
    })
  })

  it('trims cancellation reason before transaction authority', async () => {
    await expect(
      cancelRfq(RFQ_ID, '  Supplier withdrew  ')
    ).resolves.toEqual({})

    expect(mocks.transitionRfqRecord).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      rfqId: RFQ_ID,
      command: 'cancel',
      reason: 'Supplier withdrew',
    })
  })

  it('rejects an oversized cancellation reason before mutation', async () => {
    await expect(cancelRfq(RFQ_ID, 'x'.repeat(1001))).resolves.toEqual({
      error: 'Cancellation reason must be 1000 characters or fewer',
    })
    expect(mocks.transitionRfqRecord).not.toHaveBeenCalled()
  })

  it('fails closed when the enabled Nest cancellation is unavailable', async () => {
    mocks.rfqTerminalWritesUseCoreApi.mockReturnValue(true)
    mocks.transitionRfqThroughCoreApi.mockResolvedValue({
      ok: false,
      error:
        'ERP Core API is unavailable. No RFQ transition was committed.',
    })

    await expect(
      cancelRfq(RFQ_ID, 'Supplier withdrew')
    ).resolves.toEqual({
      error:
        'ERP Core API is unavailable. No RFQ transition was committed.',
    })
    expect(mocks.transitionRfqRecord).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
