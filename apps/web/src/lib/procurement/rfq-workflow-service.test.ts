import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  notifyRoles: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction:
    mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

import {
  logRfqQuoteRecord,
  notifyRfqCompleted,
  transitionRfqRecord,
} from './rfq-workflow-service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const RFQ_ID = '33333333-3333-4333-8333-333333333333'
const LINE_ID = '44444444-4444-4444-8444-444444444444'
const SECOND_LINE_ID = '55555555-5555-4555-8555-555555555555'
const VENDOR_ID = '66666666-6666-4666-8666-666666666666'
const MATERIAL_ID = '77777777-7777-4777-8777-777777777777'
const SUBMISSION_ID = '88888888-8888-4888-8888-888888888888'
const QUOTE_ID = '99999999-9999-4999-8999-999999999999'

const quoteParams = {
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
}

function line(
  id = LINE_ID,
  materialItemId: string | null = MATERIAL_ID
) {
  return {
    bom_line_item_id: id,
    material_item_id: materialItemId,
    code: materialItemId ? 'MAT-001' : null,
    description: 'Concrete board',
    qty: 4,
    unit: 'pc',
  }
}

function transactionHarness(
  selectResults: unknown[][],
  options: {
    insertReturning?: unknown[]
    updateReturning?: unknown[]
  } = {}
) {
  const execute = vi.fn().mockResolvedValue([])
  const conditions: unknown[] = []
  const joins: unknown[] = []

  const select = vi.fn(() => {
    const result = selectResults.shift()
    if (!result) throw new Error('Unexpected select')

    const chain: Record<string, unknown> = {}
    chain.from = vi.fn(() => chain)
    chain.leftJoin = vi.fn(
      (_table: unknown, condition: unknown) => {
        joins.push(condition)
        return chain
      }
    )
    chain.where = vi.fn((condition: unknown) => {
      conditions.push(condition)
      return chain
    })
    chain.limit = vi.fn(() => chain)
    chain.for = vi.fn(async () => result)
    chain.then = (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
    return chain
  })

  const insertReturning = vi
    .fn()
    .mockResolvedValue(
      options.insertReturning ?? [{ id: QUOTE_ID }]
    )
  const insertValues = vi.fn(() => ({
    returning: insertReturning,
  }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const updateReturning = vi
    .fn()
    .mockResolvedValue(
      options.updateReturning ?? [{ id: RFQ_ID }]
    )
  const updateWhere = vi.fn(() => ({
    returning: updateReturning,
  }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const tx = {
    execute,
    select,
    insert,
    update,
  }
  mocks.transaction.mockImplementationOnce(
    async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx)
  )

  return {
    tx,
    execute,
    select,
    insert,
    insertValues,
    update,
    updateSet,
    conditions,
    joins,
  }
}

describe('RFQ quote workflow service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
    mocks.notifyRoles.mockResolvedValue(undefined)
  })

  it('locks submission and RFQ then commits quote, status, and audits together', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [line()],
        },
      ],
      [],
      [{ id: VENDOR_ID }],
      [{ id: MATERIAL_ID }],
    ])

    await expect(
      logRfqQuoteRecord(quoteParams)
    ).resolves.toEqual({
      quoteId: QUOTE_ID,
      created: true,
      statusChanged: true,
    })

    expect(harness.execute).toHaveBeenCalledOnce()
    expect(harness.insert).toHaveBeenCalledOnce()
    expect(harness.update).toHaveBeenCalledOnce()
    expect(
      mocks.writeAuditLogInTransaction
    ).toHaveBeenNthCalledWith(
      1,
      harness.tx,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        entityType: 'rfq_quote',
        entityId: QUOTE_ID,
        action: 'create',
      })
    )
    expect(
      mocks.writeAuditLogInTransaction
    ).toHaveBeenNthCalledWith(
      2,
      harness.tx,
      expect.objectContaining({
        entityType: 'rfq',
        entityId: RFQ_ID,
        action: 'status_change',
        diff: {
          from: 'pending',
          to: 'quotes_received',
          source: 'first_quote',
        },
      })
    )
  })

  it('returns exact retry after terminal transition without another write', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'completed',
          line_items: [line()],
        },
      ],
      [
        {
          id: QUOTE_ID,
          rfq_id: RFQ_ID,
          bom_line_item_id: LINE_ID,
          vendor_id: VENDOR_ID,
          material_item_id: MATERIAL_ID,
          unit_price_cents: 125050,
          lead_time_days: 14,
          valid_until: new Date(
            '2026-08-31T00:00:00.000Z'
          ),
          notes: 'Includes delivery',
        },
      ],
    ])

    await expect(
      logRfqQuoteRecord(quoteParams)
    ).resolves.toEqual({
      quoteId: QUOTE_ID,
      created: false,
      statusChanged: false,
    })
    expect(harness.insert).not.toHaveBeenCalled()
    expect(harness.update).not.toHaveBeenCalled()
    expect(
      mocks.writeAuditLogInTransaction
    ).not.toHaveBeenCalled()
  })

  it('rejects reused submission identity with different content', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [line()],
        },
      ],
      [
        {
          id: QUOTE_ID,
          rfq_id: RFQ_ID,
          bom_line_item_id: LINE_ID,
          vendor_id: VENDOR_ID,
          material_item_id: MATERIAL_ID,
          unit_price_cents: 999,
          lead_time_days: 14,
          valid_until: quoteParams.validUntil,
          notes: quoteParams.notes,
        },
      ],
    ])

    await expect(
      logRfqQuoteRecord(quoteParams)
    ).resolves.toEqual({
      error: 'Quote submission conflict',
    })
    expect(harness.insert).not.toHaveBeenCalled()
  })

  it('stops a missing or cross-tenant vendor before insert', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [line(LINE_ID, null)],
        },
      ],
      [],
      [],
    ])

    await expect(
      logRfqQuoteRecord({
        ...quoteParams,
        validUntil: undefined,
        notes: undefined,
      })
    ).resolves.toEqual({ error: 'Vendor not found' })
    expect(harness.insert).not.toHaveBeenCalled()
    expect(
      mocks.writeAuditLogInTransaction
    ).not.toHaveBeenCalled()
  })

  it('rejects audit failure so quote and status can roll back', async () => {
    transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [line(LINE_ID, null)],
        },
      ],
      [],
      [{ id: VENDOR_ID }],
    ])
    mocks.writeAuditLogInTransaction.mockRejectedValue(
      new Error('audit unavailable')
    )

    await expect(
      logRfqQuoteRecord({
        ...quoteParams,
        validUntil: undefined,
        notes: undefined,
      })
    ).rejects.toThrow('audit unavailable')
  })

  it('completes only after every stable RFQ line has quote coverage', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [line(), line(SECOND_LINE_ID, null)],
        },
      ],
      [
        {
          bom_line_item_id: LINE_ID,
          material_item_id: MATERIAL_ID,
          material_code: 'MAT-001',
        },
        {
          bom_line_item_id: SECOND_LINE_ID,
          material_item_id: null,
          material_code: null,
        },
      ],
    ])

    await expect(
      transitionRfqRecord({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        rfqId: RFQ_ID,
        command: 'complete',
      })
    ).resolves.toEqual({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      transitioned: true,
    })
    expect(harness.update).toHaveBeenCalledOnce()
    expect(
      mocks.writeAuditLogInTransaction
    ).toHaveBeenCalledWith(harness.tx, {
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      entityType: 'rfq',
      entityId: RFQ_ID,
      action: 'status_change',
      diff: {
        from: 'quotes_received',
        to: 'completed',
      },
    })
  })

  it('rejects incomplete quote coverage before status mutation', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [line(), line(SECOND_LINE_ID, null)],
        },
      ],
      [
        {
          bom_line_item_id: LINE_ID,
          material_item_id: MATERIAL_ID,
          material_code: 'MAT-001',
        },
      ],
    ])

    await expect(
      transitionRfqRecord({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        rfqId: RFQ_ID,
        command: 'complete',
      })
    ).resolves.toEqual({
      error: 'RFQ quote coverage is incomplete',
    })
    expect(harness.update).not.toHaveBeenCalled()
  })

  it('keeps completed and cancelled states terminal without duplicate audit', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'completed',
          line_items: [line()],
        },
      ],
    ])

    await expect(
      transitionRfqRecord({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        rfqId: RFQ_ID,
        command: 'cancel',
        reason: 'Late',
      })
    ).resolves.toEqual({
      error: 'Cannot cancel a completed RFQ',
    })
    expect(harness.update).not.toHaveBeenCalled()
    expect(
      mocks.writeAuditLogInTransaction
    ).not.toHaveBeenCalled()
  })

  it('cancels pending RFQ with reason in the same transaction as audit', async () => {
    const harness = transactionHarness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [line()],
        },
      ],
    ])

    await expect(
      transitionRfqRecord({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        rfqId: RFQ_ID,
        command: 'cancel',
        reason: 'Supplier withdrew',
      })
    ).resolves.toEqual({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      transitioned: true,
    })
    expect(
      mocks.writeAuditLogInTransaction
    ).toHaveBeenCalledWith(harness.tx, {
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      entityType: 'rfq',
      entityId: RFQ_ID,
      action: 'status_change',
      diff: {
        from: 'pending',
        to: 'cancelled',
        reason: 'Supplier withdrew',
      },
    })
  })

  it('keeps completion notification outside transaction authority', async () => {
    await notifyRfqCompleted({
      tenantId: TENANT_ID,
      rfqId: RFQ_ID,
    })

    expect(mocks.notifyRoles).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      recipientRoles: ['commercial'],
      subject: 'RFQ quotes ready for review',
      body: 'Procurement has completed sourcing. Review the comparison and update the BOM.',
      linkUrl: `/procurement/rfqs/${RFQ_ID}`,
      payload: {
        event: 'rfq.completed',
        rfq_id: RFQ_ID,
      },
    })
  })
})
