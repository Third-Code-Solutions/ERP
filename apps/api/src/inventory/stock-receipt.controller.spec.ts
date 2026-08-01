import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { StockReceiptController } from './stock-receipt.controller'
import { StockReceiptCreationService } from './stock-receipt-creation.service'

const COMMAND = {
  warehouseId: '11111111-1111-4111-8111-111111111111',
  purchaseOrderId: '22222222-2222-4222-8222-222222222222',
  deliveryScheduleId: null,
  supplierDeliveryReference: null,
  receivedDate: '2026-08-01',
  notes: null,
  lines: [
    {
      poLineItemId: '33333333-3333-4333-8333-333333333333',
      quantity: '4.25',
    },
  ],
}

describe('Stock Receipt command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [StockReceiptController],
      providers: [
        {
          provide: StockReceiptCreationService,
          useValue: { create },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use(
      (
        req: Request,
        _res: Response,
        next: NextFunction
      ) => {
        ;(req as AuthenticatedRequest).principal = {
          userId: '44444444-4444-4444-8444-444444444444',
          tenantId: '55555555-5555-4555-8555-555555555555',
          role: 'procurement',
          email: 'procurement@example.test',
        }
        next()
      }
    )
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    await app.init()
    close = () => app.close()
    return app
  }

  it('requires an idempotency key before the command boundary', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/stock-receipts')
      .send(COMMAND)
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('keeps tenant and actor authority out of the browser command', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/stock-receipts')
      .set('Idempotency-Key', 'receipt-create-1')
      .send({
        ...COMMAND,
        tenantId: '66666666-6666-4666-8666-666666666666',
      })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('forwards only validated command and request principal', async () => {
    const create = vi.fn().mockResolvedValue({
      stockReceiptId: '77777777-7777-4777-8777-777777777777',
      tenantId: '55555555-5555-4555-8555-555555555555',
      status: 'draft',
      lineCount: 1,
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/stock-receipts')
      .set('Idempotency-Key', ' receipt-create-1 ')
      .send(COMMAND)
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      COMMAND,
      expect.objectContaining({
        tenantId: '55555555-5555-4555-8555-555555555555',
        userId: '44444444-4444-4444-8444-444444444444',
      }),
      'receipt-create-1'
    )
  })
})
