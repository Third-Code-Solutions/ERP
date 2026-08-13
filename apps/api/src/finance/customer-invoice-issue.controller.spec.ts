import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CustomerInvoiceIssueController } from './customer-invoice-issue.controller'
import { CustomerInvoiceIssueService } from './customer-invoice-issue.service'

const INVOICE_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Customer invoice issue command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(issue = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerInvoiceIssueController],
      providers: [
        {
          provide: CustomerInvoiceIssueService,
          useValue: { issue },
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

  it('requires an idempotency key before the command boundary', async () => {
    const issue = vi.fn()
    const app = await appFor(issue)

    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/issue`)
      .send({ postingDate: '2026-08-02' })
      .expect(400)

    expect(issue).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects authority fields and forwards strict command data', async () => {
    const issue = vi.fn().mockResolvedValue({})
    const app = await appFor(issue)

    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/issue`)
      .set('Idempotency-Key', ' invoice-issue-1 ')
      .send({
        postingDate: '2026-08-02',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
      .expect(400)

    expect(issue).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/issue`)
      .set('Idempotency-Key', ' invoice-issue-1 ')
      .send({ postingDate: '2026-08-02' })
      .expect(200)

    expect(issue).toHaveBeenCalledWith(
      INVOICE_ID,
      { postingDate: '2026-08-02' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'invoice-issue-1'
    )
  }, 30_000)
})
