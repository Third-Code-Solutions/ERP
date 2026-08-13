import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { FinanceLedgerController } from './finance-ledger.controller'
import { FinanceLedgerService } from './finance-ledger.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Finance ledger HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(list = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinanceLedgerController],
      providers: [{ provide: FinanceLedgerService, useValue: { list } }],
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
      .get('/v1/finance/ledger?unexpected=true')
      .expect(400)

    expect(list).not.toHaveBeenCalled()
  })

  it('forwards bounded filters and the verified finance principal', async () => {
    const list = vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      totalDebitCents: 0,
      totalCreditCents: 0,
      page: 1,
      limit: 500,
      totalPages: 1,
      ledgerAccounts: [],
      businessAccounts: [],
      vendors: [],
    })
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get(
        '/v1/finance/ledger?accountId=55555555-5555-4555-8555-555555555555&from=2026-01-01&to=2026-01-31&page=2&limit=100'
      )
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      {
        accountId: '55555555-5555-4555-8555-555555555555',
        customerId: undefined,
        vendorId: undefined,
        projectId: undefined,
        from: '2026-01-01',
        to: '2026-01-31',
        page: 2,
        limit: 100,
      },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'finance' })
    )
  })
})
