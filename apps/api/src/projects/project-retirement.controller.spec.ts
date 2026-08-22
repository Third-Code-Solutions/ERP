import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { ProjectRetirementController } from './project-retirement.controller'
import { ProjectRetirementService } from './project-retirement.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const EXPECTED_UPDATED_AT = '2026-08-19T00:00:00.000Z'

describe('Project retirement HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(retire = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectRetirementController],
      providers: [
        {
          provide: ProjectRetirementService,
          useValue: { retire },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'admin',
        email: 'admin@example.test',
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

  it('requires an idempotency key before the retirement boundary', async () => {
    const retire = vi.fn()
    const app = await appFor(retire)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}`)
      .send({
        reason: 'Duplicate project record',
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      })
      .expect(400)

    expect(retire).not.toHaveBeenCalled()
  })

  it('rejects browser-owned identity fields and an invalid command', async () => {
    const retire = vi.fn()
    const app = await appFor(retire)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}`)
      .set('Idempotency-Key', 'project-retire-1')
      .send({
        reason: ' ',
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        tenantId: TENANT_ID,
      })
      .expect(400)

    expect(retire).not.toHaveBeenCalled()
  })

  it('forwards only the validated command and authenticated principal', async () => {
    const retire = vi.fn().mockResolvedValue({
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      deleted: true,
      retiredAt: '2026-08-19T01:00:00.000Z',
    })
    const app = await appFor(retire)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}`)
      .set('Idempotency-Key', 'project-retire-1')
      .send({
        reason: ' Duplicate project record ',
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      })
      .expect(200)

    expect(retire).toHaveBeenCalledWith(
      PROJECT_ID,
      {
        reason: 'Duplicate project record',
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'admin' }),
      'project-retire-1'
    )
  })
})
