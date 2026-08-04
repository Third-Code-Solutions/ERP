import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryStockMovementCreationController } from './inventory-stock-movement-creation.controller'
import { InventoryStockMovementCreationService } from './inventory-stock-movement-creation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const COMMAND = {
  movementType: 'transfer',
  sourceWarehouseId: '33333333-3333-4333-8333-333333333333',
  targetWarehouseId: '44444444-4444-4444-8444-444444444444',
  projectId: null,
  movementDate: '2026-08-05',
  reason: 'Move accepted materials',
  lines: [
    {
      materialItemId: '55555555-5555-4555-8555-555555555555',
      quantity: '1.25',
      costCodeId: null,
      declaredUnitCostPhp: null,
    },
  ],
}

describe('Inventory Stock Movement creation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryStockMovementCreationController],
      providers: [
        {
          provide: InventoryStockMovementCreationService,
          useValue: { create },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'procurement',
        email: 'procurement@example.test',
      }
      next()
    })
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
      .post('/v1/inventory/stock-movements')
      .send(COMMAND)
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('rejects browser tenant identity fields', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/stock-movements')
      .set('Idempotency-Key', 'movement-create-1')
      .send({ ...COMMAND, tenantId: TENANT_ID })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('forwards the normalized command and verified principal', async () => {
    const create = vi.fn().mockResolvedValue({
      stockMovementId: '66666666-6666-4666-8666-666666666666',
      tenantId: TENANT_ID,
      status: 'draft',
      lineCount: 1,
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/stock-movements')
      .set('Idempotency-Key', 'movement-create-1')
      .send({
        ...COMMAND,
        reason: ' Move accepted materials ',
        lines: [{ ...COMMAND.lines[0], quantity: ' 1.25 ' }],
      })
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: 'transfer',
        reason: 'Move accepted materials',
      }),
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) }),
      'movement-create-1'
    )
  })
})
