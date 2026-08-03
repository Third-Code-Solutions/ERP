import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CustomerInvoiceReverseController } from './customer-invoice-reverse.controller'
import { CustomerInvoiceReverseService } from './customer-invoice-reverse.service'

const INVOICE_ID = '88888888-8888-4888-8888-888888888888'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Customer invoice reverse command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(reverse = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerInvoiceReverseController],
      providers: [{ provide: CustomerInvoiceReverseService, useValue: { reverse } }],
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

  it('requires an idempotency key before the command boundary', async () => {
    const reverse = vi.fn()
    const app = await appFor(reverse)
    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/reverse`)
      .send({ reason: 'Duplicate billing correction', postingDate: '2026-08-03' })
      .expect(400)
    expect(reverse).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects authority fields and forwards strict body', async () => {
    const reverse = vi.fn().mockResolvedValue({
      invoiceId: INVOICE_ID,
      tenantId: TENANT_ID,
      status: 'cancelled',
      reversalJournalEntryId: '55555555-5555-4555-8555-555555555555',
      reversalJournalEntryNumber: 'JE-2026-000013',
    })
    const app = await appFor(reverse)
    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/reverse`)
      .set('Idempotency-Key', ' invoice-reverse-1 ')
      .send({ reason: 'Duplicate billing correction', postingDate: '2026-08-03', tenantId: TENANT_ID })
      .expect(400)
    expect(reverse).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post(`/v1/finance/customer-invoices/${INVOICE_ID}/reverse`)
      .set('Idempotency-Key', ' invoice-reverse-1 ')
      .send({ reason: 'Duplicate billing correction', postingDate: '2026-08-03' })
      .expect(200)
    expect(reverse).toHaveBeenCalledWith(
      INVOICE_ID,
      { reason: 'Duplicate billing correction', postingDate: '2026-08-03' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'invoice-reverse-1'
    )
  }, 30_000)
})
