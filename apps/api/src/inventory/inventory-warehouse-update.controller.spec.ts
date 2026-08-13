import 'reflect-metadata'

import { ConflictException, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryWarehouseUpdateController } from './inventory-warehouse-update.controller'
import { InventoryWarehouseUpdateService } from './inventory-warehouse-update.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

describe('Inventory Warehouse update HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(update = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryWarehouseUpdateController],
      providers: [
        {
          provide: InventoryWarehouseUpdateService,
          useValue: { update },
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

  it('rejects immutable identity fields supplied by browser', async () => {
    const update = vi.fn()
    const app = await appFor(update)

    await request(app.getHttpServer())
      .patch(`/v1/inventory/warehouses/${WAREHOUSE_ID}`)
      .send({ name: 'Closed materials store', isActive: false, code: 'CLOSED' })
      .expect(400)

    expect(update).not.toHaveBeenCalled()
  })

  it('forwards validated state and verified principal', async () => {
    const update = vi.fn().mockResolvedValue({
      warehouseId: WAREHOUSE_ID,
      tenantId: TENANT_ID,
      code: 'MAIN',
      name: 'Closed materials store',
      projectId: null,
      isActive: false,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:01:00.000Z',
    })
    const app = await appFor(update)

    await request(app.getHttpServer())
      .patch(`/v1/inventory/warehouses/${WAREHOUSE_ID}`)
      .send({ name: ' Closed materials store ', isActive: false })
      .expect(200)

    expect(update).toHaveBeenCalledWith(
      WAREHOUSE_ID,
      { name: 'Closed materials store', isActive: false },
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  })

  it('exposes nonzero-balance deactivation as a conflict', async () => {
    const update = vi.fn().mockRejectedValue(
      new ConflictException(
        'Warehouse cannot be deactivated while its net stock balance is nonzero.'
      )
    )
    const app = await appFor(update)

    await request(app.getHttpServer())
      .patch(`/v1/inventory/warehouses/${WAREHOUSE_ID}`)
      .send({ name: 'Closed materials store', isActive: false })
      .expect(409)

    expect(update).toHaveBeenCalledOnce()
  })
})
