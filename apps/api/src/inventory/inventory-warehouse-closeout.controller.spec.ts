import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryWarehouseCloseoutController } from './inventory-warehouse-closeout.controller'
import { InventoryWarehouseCloseoutService } from './inventory-warehouse-closeout.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

describe('Inventory Warehouse closeout HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryWarehouseCloseoutController],
      providers: [
        {
          provide: InventoryWarehouseCloseoutService,
          useValue: { read },
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

  it('rejects malformed Warehouse identity before the service', async () => {
    const read = vi.fn()
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/inventory/warehouses/not-a-uuid/closeout')
      .expect(400)

    expect(read).not.toHaveBeenCalled()
  })

  it('forwards the verified principal and returns exact closeout state', async () => {
    const read = vi.fn().mockResolvedValue({
      warehouseId: WAREHOUSE_ID,
      tenantId: TENANT_ID,
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
      quantityMicros: '0',
      valueCents: '0',
      canDeactivate: true,
      disposition: 'ready',
    })
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get(`/v1/inventory/warehouses/${WAREHOUSE_ID}/closeout`)
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      WAREHOUSE_ID,
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  })
})
