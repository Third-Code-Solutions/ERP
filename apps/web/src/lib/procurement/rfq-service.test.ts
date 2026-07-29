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
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

import {
  createRfqFromBomRecord,
  notifyRfqCreated,
} from './rfq-service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RFQ_ID = '55555555-5555-4555-8555-555555555555'

function collectColumnNames(
  value: unknown,
  seen = new WeakSet<object>()
): string[] {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const record = value as Record<string, unknown>
  const ownName =
    typeof record.name === 'string' && record.table
      ? [record.name]
      : []
  return ownName.concat(
    Object.values(record).flatMap((child) =>
      collectColumnNames(child, seen)
    )
  )
}

function transactionHarness(
  selectResults: unknown[][],
  inserted = [{ id: RFQ_ID }]
) {
  const conditions: unknown[] = []
  const joins: unknown[] = []

  const select = vi.fn(() => {
    const result = selectResults.shift()
    if (!result) throw new Error('Unexpected select')

    const chain: Record<string, unknown> = {}
    chain.from = vi.fn(() => chain)
    chain.innerJoin = vi.fn((_table: unknown, condition: unknown) => {
      joins.push(condition)
      return chain
    })
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

  const returning = vi.fn().mockResolvedValue(inserted)
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))
  const tx = { select, insert }

  mocks.transaction.mockImplementationOnce(
    async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx)
  )

  return {
    tx,
    conditions,
    joins,
    insert,
    values,
    returning,
  }
}

describe('RFQ transaction service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
    mocks.notifyRoles.mockResolvedValue(undefined)
  })

  it('locks the tenant BOM and atomically creates nullable-actor audit evidence', async () => {
    const harness = transactionHarness([
      [{ id: BOM_ID, project_id: PROJECT_ID }],
      [],
      [
        {
          code: 'MAT-001',
          description: 'Concrete board',
          unit: 'pc',
          quantity: 4,
          is_group: 0,
        },
      ],
      [],
    ])

    const result = await createRfqFromBomRecord({
      bomId: BOM_ID,
      tenantId: TENANT_ID,
      actorId: null,
      source: 'bom_approved_event',
    })

    expect(result).toEqual({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 1,
      created: true,
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(harness.insert).toHaveBeenCalledOnce()

    for (const condition of harness.conditions) {
      expect(collectColumnNames(condition)).toContain('tenant_id')
    }
    for (const condition of harness.joins) {
      expect(collectColumnNames(condition)).toContain('tenant_id')
    }

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      harness.tx,
      {
        tenantId: TENANT_ID,
        actorId: null,
        entityType: 'rfq',
        entityId: RFQ_ID,
        action: 'create',
        diff: {
          bom_id: BOM_ID,
          line_count: 1,
          source: 'bom_approved_event',
        },
      }
    )
    expect(
      harness.returning.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.writeAuditLogInTransaction.mock.invocationCallOrder[0]!
    )
  })

  it('returns the existing RFQ on retry without another insert or audit', async () => {
    const harness = transactionHarness([
      [{ id: BOM_ID, project_id: PROJECT_ID }],
      [{ id: ACTOR_ID }],
      [{ id: RFQ_ID, line_items: [{ code: 'MAT-001' }] }],
    ])

    await expect(
      createRfqFromBomRecord({
        bomId: BOM_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        source: 'manual',
      })
    ).resolves.toEqual({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 1,
      created: false,
    })

    expect(harness.insert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('stops a missing or cross-tenant BOM before dependent reads', async () => {
    const harness = transactionHarness([[]])

    await expect(
      createRfqFromBomRecord({
        bomId: BOM_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        source: 'manual',
      })
    ).resolves.toEqual({ error: 'BOM not found' })

    expect(harness.tx.select).toHaveBeenCalledOnce()
    expect(harness.insert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('downgrades a stale or cross-tenant event actor to system attribution', async () => {
    transactionHarness([
      [{ id: BOM_ID, project_id: PROJECT_ID }],
      [],
      [],
      [
        {
          code: null,
          description: 'Site mobilization',
          unit: 'lot',
          quantity: 1,
          is_group: 0,
        },
      ],
      [],
    ])

    await createRfqFromBomRecord({
      bomId: BOM_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      source: 'bom_approved_event',
    })

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: null })
    )
  })

  it('rejects when audit fails so the database transaction can roll back', async () => {
    transactionHarness([
      [{ id: BOM_ID, project_id: PROJECT_ID }],
      [{ id: ACTOR_ID }],
      [],
      [
        {
          code: null,
          description: 'Site mobilization',
          unit: 'lot',
          quantity: 1,
          is_group: 0,
        },
      ],
      [],
    ])
    mocks.writeAuditLogInTransaction.mockRejectedValue(
      new Error('audit unavailable')
    )

    await expect(
      createRfqFromBomRecord({
        bomId: BOM_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        source: 'manual',
      })
    ).rejects.toThrow('audit unavailable')
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: ACTOR_ID })
    )
    expect(mocks.notifyRoles).not.toHaveBeenCalled()
  })

  it('dispatches the existing notification contract only after creation', async () => {
    await notifyRfqCreated({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 2,
      created: true,
    })

    expect(mocks.notifyRoles).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      recipientRoles: ['procurement'],
      subject: 'New RFQ awaiting quotes (2 items)',
      body: 'A BOM has been internally approved. Source quotes from suppliers.',
      linkUrl: `/procurement/rfqs/${RFQ_ID}`,
      payload: {
        event: 'rfq.created',
        rfq_id: RFQ_ID,
      },
      alsoEmail: true,
      templateId: 'rfq-dispatch',
      templateVars: {
        project_name: PROJECT_ID,
        line_count: 2,
        rfq_url: `/procurement/rfqs/${RFQ_ID}`,
      },
    })
  })
})
