import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { OpportunityCreationController } from './opportunity-creation.controller'
import { OpportunityCreationPipe } from './opportunity-creation.pipe'
import { OpportunityCreationService } from './opportunity-creation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('Opportunity creation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [OpportunityCreationController],
      providers: [
        OpportunityCreationPipe,
        { provide: OpportunityCreationService, useValue: { create } },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'sales',
        email: 'sales@example.test',
      }
      next()
    })
    await app.init()
    close = () => app.close()
    return app
  }

  it('requires an idempotency key before the Core command', async () => {
    const create = vi.fn()
    const app = await appFor(create)
    await request(app.getHttpServer())
      .post('/v1/crm/opportunities')
      .send({ projectId: PROJECT_ID })
      .expect(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects browser-owned tenant, Account, and non-initial stage fields', async () => {
    const create = vi.fn()
    const app = await appFor(create)
    await request(app.getHttpServer())
      .post('/v1/crm/opportunities')
      .set('Idempotency-Key', 'create-1')
      .send({
        projectId: PROJECT_ID,
        accountId: '44444444-4444-4444-8444-444444444444',
        tenantId: TENANT_ID,
        stage: 'design',
      })
      .expect(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('forwards the strict command, current principal, and trimmed key', async () => {
    const create = vi.fn().mockResolvedValue({ ok: true })
    const app = await appFor(create)
    await request(app.getHttpServer())
      .post('/v1/crm/opportunities')
      .set('Idempotency-Key', ' create-1 ')
      .send({
        projectId: PROJECT_ID,
        tcvCents: '10005',
        gpCents: '-2000',
        closingDate: '2026-09-03T00:00:00+08:00',
      })
      .expect(201)
    expect(create).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        stage: 'opportunity_creation',
        tcvCents: '10005',
        gpCents: '-2000',
        closingDate: '2026-09-03T00:00:00+08:00',
      },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'sales' }),
      'create-1'
    )
  })
})
