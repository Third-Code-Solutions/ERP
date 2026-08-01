import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { PurchaseOrderController } from './purchase-order.controller'
import { PurchaseOrderCreationService } from './purchase-order-creation.service'

const COMMAND = {
  projectId: '33333333-3333-4333-8333-333333333333',
  vendorId: null,
  deliveryDate: null,
  notes: null,
  lines: [
    {
      description: 'Concrete',
      quantity: 1,
      unitCostCents: 10_000,
      costCodeId: '44444444-4444-4444-8444-444444444444',
    },
  ],
}

describe('Purchase Order command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [PurchaseOrderController],
      providers: [
        {
          provide: PurchaseOrderCreationService,
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
          userId: '11111111-1111-4111-8111-111111111111',
          tenantId: '22222222-2222-4222-8222-222222222222',
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
      .post('/v1/procurement/purchase-orders')
      .send(COMMAND)
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  }, 30_000)

  it('keeps tenant and actor authority out of the browser command', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/procurement/purchase-orders')
      .set('Idempotency-Key', 'po-create-1')
      .send({ ...COMMAND, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards only validated command and request principal', async () => {
    const create = vi.fn().mockResolvedValue({
      purchaseOrderId: '55555555-5555-4555-8555-555555555555',
      tenantId: '22222222-2222-4222-8222-222222222222',
      poNumber: 'PO-0001',
      status: 'draft',
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/procurement/purchase-orders')
      .set('Idempotency-Key', ' po-create-1 ')
      .send(COMMAND)
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      COMMAND,
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'po-create-1'
    )
  }, 30_000)
})
