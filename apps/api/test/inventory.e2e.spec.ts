import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import { ValidationPipe } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../src/auth/current-principal.decorator'
import { InventorySummaryController } from '../src/inventory/inventory-summary.controller'
import { InventorySummaryService } from '../src/inventory/inventory-summary.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Inventory API contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('passes the summary read to the tenant-scoped service', async () => {
    const read = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      uoms: [],
      warehouses: [],
      items: [],
      projects: [],
      balances: [],
      balancesTruncated: false,
      receiptCounts: { draftCount: 0, postedCount: 0 },
    })
    const moduleRef = await Test.createTestingModule({
      controllers: [InventorySummaryController],
      providers: [{ provide: InventorySummaryService, useValue: { read } }],
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

    await request(app.getHttpServer()).get('/v1/inventory/summary').expect(200)

    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, role: 'procurement' })
    )
  })
})
