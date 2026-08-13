import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { FinanceCashController } from './finance-cash.controller'
import { FinanceCashService } from './finance-cash.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Finance cash HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(list = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinanceCashController],
      providers: [{ provide: FinanceCashService, useValue: { list } }],
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
      .get('/v1/finance/cash-transactions?unexpected=true')
      .expect(400)

    expect(list).not.toHaveBeenCalled()
  })

  it('forwards bounded filters and the verified finance principal', async () => {
    const list = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      rows: [],
      total: 0,
      postedReceiptCents: 0,
      postedDisbursementCents: 0,
      draftCount: 0,
      postedCount: 0,
      reversedCount: 0,
      page: 2,
      limit: 100,
      totalPages: 1,
    })
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get(
        '/v1/finance/cash-transactions?cashAccountId=55555555-5555-4555-8555-555555555555&direction=receipt&fromDate=2026-08-01&toDate=2026-08-31&page=2&limit=100'
      )
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      {
        cashAccountId: '55555555-5555-4555-8555-555555555555',
        direction: 'receipt',
        status: undefined,
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        page: 2,
        limit: 100,
      },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'finance' })
    )
  })
})
