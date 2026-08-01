import { describe, expect, it } from 'vitest'
import {
  createRfqCommandSchema,
  logRfqQuoteCommandSchema,
  notificationDeliveryJobSchema,
  notificationDeliveryResultSchema,
  notificationSweepJobSchema,
  rfqCreationResultSchema,
  rfqDispatchDeadLetterSchema,
  rfqDispatchJobSchema,
  rfqDispatchResultSchema,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  transitionRfqCommandSchema,
} from './procurement'
import {
  createPurchaseOrderCommandSchema,
  purchaseOrderWorkflowCommandSchema,
  purchaseOrderWorkflowResultSchema,
  purchaseOrderCreationResultSchema,
} from './purchase-orders'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('Purchase Order creation API contracts', () => {
  it('accepts tenant-free commands with bounded integer centavo lines', () => {
    const command = {
      projectId: UUID,
      vendorId: null,
      deliveryDate: null,
      notes: 'Concrete package',
      lines: [
        {
          code: 'CONC-01',
          description: 'Ready-mix concrete',
          unit: 'm3',
          quantity: 4,
          unitCostCents: 12_500,
          costCodeId: UUID,
        },
      ],
    }
    expect(createPurchaseOrderCommandSchema.parse(command)).toEqual(command)
  })

  it('rejects caller authority and unsafe money', () => {
    const line = {
      description: 'Concrete',
      quantity: 1,
      unitCostCents: 100,
      costCodeId: UUID,
    }
    expect(
      createPurchaseOrderCommandSchema.safeParse({
        projectId: UUID,
        lines: [line],
        tenantId: UUID,
      }).success
    ).toBe(false)
    expect(
      createPurchaseOrderCommandSchema.safeParse({
        projectId: UUID,
        lines: [{ ...line, unitCostCents: 1.5 }],
      }).success
    ).toBe(false)
    expect(
      createPurchaseOrderCommandSchema.safeParse({
        projectId: UUID,
        lines: [{ ...line, quantity: 2_147_483_648 }],
      }).success
    ).toBe(false)
  })

  it('requires a draft result with server-derived tenant identity', () => {
    expect(
      purchaseOrderCreationResultSchema.safeParse({
        purchaseOrderId: UUID,
        tenantId: UUID,
        poNumber: 'PO-0001',
        status: 'draft',
      }).success
    ).toBe(true)
    expect(
      purchaseOrderCreationResultSchema.safeParse({
        purchaseOrderId: UUID,
        tenantId: UUID,
        poNumber: 'PO-0001',
        status: 'issued',
      }).success
    ).toBe(false)
  })
})

describe('Purchase Order workflow API contracts', () => {
  it('requires a reason only for rejection and excludes caller authority', () => {
    expect(
      purchaseOrderWorkflowCommandSchema.parse({
        action: 'pm_approve',
      })
    ).toEqual({ action: 'pm_approve' })
    expect(
      purchaseOrderWorkflowCommandSchema.parse({
        action: 'reject',
        reason: '  Missing scope confirmation  ',
      })
    ).toEqual({
      action: 'reject',
      reason: 'Missing scope confirmation',
    })
    expect(
      purchaseOrderWorkflowCommandSchema.safeParse({
        action: 'reject',
      }).success
    ).toBe(false)
    expect(
      purchaseOrderWorkflowCommandSchema.safeParse({
        action: 'pm_approve',
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a tenant-scoped status transition result', () => {
    expect(
      purchaseOrderWorkflowResultSchema.safeParse({
        purchaseOrderId: UUID,
        tenantId: UUID,
        action: 'pm_approve',
        fromStatus: 'pending_pm_approval',
        status: 'pending_commercial_approval',
      }).success
    ).toBe(true)
    expect(
      purchaseOrderWorkflowResultSchema.safeParse({
        purchaseOrderId: UUID,
        tenantId: UUID,
        action: 'pm_approve',
        fromStatus: 'draft',
        status: 'pending_commercial_approval',
      }).success
    ).toBe(true)
    expect(
      purchaseOrderWorkflowResultSchema.safeParse({
        purchaseOrderId: UUID,
        tenantId: UUID,
        action: 'pm_approve',
        fromStatus: 'pending_pm_approval',
        status: 'not-a-status',
      }).success
    ).toBe(false)
  })
})

describe('RFQ creation API contracts', () => {
  it('accepts only a BOM identifier from the caller', () => {
    expect(createRfqCommandSchema.parse({ bomId: UUID })).toEqual({
      bomId: UUID,
    })
    expect(
      createRfqCommandSchema.safeParse({
        bomId: UUID,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a strict durable creation result', () => {
    const result = {
      rfqId: UUID,
      tenantId: UUID,
      projectId: UUID,
      lineCount: 2,
      created: true,
    }
    expect(rfqCreationResultSchema.safeParse(result).success).toBe(
      true
    )
    expect(
      rfqCreationResultSchema.safeParse({
        ...result,
        source: 'manual',
      }).success
    ).toBe(false)
    expect(
      rfqCreationResultSchema.safeParse({
        ...result,
        lineCount: -1,
      }).success
    ).toBe(false)
  })
})

describe('Approved-BOM RFQ dispatch contracts', () => {
  it('accepts only server-derived versioned job authority', () => {
    const job = {
      schemaVersion: 1 as const,
      tenantId: UUID,
      actorId: UUID,
      bomId: UUID,
      source: 'bom_approved' as const,
    }
    expect(rfqDispatchJobSchema.parse(job)).toEqual(job)
    expect(
      rfqDispatchJobSchema.safeParse({
        ...job,
        role: 'owner',
      }).success
    ).toBe(false)
  })

  it('requires strict enqueue and dead-letter results', () => {
    expect(
      rfqDispatchResultSchema.safeParse({
        jobId: `rfq1-${UUID}-${UUID}`,
        enqueued: true,
      }).success
    ).toBe(true)
    expect(
      rfqDispatchResultSchema.safeParse({
        jobId: '',
        enqueued: true,
      }).success
    ).toBe(false)

    const deadLetter = {
      schemaVersion: 1 as const,
      sourceJobId: `rfq1-${UUID}-${UUID}`,
      sourceJobName: 'create-from-approved-bom',
      jobData: { bomId: UUID },
      attemptsMade: 5,
      errorName: 'Error',
      errorMessage: 'database unavailable',
      failedAt: '2026-07-30T00:00:00.000Z',
    }
    expect(
      rfqDispatchDeadLetterSchema.safeParse(deadLetter).success
    ).toBe(true)
    expect(
      rfqDispatchDeadLetterSchema.safeParse({
        ...deadLetter,
        attemptsMade: 0,
      }).success
    ).toBe(false)
  })
})

describe('RFQ notification delivery contracts', () => {
  it('allows only opaque versioned delivery identity in Redis', () => {
    const job = {
      schemaVersion: 1 as const,
      tenantId: UUID,
      outboxId: UUID,
      deliveryId: UUID,
    }
    expect(notificationDeliveryJobSchema.parse(job)).toEqual(job)
    expect(
      notificationDeliveryJobSchema.safeParse({
        ...job,
        recipientEmail: 'procurement@example.test',
      }).success
    ).toBe(false)
    expect(
      notificationSweepJobSchema.parse({ schemaVersion: 1 })
    ).toEqual({ schemaVersion: 1 })
  })

  it('requires a strict delivery result', () => {
    expect(
      notificationDeliveryResultSchema.safeParse({
        deliveryId: UUID,
        status: 'delivered',
      }).success
    ).toBe(true)
    expect(
      notificationDeliveryResultSchema.safeParse({
        deliveryId: UUID,
        status: 'already_processing',
      }).success
    ).toBe(true)
    expect(
      notificationDeliveryResultSchema.safeParse({
        deliveryId: UUID,
        status: 'processing',
      }).success
    ).toBe(false)
  })
})

describe('RFQ quote API contracts', () => {
  it('accepts the bounded canonical quote command', () => {
    expect(
      logRfqQuoteCommandSchema.parse({
        submissionId: UUID,
        bomLineItemId: UUID,
        vendorId: UUID,
        unitPriceCents: 12_345,
        leadTimeDays: 7,
        validUntil: '2026-08-31T00:00:00.000Z',
        notes: '  Delivered to site  ',
      })
    ).toEqual({
      submissionId: UUID,
      bomLineItemId: UUID,
      vendorId: UUID,
      unitPriceCents: 12_345,
      leadTimeDays: 7,
      validUntil: '2026-08-31T00:00:00.000Z',
      notes: 'Delivered to site',
    })
  })

  it('rejects unknown authority and unsafe money', () => {
    expect(
      logRfqQuoteCommandSchema.safeParse({
        submissionId: UUID,
        bomLineItemId: UUID,
        vendorId: UUID,
        unitPriceCents: Number.MAX_SAFE_INTEGER + 1,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a strict durable result', () => {
    expect(
      rfqQuoteResultSchema.safeParse({
        quoteId: UUID,
        created: true,
        statusChanged: true,
      }).success
    ).toBe(true)
    expect(
      rfqQuoteResultSchema.safeParse({
        quoteId: UUID,
        created: true,
        statusChanged: true,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })
})

describe('RFQ terminal transition API contracts', () => {
  it('accepts only canonical complete and bounded cancel commands', () => {
    expect(
      transitionRfqCommandSchema.parse({ command: 'complete' })
    ).toEqual({ command: 'complete' })
    expect(
      transitionRfqCommandSchema.parse({
        command: 'cancel',
        reason: '  Supplier withdrew  ',
      })
    ).toEqual({
      command: 'cancel',
      reason: 'Supplier withdrew',
    })
  })

  it('rejects missing reasons and caller-supplied authority', () => {
    expect(
      transitionRfqCommandSchema.safeParse({
        command: 'cancel',
        reason: ' ',
      }).success
    ).toBe(false)
    expect(
      transitionRfqCommandSchema.safeParse({
        command: 'complete',
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a strict durable transition result', () => {
    expect(
      rfqTransitionResultSchema.safeParse({
        rfqId: UUID,
        tenantId: UUID,
        transitioned: true,
      }).success
    ).toBe(true)
    expect(
      rfqTransitionResultSchema.safeParse({
        rfqId: UUID,
        tenantId: UUID,
        transitioned: false,
      }).success
    ).toBe(false)
  })
})
