import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CashTransactionWorkflowController } from './cash-transaction-workflow.controller'
import { CashTransactionWorkflowService } from './cash-transaction-workflow.service'

const CASH_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Cash transaction workflow HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(post = vi.fn(), reverse = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CashTransactionWorkflowController],
      providers: [
        {
          provide: CashTransactionWorkflowService,
          useValue: { post, reverse },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: USER_ID,
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

  it('requires idempotency before either command boundary', async () => {
    const post = vi.fn()
    const reverse = vi.fn()
    const app = await appFor(post, reverse)

    await request(app.getHttpServer())
      .post(`/v1/finance/cash-transactions/${CASH_ID}/post`)
      .send({ postingDate: '2026-08-02' })
      .expect(400)
    await request(app.getHttpServer())
      .post(`/v1/finance/cash-transactions/${CASH_ID}/reverse`)
      .send({ reason: 'Bank returned transfer', postingDate: '2026-08-02' })
      .expect(400)

    expect(post).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards strict tenant-independent command bodies and trimmed keys', async () => {
    const post = vi.fn().mockResolvedValue({})
    const reverse = vi.fn().mockResolvedValue({})
    const app = await appFor(post, reverse)

    await request(app.getHttpServer())
      .post(`/v1/finance/cash-transactions/${CASH_ID}/post`)
      .set('Idempotency-Key', ' cash-post-1 ')
      .send({ postingDate: '2026-08-02', tenantId: TENANT_ID })
      .expect(400)
    await request(app.getHttpServer())
      .post(`/v1/finance/cash-transactions/${CASH_ID}/post`)
      .set('Idempotency-Key', ' cash-post-1 ')
      .send({ postingDate: '2026-08-02' })
      .expect(200)
    await request(app.getHttpServer())
      .post(`/v1/finance/cash-transactions/${CASH_ID}/reverse`)
      .set('Idempotency-Key', ' cash-reverse-1 ')
      .send({ reason: 'Bank returned transfer', postingDate: '2026-08-02' })
      .expect(200)

    expect(post).toHaveBeenCalledWith(
      CASH_ID,
      { postingDate: '2026-08-02' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'cash-post-1'
    )
    expect(reverse).toHaveBeenCalledWith(
      CASH_ID,
      { reason: 'Bank returned transfer', postingDate: '2026-08-02' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'cash-reverse-1'
    )
  }, 30_000)
})
