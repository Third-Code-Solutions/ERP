import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { DeliveryWorkflowController } from './delivery-workflow.controller'
import { DeliveryWorkflowService } from './delivery-workflow.service'

const DELIVERY_ID = '33333333-3333-4333-8333-333333333333'

describe('Delivery receipt HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(recordReceipt = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeliveryWorkflowController],
      providers: [{ provide: DeliveryWorkflowService, useValue: { recordReceipt } }],
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
})
