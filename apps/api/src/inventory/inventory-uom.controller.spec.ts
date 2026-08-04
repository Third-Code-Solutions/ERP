import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryUomController } from './inventory-uom.controller'
import { InventoryUomCreationService } from './inventory-uom-creation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Inventory UOM HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryUomController],
      providers: [
        {
          provide: InventoryUomCreationService,
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
  })

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
  })
})
