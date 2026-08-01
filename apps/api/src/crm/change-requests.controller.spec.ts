import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { ChangeRequestsController } from './change-requests.controller'
import { ChangeRequestCreationService } from './change-request-creation.service'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const COMMAND = {
  requestedByName: 'Client PM',
  description: 'Move the reception wall.',
  priority: 'minor',
}

describe('Change Request command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChangeRequestsController],
      providers: [
        {
          provide: ChangeRequestCreationService,
          useValue: { create },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        role: 'sales',
        email: 'sales@example.test',
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
      .post(`/v1/crm/opportunities/${OPPORTUNITY_ID}/change-requests`)
      .send(COMMAND)
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  }, 30_000)

  it('keeps tenant authority out of the browser command', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/crm/opportunities/${OPPORTUNITY_ID}/change-requests`)
      .set('Idempotency-Key', 'change-request-1')
      .send({ ...COMMAND, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards validated command, path authority, and principal', async () => {
    const create = vi.fn().mockResolvedValue({
      changeRequestId: '44444444-4444-4444-8444-444444444444',
      tenantId: '22222222-2222-4222-8222-222222222222',
      status: 'open',
      created: true,
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/crm/opportunities/${OPPORTUNITY_ID}/change-requests`)
      .set('Idempotency-Key', ' change-request-1 ')
      .send(COMMAND)
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      COMMAND,
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'change-request-1'
    )
  }, 30_000)
})
