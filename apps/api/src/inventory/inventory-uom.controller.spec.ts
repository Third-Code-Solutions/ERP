import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryUomController } from './inventory-uom.controller'
import { InventoryUomCreationService } from './inventory-uom-creation.service'
import { InventoryUomUpdateService } from './inventory-uom-update.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Inventory UOM HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn(), update = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryUomController],
      providers: [
        {
          provide: InventoryUomCreationService,
          useValue: { create },
        },
        {
          provide: InventoryUomUpdateService,
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

  it('rejects tenant identity supplied by browser', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/uoms')
      .send({
        code: 'EA',
        name: 'Each',
        decimalPlaces: 0,
        tenantId: TENANT_ID,
      })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  }, 15_000)

  it('forwards validated command and verified principal', async () => {
    const create = vi.fn().mockResolvedValue({
      uomId: '66666666-6666-4666-8666-666666666666',
      tenantId: TENANT_ID,
      code: 'EA',
      name: 'Each',
      decimalPlaces: 0,
      isActive: true,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post('/v1/inventory/uoms')
      .send({ code: ' EA ', name: ' Each ', decimalPlaces: 0 })
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      { code: 'EA', name: 'Each', decimalPlaces: 0 },
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  }, 15_000)

  it('forwards validated update command and verified principal', async () => {
    const update = vi.fn().mockResolvedValue({
      uomId: '66666666-6666-4666-8666-666666666666',
      tenantId: TENANT_ID,
      code: 'EA',
      name: 'Units',
      decimalPlaces: 0,
      isActive: false,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:01:00.000Z',
    })
    const app = await appFor(vi.fn(), update)

    await request(app.getHttpServer())
      .patch('/v1/inventory/uoms/66666666-6666-4666-8666-666666666666')
      .send({ name: ' Units ', isActive: false })
      .expect(200)

    expect(update).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      { name: 'Units', isActive: false },
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  }, 15_000)
})
