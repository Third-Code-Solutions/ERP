import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { DeliveryWorkflowController } from './delivery-workflow.controller'
import { DeliveryWorkflowService } from './delivery-workflow.service'

const DELIVERY_ID = '33333333-3333-4333-8333-333333333333'

describe('Delivery workflow HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    recordReceipt = vi.fn(),
    startInspection = vi.fn(),
    completeInspection = vi.fn(),
    cancelDelivery = vi.fn(),
    startSitePreparation = vi.fn(),
    completeSitePreparation = vi.fn(),
    markInTransit = vi.fn()
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeliveryWorkflowController],
      providers: [
        {
          provide: DeliveryWorkflowService,
          useValue: {
            recordReceipt,
            startInspection,
            completeInspection,
            cancelDelivery,
            startSitePreparation,
            completeSitePreparation,
            markInTransit,
          },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        role: 'procurement',
        email: 'procurement@example.test',
      }
      next()
    })
    await app.init()
    close = () => app.close()
    return app
  }

  it('requires an idempotency key', async () => {
    const recordReceipt = vi.fn()
    const app = await appFor(recordReceipt)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/receipt`)
      .send({ notes: 'received' })
      .expect(400)

    expect(recordReceipt).not.toHaveBeenCalled()
  })

  it('forwards the strict in-transit command, principal, and trimmed key', async () => {
    const markInTransit = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'mark_in_transit',
      fromStatus: 'site_ready',
      status: 'in_transit',
    })
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      markInTransit
    )

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/in-transit`)
      .set('Idempotency-Key', ' delivery-in-transit-1 ')
      .send({})
      .expect(200)

    expect(markInTransit).toHaveBeenCalledWith(
      DELIVERY_ID,
      {},
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-in-transit-1'
    )
  })

  it('rejects caller-supplied authority fields for in-transit transition', async () => {
    const markInTransit = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      markInTransit
    )

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/in-transit`)
      .set('Idempotency-Key', 'delivery-in-transit-1')
      .send({ tenantId: '22222222-2222-4222-8222-222222222222' })
      .expect(400)

    expect(markInTransit).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied tenant or actor fields', async () => {
    const recordReceipt = vi.fn()
    const app = await appFor(recordReceipt)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/receipt`)
      .set('Idempotency-Key', 'delivery-receipt-1')
      .send({ notes: 'received', tenantId: '22222222-2222-4222-8222-222222222222' })
      .expect(400)

    expect(recordReceipt).not.toHaveBeenCalled()
  })

  it('forwards only the strict command, principal, and trimmed key', async () => {
    const recordReceipt = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'record_receipt',
      fromStatus: 'in_transit',
      status: 'received',
    })
    const app = await appFor(recordReceipt)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/receipt`)
      .set('Idempotency-Key', ' delivery-receipt-1 ')
      .send({ notes: 'received' })
      .expect(200)

    expect(recordReceipt).toHaveBeenCalledWith(
      DELIVERY_ID,
      { notes: 'received' },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-receipt-1'
    )
  })

  it('requires an idempotency key for site-preparation start', async () => {
    const startSitePreparation = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      startSitePreparation
    )

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/site-preparation/start`
      )
      .send({})
      .expect(400)

    expect(startSitePreparation).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied authority fields for site-preparation start', async () => {
    const startSitePreparation = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      startSitePreparation
    )

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/site-preparation/start`
      )
      .set('Idempotency-Key', 'delivery-site-preparation-1')
      .send({ tenantId: '22222222-2222-4222-8222-222222222222' })
      .expect(400)

    expect(startSitePreparation).not.toHaveBeenCalled()
  })

  it('forwards the strict site-preparation command, principal, and trimmed key', async () => {
    const startSitePreparation = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'start_site_preparation',
      fromStatus: 'scheduled',
      status: 'site_preparing',
    })
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      startSitePreparation
    )

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/site-preparation/start`
      )
      .set('Idempotency-Key', ' delivery-site-preparation-1 ')
      .send({})
      .expect(200)

    expect(startSitePreparation).toHaveBeenCalledWith(
      DELIVERY_ID,
      {},
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-site-preparation-1'
    )
  })

  it('requires an idempotency key for site-preparation completion', async () => {
    const completeSitePreparation = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      completeSitePreparation
    )

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/site-preparation/complete`
      )
      .send({ notes: 'staging complete' })
      .expect(400)

    expect(completeSitePreparation).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied authority fields for site-preparation completion', async () => {
    const completeSitePreparation = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      completeSitePreparation
    )

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/site-preparation/complete`
      )
      .set('Idempotency-Key', 'delivery-site-preparation-complete-1')
      .send({ notes: 'staging complete', tenantId: '22222222-2222-4222-8222-222222222222' })
      .expect(400)

    expect(completeSitePreparation).not.toHaveBeenCalled()
  })

  it('forwards the strict site-preparation completion command, principal, and trimmed key', async () => {
    const completeSitePreparation = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'complete_site_preparation',
      fromStatus: 'site_preparing',
      status: 'site_ready',
      sitePreparedAt: '2026-08-02T12:00:00.000Z',
    })
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      completeSitePreparation
    )

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/site-preparation/complete`
      )
      .set('Idempotency-Key', ' delivery-site-preparation-complete-1 ')
      .send({ notes: 'staging complete' })
      .expect(200)

    expect(completeSitePreparation).toHaveBeenCalledWith(
      DELIVERY_ID,
      { notes: 'staging complete' },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-site-preparation-complete-1'
    )
  })

  it('requires an idempotency key for inspection start', async () => {
    const startInspection = vi.fn()
    const app = await appFor(vi.fn(), startInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/start`
      )
      .send({})
      .expect(400)

    expect(startInspection).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied authority fields for inspection start', async () => {
    const startInspection = vi.fn()
    const app = await appFor(vi.fn(), startInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/start`
      )
      .set('Idempotency-Key', 'delivery-inspection-1')
      .send({ tenantId: '22222222-2222-4222-8222-222222222222' })
      .expect(400)

    expect(startInspection).not.toHaveBeenCalled()
  })

  it('forwards the strict empty command, principal, and trimmed key', async () => {
    const startInspection = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      inspectionId: '44444444-4444-4444-8444-444444444444',
      action: 'start_inspection',
      fromStatus: 'received',
      status: 'inspecting',
    })
    const app = await appFor(vi.fn(), startInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/start`
      )
      .set('Idempotency-Key', ' delivery-inspection-1 ')
      .send({})
      .expect(200)

    expect(startInspection).toHaveBeenCalledWith(
      DELIVERY_ID,
      {},
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-inspection-1'
    )
  })

  it('requires an idempotency key for inspection completion', async () => {
    const completeInspection = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), completeInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/complete`
      )
      .send({ result: 'pass' })
      .expect(400)

    expect(completeInspection).not.toHaveBeenCalled()
  })

  it('rejects authority fields for inspection completion', async () => {
    const completeInspection = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), completeInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/complete`
      )
      .set('Idempotency-Key', 'delivery-inspection-complete-1')
      .send({ result: 'pass', tenantId: '22222222-2222-4222-8222-222222222222' })
      .expect(400)

    expect(completeInspection).not.toHaveBeenCalled()
  })

  it('requires defect notes for a failed inspection', async () => {
    const completeInspection = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), completeInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/complete`
      )
      .set('Idempotency-Key', 'delivery-inspection-complete-1')
      .send({ result: 'fail' })
      .expect(400)

    expect(completeInspection).not.toHaveBeenCalled()
  })

  it('forwards the strict completion command, principal, and trimmed key', async () => {
    const completeInspection = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      inspectionId: '44444444-4444-4444-8444-444444444444',
      action: 'complete_inspection',
      fromStatus: 'inspecting',
      inspectionResult: 'partial_pass',
      status: 'accepted',
      completedAt: '2026-08-02T12:00:00.000Z',
    })
    const app = await appFor(vi.fn(), vi.fn(), completeInspection)

    await request(app.getHttpServer())
      .post(
        `/v1/procurement/deliveries/${DELIVERY_ID}/inspection/complete`
      )
      .set('Idempotency-Key', ' delivery-inspection-complete-1 ')
      .send({
        result: 'partial_pass',
        defectNotes: 'Two brackets scratched',
        acceptanceNotes: 'Replace next visit',
      })
      .expect(200)

    expect(completeInspection).toHaveBeenCalledWith(
      DELIVERY_ID,
      {
        result: 'partial_pass',
        defectNotes: 'Two brackets scratched',
        acceptanceNotes: 'Replace next visit',
      },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-inspection-complete-1'
    )
  })

  it('requires an idempotency key for delivery cancellation', async () => {
    const cancelDelivery = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), vi.fn(), cancelDelivery)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/cancel`)
      .send({ reason: 'Supplier delay' })
      .expect(400)

    expect(cancelDelivery).not.toHaveBeenCalled()
  })

  it('rejects authority fields for delivery cancellation', async () => {
    const cancelDelivery = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), vi.fn(), cancelDelivery)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/cancel`)
      .set('Idempotency-Key', 'delivery-cancel-1')
      .send({
        reason: 'Supplier delay',
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(400)

    expect(cancelDelivery).not.toHaveBeenCalled()
  })

  it('requires a non-empty cancellation reason', async () => {
    const cancelDelivery = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), vi.fn(), cancelDelivery)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/cancel`)
      .set('Idempotency-Key', 'delivery-cancel-1')
      .send({ reason: '   ' })
      .expect(400)

    expect(cancelDelivery).not.toHaveBeenCalled()
  })

  it('forwards the strict cancellation command, principal, and trimmed key', async () => {
    const cancelDelivery = vi.fn().mockResolvedValue({
      deliveryScheduleId: DELIVERY_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      action: 'cancel_delivery',
      fromStatus: 'in_transit',
      status: 'cancelled',
      cancellationReason: 'Supplier delay',
      cancelledAt: '2026-08-02T12:00:00.000Z',
    })
    const app = await appFor(vi.fn(), vi.fn(), vi.fn(), cancelDelivery)

    await request(app.getHttpServer())
      .post(`/v1/procurement/deliveries/${DELIVERY_ID}/cancel`)
      .set('Idempotency-Key', ' delivery-cancel-1 ')
      .send({ reason: 'Supplier delay' })
      .expect(200)

    expect(cancelDelivery).toHaveBeenCalledWith(
      DELIVERY_ID,
      { reason: 'Supplier delay' },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'delivery-cancel-1'
    )
  })
})
