import 'reflect-metadata'

import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import type {
  LogRfqQuoteCommand,
  TransitionRfqCommand,
} from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProcurementService } from './procurement.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}
const RFQ_ID = '33333333-3333-4333-8333-333333333333'
const LINE_ID = '44444444-4444-4444-8444-444444444444'
const VENDOR_ID = '55555555-5555-4555-8555-555555555555'
const SUBMISSION_ID =
  '66666666-6666-4666-8666-666666666666'
const QUOTE_ID = '77777777-7777-4777-8777-777777777777'

const COMMAND: LogRfqQuoteCommand = {
  submissionId: SUBMISSION_ID,
  bomLineItemId: LINE_ID,
  vendorId: VENDOR_ID,
  unitPriceCents: 12_345,
  leadTimeDays: 7,
  notes: 'Delivered',
}

function harness(selectResults: unknown[][]) {
  const execute = vi.fn().mockResolvedValue([])
  const select = vi.fn(() => {
    const result = selectResults.shift()
    if (!result) throw new Error('Unexpected select')
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn(() => chain)
    chain.leftJoin = vi.fn(() => chain)
    chain.where = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.for = vi.fn(async () => result)
    chain.then = (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
    return chain
  })

  const insertReturning = vi.fn().mockResolvedValue([{ id: QUOTE_ID }])
  const values = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values }))
  const updateReturning = vi.fn().mockResolvedValue([{ id: RFQ_ID }])
  const whereUpdate = vi.fn(() => ({ returning: updateReturning }))
  const set = vi.fn(() => ({ where: whereUpdate }))
  const update = vi.fn(() => ({ set }))
  const transactionClient = {
    execute,
    select,
    insert,
    update,
  }
  const transaction = vi.fn(
    async (
      callback: (tx: typeof transactionClient) => unknown
    ) => callback(transactionClient)
  )
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  const service = new ProcurementService(database, audit)

  return {
    service,
    transaction,
    transactionClient,
    audit,
    insert,
    update,
    values,
    updateReturning,
  }
}

describe('ProcurementService RFQ quote command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('commits quote, first status, and semantic audits in one transaction', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              description: 'Line',
            },
          ],
        },
      ],
      [],
      [{ id: VENDOR_ID }],
    ])

    await expect(
      probe.service.logQuote(RFQ_ID, COMMAND, PRINCIPAL)
    ).resolves.toEqual({
      quoteId: QUOTE_ID,
      created: true,
      statusChanged: true,
    })

    expect(probe.transaction).toHaveBeenCalledOnce()
    expect(probe.audit.stampActor).toHaveBeenCalledWith(
      probe.transactionClient,
      PRINCIPAL
    )
    expect(probe.insert).toHaveBeenCalledOnce()
    expect(probe.update).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledTimes(2)
    expect(probe.audit.writeSemantic).toHaveBeenNthCalledWith(
      1,
      probe.transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        entityType: 'rfq_quote',
        entityId: QUOTE_ID,
        action: 'create',
      })
    )
  })

  it('returns an exact replay without another mutation or semantic audit', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'completed',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              description: 'Line',
            },
          ],
        },
      ],
      [
        {
          id: QUOTE_ID,
          rfq_id: RFQ_ID,
          bom_line_item_id: LINE_ID,
          vendor_id: VENDOR_ID,
          material_item_id: null,
          unit_price_cents: COMMAND.unitPriceCents,
          lead_time_days: COMMAND.leadTimeDays,
          valid_until: null,
          notes: COMMAND.notes,
        },
      ],
    ])

    await expect(
      probe.service.logQuote(RFQ_ID, COMMAND, PRINCIPAL)
    ).resolves.toEqual({
      quoteId: QUOTE_ID,
      created: false,
      statusChanged: false,
    })
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects conflicting submission-key reuse', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              description: 'Line',
            },
          ],
        },
      ],
      [
        {
          id: QUOTE_ID,
          rfq_id: RFQ_ID,
          bom_line_item_id: LINE_ID,
          vendor_id: VENDOR_ID,
          material_item_id: null,
          unit_price_cents: 1,
          lead_time_days: COMMAND.leadTimeDays,
          valid_until: null,
          notes: COMMAND.notes,
        },
      ],
    ])

    await expect(
      probe.service.logQuote(RFQ_ID, COMMAND, PRINCIPAL)
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('rejects a cross-tenant or missing vendor before insert', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              description: 'Line',
            },
          ],
        },
      ],
      [],
      [],
    ])

    await expect(
      probe.service.logQuote(RFQ_ID, COMMAND, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('rejects a terminal RFQ before vendor lookup', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'cancelled',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              description: 'Line',
            },
          ],
        },
      ],
      [],
    ])

    await expect(
      probe.service.logQuote(RFQ_ID, COMMAND, PRINCIPAL)
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(2)
    expect(probe.insert).not.toHaveBeenCalled()
  })

  it('rejects audit failure so the transaction can roll back', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              description: 'Line',
            },
          ],
        },
      ],
      [],
      [{ id: VENDOR_ID }],
    ])
    vi.mocked(probe.audit.writeSemantic).mockRejectedValue(
      new Error('audit unavailable')
    )

    await expect(
      probe.service.logQuote(RFQ_ID, COMMAND, PRINCIPAL)
    ).rejects.toThrow('audit unavailable')
    expect(probe.insert).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledOnce()
  })
})

describe('ProcurementService RFQ terminal transition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completes a fully quoted RFQ and records one semantic audit', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              code: 'MAT-001',
              description: 'Line',
            },
          ],
        },
      ],
      [
        {
          bom_line_item_id: LINE_ID,
          material_item_id: null,
          material_code: null,
        },
      ],
    ])

    await expect(
      probe.service.transition(
        RFQ_ID,
        { command: 'complete' },
        PRINCIPAL
      )
    ).resolves.toEqual({
      rfqId: RFQ_ID,
      tenantId: PRINCIPAL.tenantId,
      transitioned: true,
    })

    expect(probe.transaction).toHaveBeenCalledOnce()
    expect(probe.audit.stampActor).toHaveBeenCalledWith(
      probe.transactionClient,
      PRINCIPAL
    )
    expect(probe.update).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      {
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        entityType: 'rfq',
        entityId: RFQ_ID,
        action: 'status_change',
        diff: {
          from: 'quotes_received',
          to: 'completed',
        },
      }
    )
  })

  it('rejects completion when any RFQ line lacks quote coverage', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'quotes_received',
          line_items: [
            {
              bom_line_item_id: LINE_ID,
              material_item_id: null,
              code: 'MAT-001',
              description: 'Line',
            },
          ],
        },
      ],
      [],
    ])

    await expect(
      probe.service.transition(
        RFQ_ID,
        { command: 'complete' },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('cancels a non-terminal RFQ with the bounded reason in its audit', async () => {
    const command: TransitionRfqCommand = {
      command: 'cancel',
      reason: 'Supplier withdrew',
    }
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [],
        },
      ],
    ])

    await expect(
      probe.service.transition(RFQ_ID, command, PRINCIPAL)
    ).resolves.toEqual({
      rfqId: RFQ_ID,
      tenantId: PRINCIPAL.tenantId,
      transitioned: true,
    })
    expect(probe.transactionClient.select).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      expect.objectContaining({
        diff: {
          from: 'pending',
          to: 'cancelled',
          reason: 'Supplier withdrew',
        },
      })
    )
  })

  it('hides a missing or cross-tenant RFQ as not found', async () => {
    const probe = harness([[]])

    await expect(
      probe.service.transition(
        RFQ_ID,
        { command: 'complete' },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects audit failure so the transition transaction can roll back', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [],
        },
      ],
    ])
    vi.mocked(probe.audit.writeSemantic).mockRejectedValue(
      new Error('audit unavailable')
    )

    await expect(
      probe.service.transition(
        RFQ_ID,
        { command: 'cancel', reason: 'No longer needed' },
        PRINCIPAL
      )
    ).rejects.toThrow('audit unavailable')
    expect(probe.update).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledOnce()
  })

  it('fails if the guarded update loses the locked row', async () => {
    const probe = harness([
      [
        {
          id: RFQ_ID,
          status: 'pending',
          line_items: [],
        },
      ],
    ])
    probe.updateReturning.mockResolvedValue([])

    await expect(
      probe.service.transition(
        RFQ_ID,
        { command: 'cancel', reason: 'No longer needed' },
        PRINCIPAL
      )
    ).rejects.toThrow('RFQ transition lost its row lock')
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })
})
