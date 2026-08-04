import 'reflect-metadata'

import {
  Logger,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../src/auth/current-principal.decorator'
import { DatabaseModule } from '../src/database/database.module'
import { DatabaseService } from '../src/database/database.service'
import { REQUEST_ID_HEADER } from '../src/observability/request-observability.middleware'
import { ProjectsController } from '../src/projects/projects.controller'
import { ProjectsModule } from '../src/projects/projects.module'
import { ProjectsService } from '../src/projects/projects.service'

const PROJECT_ID = '33333333-3333-2333-8333-333333333333'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const HTTP_TEST_TIMEOUT_MS = 15_000

describe('Projects API contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it(
    'creates a Project through the typed POST command boundary',
    async () => {
      const create = vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
        name: 'New Project',
        client: 'New Client',
        status: 'lead',
        projectType: null,
        totalSqm: null,
        location: null,
        notes: null,
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
      })
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          {
            provide: ProjectsService,
            useValue: { create, update: vi.fn() },
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
        .post('/v1/projects')
        .set('Idempotency-Key', 'project-create-1')
        .send({ name: 'New Project', client: 'New Client' })
        .expect(201)

      expect(response.body).toMatchObject({
        id: PROJECT_ID,
        status: 'lead',
      })
      expect(create).toHaveBeenCalledWith(
        {
          name: 'New Project',
          client: 'New Client',
          status: 'lead',
          projectType: null,
          totalSqm: null,
          location: null,
          notes: null,
        },
        expect.objectContaining({
          tenantId: '22222222-2222-4222-8222-222222222222',
        }),
        'project-create-1'
      )
    },
    HTTP_TEST_TIMEOUT_MS
  )

  it(
    'reads a Project through the tenant-scoped GET contract',
    async () => {
      const read = vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
        name: 'Read Project',
        client: 'Read Client',
        status: 'active',
        projectType: 'mep',
        totalSqm: 125,
        location: 'Makati',
        notes: null,
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
        accountId: null,
        createdBy: '11111111-1111-4111-8111-111111111111',
      })
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          {
            provide: ProjectsService,
            useValue: { read },
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
            role: 'viewer',
            email: 'viewer@example.test',
          }
          next()
        }
      )
      await app.init()
      close = () => app.close()

      const response = await request(app.getHttpServer())
        .get(`/v1/projects/${PROJECT_ID}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: PROJECT_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
        name: 'Read Project',
      })
      expect(read).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ role: 'viewer' })
      )
    },
    HTTP_TEST_TIMEOUT_MS
  )

  it(
    'lists Projects through the bounded tenant-scoped GET contract',
    async () => {
      const list = vi.fn().mockResolvedValue({
        rows: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      })
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          {
            provide: ProjectsService,
            useValue: { list },
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
            role: 'viewer',
            email: 'viewer@example.test',
          }
          next()
        }
      )
      await app.init()
      close = () => app.close()

      const response = await request(app.getHttpServer())
        .get('/v1/projects?q=office&status=active&page=2&limit=50')
        .expect(200)

      expect(response.body).toMatchObject({
        rows: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      })
      expect(list).toHaveBeenCalledWith(
        {
          q: 'office',
          status: 'active',
          sort: 'created_at',
          order: 'desc',
          page: 2,
          limit: 50,
        },
        expect.objectContaining({ role: 'viewer' })
      )
    },
    HTTP_TEST_TIMEOUT_MS
  )

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
    'applies sanitized command correlation through ProjectsModule',
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
        imports: [DatabaseModule, ProjectsModule],
      })
        .overrideProvider(DatabaseService)
        .useValue({})
        .overrideProvider(ProjectsService)
        .useValue({ update })
        .compile()
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
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined)
      await app.init()
      close = () => app.close()

      const response = await request(app.getHttpServer())
        .patch(`/v1/projects/${PROJECT_ID}`)
        .set(REQUEST_ID_HEADER, REQUEST_ID)
        .send({
          name: 'Updated Project',
          client: 'Updated Client',
          status: 'active',
          projectType: 'fit_out',
          totalSqm: 125,
          location: 'Makati',
          notes: 'never-log-this-command-payload',
          expectedUpdatedAt: '2026-07-27T08:00:00.000Z',
        })
        .expect(200)

      expect(response.headers[REQUEST_ID_HEADER]).toBe(REQUEST_ID)
      const outcomeCall = log.mock.calls.find(([value]) =>
        String(value).includes('"event":"erp.command.outcome"')
      )
      expect(outcomeCall).toBeDefined()
      const serialized = String(outcomeCall?.[0])
      expect(JSON.parse(serialized)).toMatchObject({
        requestId: REQUEST_ID,
        operation: 'project.update',
        statusCode: 200,
        outcome: 'succeeded',
      })
      expect(serialized).not.toContain(
        'never-log-this-command-payload'
      )
      expect(serialized).not.toContain(PROJECT_ID)
    },
    HTTP_TEST_TIMEOUT_MS
  )

  it(
    'rejects unknown fields at the API boundary',
    async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [ProjectsController],
        providers: [
          {
            provide: ProjectsService,
            useValue: { create: vi.fn(), update: vi.fn() },
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
