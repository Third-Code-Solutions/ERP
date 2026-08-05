import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { FinancePayablesController } from './finance-payables.controller'
import { FinancePayablesService } from './finance-payables.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Finance payables HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(list = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinancePayablesController],
      providers: [{ provide: FinancePayablesService, useValue: { list } }],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'finance',
        email: 'finance@example.test',
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

  it('rejects unsupported query fields before the service', async () => {
    const list = vi.fn()
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get('/v1/finance/payables?unexpected=true')
      .expect(400)

    expect(list).not.toHaveBeenCalled()
  })

  it('forwards bounded filters and the verified finance principal', async () => {
    const list = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      asOfDate: '2026-08-06',
      rows: [],
      total: 0,
      totalPayableCents: 0,
      totalPaidCents: 0,
      totalOpenCents: 0,
      overdueOpenCents: 0,
      overdueCount: 0,
      draftCount: 0,
      postedOpenCount: 0,
      agingCurrentCents: 0,
      aging1To30Cents: 0,
      aging31To60Cents: 0,
      aging61To90Cents: 0,
      aging90PlusCents: 0,
      page: 2,
      limit: 100,
      totalPages: 1,
    })
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get(
        '/v1/finance/payables?vendorId=55555555-5555-4555-8555-555555555555&dueFrom=2026-08-01&dueTo=2026-08-31&page=2&limit=100'
      )
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      {
        vendorId: '55555555-5555-4555-8555-555555555555',
        projectId: undefined,
        status: undefined,
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        page: 2,
        limit: 100,
      },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'finance' })
    )
  })
})
