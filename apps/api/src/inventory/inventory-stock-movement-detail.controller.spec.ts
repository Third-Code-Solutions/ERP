import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryStockMovementDetailController } from './inventory-stock-movement-detail.controller'
import { InventoryStockMovementDetailService } from './inventory-stock-movement-detail.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const MOVEMENT_ID = '88888888-8888-4888-8888-888888888888'

describe('Inventory Stock Movement detail HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryStockMovementDetailController],
      providers: [
        {
          provide: InventoryStockMovementDetailService,
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

  it('rejects an invalid movement id before the service', async () => {
    const read = vi.fn()
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/inventory/stock-movements/not-a-uuid')
      .expect(400)

    expect(read).not.toHaveBeenCalled()
  })

  it('forwards the verified movement id and principal', async () => {
    const read = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      movement: {
        id: MOVEMENT_ID,
        internalNumber: null,
        movementType: 'adjustment',
        status: 'draft',
        movementDate: '2026-08-05',
        currency: 'PHP',
        reason: 'Cycle count',
        sourceWarehouseCode: 'MAIN',
        sourceWarehouseName: 'Main store',
        targetWarehouseCode: null,
        targetWarehouseName: null,
        projectName: null,
        postingJournalEntryId: null,
        postingJournalNumber: null,
        reversalJournalEntryId: null,
        reversalJournalNumber: null,
        postedAt: null,
        reversedAt: null,
        reversalReason: null,
      },
      lines: [],
      ledger: [],
    })
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get(`/v1/inventory/stock-movements/${MOVEMENT_ID}`)
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      MOVEMENT_ID,
      expect.objectContaining({ tenantId: TENANT_ID })
    )
  })
})
