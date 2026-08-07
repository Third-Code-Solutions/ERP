import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CustomerInvoiceDraftCreateController } from './customer-invoice-draft-create.controller'
import { CustomerInvoiceDraftCreateService } from './customer-invoice-draft-create.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const BODY = {
  billingPercentBps: 2500,
  bomId: null,
  dueDate: '2026-08-15',
  notes: 'Progress billing',
}

describe('Customer invoice draft creation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerInvoiceDraftCreateController],
      providers: [
        { provide: CustomerInvoiceDraftCreateService, useValue: { create } },
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

  it('requires an idempotency key', async () => {
    const create = vi.fn()
    const app = await appFor(create)
    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/customer-invoices`)
      .send(BODY)
      .expect(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects authority fields and forwards strict input', async () => {
    const create = vi.fn().mockResolvedValue({
      invoiceId: '44444444-4444-4444-8444-444444444444',
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      status: 'draft',
      invoiceNumber: 'INV-202608-001',
      billingPercentBps: 2500,
      retentionBps: 1000,
      subtotalCents: 0,
      retentionCents: 0,
      vatCents: 0,
      withholdingTaxCents: 0,
      netAmountCents: 0,
      dueDate: '2026-08-15T00:00:00.000Z',
      notes: 'Progress billing',
    })
    const app = await appFor(create)
    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/customer-invoices`)
      .set('Idempotency-Key', ' invoice-draft-1 ')
      .send({ ...BODY, tenantId: TENANT_ID })
      .expect(400)
    expect(create).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/customer-invoices`)
      .set('Idempotency-Key', ' invoice-draft-1 ')
      .send(BODY)
      .expect(201)
    expect(create).toHaveBeenCalledWith(
      PROJECT_ID,
      BODY,
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'invoice-draft-1'
    )
  })
})
