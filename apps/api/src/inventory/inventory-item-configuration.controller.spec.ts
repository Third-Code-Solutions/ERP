import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryItemConfigurationController } from './inventory-item-configuration.controller'
import { InventoryItemConfigurationService } from './inventory-item-configuration.service'

const ITEM_ID = '44444444-4444-4444-8444-444444444444'
const UOM_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Inventory item configuration HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(configure = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryItemConfigurationController],
      providers: [
        {
          provide: InventoryItemConfigurationService,
          useValue: { configure },
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

  it('rejects tenant and actor fields from the browser command', async () => {
    const configure = vi.fn()
    const app = await appFor(configure)

    await request(app.getHttpServer())
      .patch(`/v1/inventory/items/${ITEM_ID}/configuration`)
      .send({ uomId: UOM_ID, tracked: true, tenantId: TENANT_ID })
      .expect(400)

    expect(configure).not.toHaveBeenCalled()
  })

  it('forwards the validated state command and verified principal', async () => {
    const configure = vi.fn().mockResolvedValue({
      materialItemId: ITEM_ID,
      tenantId: TENANT_ID,
      baseUomId: UOM_ID,
      inventoryTracked: true,
      unit: 'EA',
      updatedAt: '2026-08-05T00:00:00.000Z',
    })
    const app = await appFor(configure)

    await request(app.getHttpServer())
      .patch(`/v1/inventory/items/${ITEM_ID}/configuration`)
      .send({ uomId: UOM_ID, tracked: true })
      .expect(200)

    expect(configure).toHaveBeenCalledWith(
      ITEM_ID,
      { uomId: UOM_ID, tracked: true },
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  })
})
