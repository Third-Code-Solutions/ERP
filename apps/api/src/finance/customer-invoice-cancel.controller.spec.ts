import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CustomerInvoiceCancelController } from './customer-invoice-cancel.controller'
import { CustomerInvoiceCancelService } from './customer-invoice-cancel.service'

const INVOICE_ID = '88888888-8888-4888-8888-888888888888'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Customer invoice cancel command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(cancel = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerInvoiceCancelController],
      providers: [{ provide: CustomerInvoiceCancelService, useValue: { cancel } }],
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
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
    )
    await app.init()
    close = () => app.close()
    return app
  }

  it('requires an idempotency key before the cancellation boundary', async () => {
    const cancel = vi.fn()
    const app = await appFor(cancel)
    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/cancel`)
      .send({})
      .expect(400)
    expect(cancel).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects authority fields and forwards the strict empty body', async () => {
    const cancel = vi.fn().mockResolvedValue({
      invoiceId: INVOICE_ID,
      tenantId: TENANT_ID,
      status: 'cancelled',
    })
    const app = await appFor(cancel)
    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/cancel`)
      .set('Idempotency-Key', ' invoice-cancel-1 ')
      .send({ tenantId: TENANT_ID })
      .expect(400)
    expect(cancel).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/cancel`)
      .set('Idempotency-Key', ' invoice-cancel-1 ')
      .send({})
      .expect(200)
    expect(cancel).toHaveBeenCalledWith(
      INVOICE_ID,
      {},
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'invoice-cancel-1'
    )
  }, 30_000)
})
