import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { FinanceReconciliationController } from './finance-reconciliation.controller'
import { FinanceReconciliationService } from './finance-reconciliation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Finance reconciliation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(list = vi.fn(), read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinanceReconciliationController],
      providers: [
        { provide: FinanceReconciliationService, useValue: { list, read } },
      ],
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
      .get('/v1/finance/reconciliation?unexpected=true')
      .expect(400)

    expect(list).not.toHaveBeenCalled()
  })

  it('forwards the bounded query and verified finance principal', async () => {
    const list = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      rows: [],
      total: 0,
      truncated: false,
      draftCount: 0,
      reconciledCount: 0,
      openExceptions: 0,
      channels: 0,
    })
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get('/v1/finance/reconciliation?limit=100')
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      { limit: 100 },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'finance' })
    )
  })

  it('forwards a UUID detail read and verified finance principal', async () => {
    const read = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      statement: {},
      lines: [],
      candidates: [],
    })
    const statementId = '33333333-3333-4333-8333-333333333333'
    const app = await appFor(vi.fn(), read)

    await request(app.getHttpServer())
      .get(`/v1/finance/reconciliation/${statementId}`)
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      statementId,
      expect.objectContaining({ tenantId: TENANT_ID, role: 'finance' })
    )
  })

  it('rejects a non-UUID detail identifier before the service', async () => {
    const read = vi.fn()
    const app = await appFor(vi.fn(), read)

    await request(app.getHttpServer())
      .get('/v1/finance/reconciliation/not-a-uuid')
      .expect(400)

    expect(read).not.toHaveBeenCalled()
  })
})
