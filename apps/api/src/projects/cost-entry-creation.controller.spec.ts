import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CostEntryCreationController } from './cost-entry-creation.controller'
import { CostEntryCreationService } from './cost-entry-creation.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const COMMAND = {
  costCodeId: '44444444-4444-4444-8444-444444444444',
  costCategory: 'material',
  description: 'Concrete delivery',
  amountCents: 125_000,
  quantity: 2,
  unit: 'lot',
  incurredAt: '2026-08-05T00:00:00.000Z',
  referenceNumber: null,
  notes: null,
}

describe('Cost entry creation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CostEntryCreationController],
      providers: [
        {
          provide: CostEntryCreationService,
          useValue: { create },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'pm',
        email: 'pm@example.test',
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
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/cost-entries`)
      .send(COMMAND)
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('rejects browser-owned tenant and project fields', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/cost-entries`)
      .set('Idempotency-Key', 'cost-create-1')
      .send({ ...COMMAND, tenantId: TENANT_ID, projectId: PROJECT_ID })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('forwards the normalized command and verified principal', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      costCodeId: COMMAND.costCodeId,
      costCategory: 'material',
      costSource: 'manual',
      description: COMMAND.description,
      amountCents: COMMAND.amountCents,
      quantity: COMMAND.quantity,
      unit: COMMAND.unit,
      incurredAt: COMMAND.incurredAt,
      referenceNumber: null,
      notes: null,
      createdAt: COMMAND.incurredAt,
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/cost-entries`)
      .set('Idempotency-Key', 'cost-create-1')
      .send({ ...COMMAND, description: ' Concrete delivery ' })
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        costCodeId: COMMAND.costCodeId,
        description: 'Concrete delivery',
      }),
      expect.objectContaining({ tenantId: TENANT_ID, role: 'pm' }),
      'cost-create-1'
    )
  })
})
