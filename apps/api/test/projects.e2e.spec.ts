import 'reflect-metadata'

import { ParseUUIDPipe, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../src/auth/current-principal.decorator'
import { ProjectsController } from '../src/projects/projects.controller'
import { ProjectsService } from '../src/projects/projects.service'

const PROJECT_ID = '33333333-3333-2333-8333-333333333333'
const HTTP_TEST_TIMEOUT_MS = 15_000

describe('Projects API contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it(
    'preserves the Project update HTTP contract for existing UUID formats',
    async () => {
      const update = vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
        name: 'Updated Project',
        client: 'Updated Client',
        status: 'active',
        projectType: 'fit_out',
        totalSqm: 125,
        location: 'Makati',
        notes: 'Controlled update',
        updatedAt: '2026-07-27T09:00:00.000Z',
      })
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          {
            provide: ProjectsService,
            useValue: { update },
          },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      app.use(
        (
          req: Request,
          _res: Response,
          next: NextFunction
        ) => {
          ;(req as AuthenticatedRequest).principal = {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId:
              '22222222-2222-4222-8222-222222222222',
            role: 'admin',
            email: 'admin@example.test',
          }
          next()
        }
      )
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.init()
      close = () => app.close()

      const response = await request(app.getHttpServer())
        .patch(`/v1/projects/${PROJECT_ID}`)
        .send({
          name: 'Updated Project',
          client: 'Updated Client',
          status: 'active',
          projectType: 'fit_out',
          totalSqm: 125,
          location: 'Makati',
          notes: 'Controlled update',
          expectedUpdatedAt: '2026-07-27T08:00:00.000Z',
        })
        .expect(200)

      expect(response.body).toMatchObject({
        id: PROJECT_ID,
        name: 'Updated Project',
      })
      expect(update).toHaveBeenCalledOnce()
    },
    HTTP_TEST_TIMEOUT_MS
  )

  it('still rejects malformed Project identifiers', async () => {
    const pipe = new ParseUUIDPipe()

    await expect(
      pipe.transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'projectId',
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it(
    'rejects unknown fields at the API boundary',
    async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          {
            provide: ProjectsService,
            useValue: { update: vi.fn() },
          },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      app.use(
        (
          req: Request,
          _res: Response,
          next: NextFunction
        ) => {
          ;(req as AuthenticatedRequest).principal = {
            userId: '11111111-1111-4111-8111-111111111111',
            tenantId:
              '22222222-2222-4222-8222-222222222222',
            role: 'admin',
            email: 'admin@example.test',
          }
          next()
        }
      )
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
        .patch(`/v1/projects/${PROJECT_ID}`)
        .send({
          name: 'Updated Project',
          client: 'Updated Client',
          status: 'active',
          projectType: null,
          totalSqm: null,
          location: null,
          notes: null,
          expectedUpdatedAt: '2026-07-27T08:00:00.000Z',
          tenantId: 'attacker-controlled',
        })
        .expect(400)
    },
    HTTP_TEST_TIMEOUT_MS
  )
})
