import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import { ValidationPipe } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../src/auth/current-principal.decorator'
import { OpportunitiesController } from '../src/crm/opportunities.controller'
import { OpportunitiesService } from '../src/crm/opportunities.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'

describe('Opportunities API contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('passes the UUID detail read to the tenant-scoped service', async () => {
    const read = vi.fn().mockResolvedValue({
      opportunity: { id: OPPORTUNITY_ID, tenantId: TENANT_ID },
      progress: {},
    })
    const moduleRef = await Test.createTestingModule({
      controllers: [OpportunitiesController],
      providers: [{ provide: OpportunitiesService, useValue: { read } }],
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
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    await app.init()
    close = () => app.close()

    await request(app.getHttpServer())
      .get(`/v1/crm/opportunities/${OPPORTUNITY_ID}`)
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      expect.objectContaining({ tenantId: TENANT_ID, role: 'sales' })
    )
  })
})
