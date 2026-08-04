import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../src/auth/current-principal.decorator'
import { AccountsController } from '../src/crm/accounts.controller'
import { AccountsService } from '../src/crm/accounts.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Accounts API contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('normalizes collection filters before the tenant-scoped service', async () => {
    const list = vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      page: 2,
      limit: 50,
      totalPages: 1,
    })
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: AccountsService, useValue: { list } }],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'admin',
        email: 'admin@example.test',
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

    await request(app.getHttpServer())
      .get('/v1/crm/accounts?q=Acme&industry=office&kycStatus=approved&page=2&limit=50')
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      {
        q: 'Acme',
        industry: 'office',
        kycStatus: 'approved',
        sort: 'created_at',
        order: 'desc',
        page: 2,
        limit: 50,
      },
      expect.objectContaining({ tenantId: TENANT_ID })
    )
  })
})
