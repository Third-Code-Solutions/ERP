import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InventoryStockMovementWorkflowController } from './inventory-stock-movement-workflow.controller'
import { InventoryStockMovementWorkflowService } from './inventory-stock-movement-workflow.service'

const MOVEMENT_ID = '77777777-7777-4777-8777-777777777777'
const TENANT_ID = '55555555-5555-4555-8555-555555555555'

describe('Stock Movement workflow HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(workflow = { post: vi.fn(), reverse: vi.fn() }) {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryStockMovementWorkflowController],
      providers: [{ provide: InventoryStockMovementWorkflowService, useValue: workflow }],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '44444444-4444-4444-8444-444444444444',
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

  it('requires an idempotency key for posting and reversal', async () => {
    const workflow = { post: vi.fn(), reverse: vi.fn() }
    const app = await appFor(workflow)

    await request(app.getHttpServer())
      .post(`/v1/inventory/stock-movements/${MOVEMENT_ID}/post`)
      .send({})
      .expect(400)
    await request(app.getHttpServer())
      .post(`/v1/inventory/stock-movements/${MOVEMENT_ID}/reverse`)
      .send({ reason: 'Correction', reversalDate: '2026-08-05' })
      .expect(400)

    expect(workflow.post).not.toHaveBeenCalled()
    expect(workflow.reverse).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects browser-supplied tenant/actor fields', async () => {
    const workflow = { post: vi.fn(), reverse: vi.fn() }
    const app = await appFor(workflow)

    await request(app.getHttpServer())
      .post(`/v1/inventory/stock-movements/${MOVEMENT_ID}/post`)
      .set('Idempotency-Key', 'movement-post-1')
      .send({ tenantId: '66666666-6666-4666-8666-666666666666' })
      .expect(400)

    expect(workflow.post).not.toHaveBeenCalled()
  })

  it('forwards only validated commands, principal, and trimmed retry keys', async () => {
    const workflow = {
      post: vi.fn().mockResolvedValue({
        stockMovementId: MOVEMENT_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        movementNumber: 'SM-2026-000001',
        journalEntryId: null,
        journalEntryNumber: null,
      }),
      reverse: vi.fn().mockResolvedValue({
        stockMovementId: MOVEMENT_ID,
        tenantId: TENANT_ID,
        status: 'reversed',
        reversalJournalEntryId: null,
        reversalJournalEntryNumber: null,
      }),
    }
    const app = await appFor(workflow)

    await request(app.getHttpServer())
      .post(`/v1/inventory/stock-movements/${MOVEMENT_ID}/post`)
      .set('Idempotency-Key', ' movement-post-1 ')
      .send({})
      .expect(200)
    await request(app.getHttpServer())
      .post(`/v1/inventory/stock-movements/${MOVEMENT_ID}/reverse`)
      .set('Idempotency-Key', ' movement-reverse-1 ')
      .send({ reason: '  Supplier correction  ', reversalDate: '2026-08-05' })
      .expect(200)

    expect(workflow.post).toHaveBeenCalledWith(
      MOVEMENT_ID,
      {},
      expect.objectContaining({ tenantId: TENANT_ID }),
      'movement-post-1'
    )
    expect(workflow.reverse).toHaveBeenCalledWith(
      MOVEMENT_ID,
      { reason: 'Supplier correction', reversalDate: '2026-08-05' },
      expect.objectContaining({ tenantId: TENANT_ID }),
      'movement-reverse-1'
    )
  })
})
