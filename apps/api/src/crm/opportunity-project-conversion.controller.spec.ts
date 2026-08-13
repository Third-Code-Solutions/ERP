import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { OpportunityProjectConversionController } from './opportunity-project-conversion.controller'
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

describe('Won-to-Project command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(convert = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [OpportunityProjectConversionController],
      providers: [
        {
          provide: OpportunityProjectConversionService,
          useValue: { convert },
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

  it('requires an idempotency key', async () => {
    const convert = vi.fn()
    const app = await appFor(convert)

    await request(app.getHttpServer())
      .post(`/v1/crm/opportunities/${OPPORTUNITY_ID}/convert-to-project`)
      .send({})
      .expect(400)

    expect(convert).not.toHaveBeenCalled()
  }, 30_000)

  it('keeps tenant authority out of the browser command', async () => {
    const convert = vi.fn()
    const app = await appFor(convert)

    await request(app.getHttpServer())
      .post(`/v1/crm/opportunities/${OPPORTUNITY_ID}/convert-to-project`)
      .set('Idempotency-Key', 'conversion-1')
      .send({ tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(400)

    expect(convert).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards path authority, empty command, principal, and trimmed key', async () => {
    const convert = vi.fn().mockResolvedValue({
      ok: true,
      opportunityId: OPPORTUNITY_ID,
      projectId: '44444444-4444-4444-8444-444444444444',
      checklistId: '55555555-5555-4555-8555-555555555555',
      tenantId: '22222222-2222-4222-8222-222222222222',
      createdProject: true,
    })
    const app = await appFor(convert)

    await request(app.getHttpServer())
      .post(`/v1/crm/opportunities/${OPPORTUNITY_ID}/convert-to-project`)
      .set('Idempotency-Key', ' conversion-1 ')
      .send({})
      .expect(200)

    expect(convert).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      {},
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
      }),
      'conversion-1'
    )
  }, 30_000)
})
