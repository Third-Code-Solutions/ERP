import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { SupplierBillPostController } from './supplier-bill-post.controller'
import { SupplierBillPostService } from './supplier-bill-post.service'

const BILL_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Supplier Bill post command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(post = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupplierBillPostController],
      providers: [
        {
          provide: SupplierBillPostService,
          useValue: { post },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use(
      (
        req: Request,
        _res: Response,
        next: NextFunction
      ) => {
        ;(req as AuthenticatedRequest).principal = {
          userId: USER_ID,
          tenantId: TENANT_ID,
          role: 'finance',
          email: 'finance@example.test',
        }
        next()
      }
    )
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

  it('requires an idempotency key before the command boundary', async () => {
    const post = vi.fn()
    const app = await appFor(post)

    await request(app.getHttpServer())
      .post(`/v1/finance/supplier-bills/${BILL_ID}/post`)
      .send({ postingDate: '2026-08-02' })
      .expect(400)

    expect(post).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects authority fields and forwards strict command data', async () => {
    const post = vi.fn().mockResolvedValue({
      supplierBillId: BILL_ID,
      tenantId: TENANT_ID,
      status: 'posted',
      supplierBillNumber: 'SB-2026-000001',
      journalEntryId: '55555555-5555-4555-8555-555555555555',
      journalEntryNumber: 'JE-2026-000010',
    })
    const app = await appFor(post)

    await request(app.getHttpServer())
      .post(`/v1/finance/supplier-bills/${BILL_ID}/post`)
      .set('Idempotency-Key', ' supplier-bill-post-1 ')
      .send({
        postingDate: '2026-08-02',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
      .expect(400)

    expect(post).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post(`/v1/finance/supplier-bills/${BILL_ID}/post`)
      .set('Idempotency-Key', ' supplier-bill-post-1 ')
      .send({ postingDate: '2026-08-02' })
      .expect(200)

    expect(post).toHaveBeenCalledWith(
      BILL_ID,
      { postingDate: '2026-08-02' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'supplier-bill-post-1'
    )
  }, 30_000)
})
