import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { ProcessController } from './process.controller'
import { ProcessService } from './process.service'

const STEP_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const STEP_COMMAND = {
  code: 'PR-L',
  stage: 'lead',
  name: 'Lead qualification',
  responsibleBu: 'Sales',
  input: 'Qualified lead',
  inputFrom: 'Coverage',
  output: 'Qualified opportunity',
  outputBy: 'Sales',
  slaDays: 2,
  isBusinessDays: true,
  clockScope: 'internal',
}

const STEP_RESULT = {
  id: STEP_ID,
  tenantId: TENANT_ID,
  code: 'PR-L',
  stage: 'lead',
  name: 'Lead qualification',
  responsibleBu: 'Sales',
  input: 'Qualified lead',
  inputFrom: 'Coverage',
  output: 'Qualified opportunity',
  outputBy: 'Sales',
  slaDays: 2,
  slaHours: null,
  isBusinessDays: true,
  clockScope: 'internal',
  templateLink: null,
  predecessorCode: null,
  isActive: true,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
}

const APPROVAL_ROUTE_PREVIEW_RESULT = {
  objectType: 'purchase_order',
  amountCentavos: '0',
  mode: 'preview_only',
  authority: 'configured_rules_only',
  status: 'unconfigured',
  steps: [],
}

const TASK_QUEUE_RESULT = {
  tenantId: TENANT_ID,
  rows: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 1,
}

describe('Process API HTTP contracts', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(service: Record<string, ReturnType<typeof vi.fn>>) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcessController],
      providers: [
        {
          provide: ProcessService,
          useValue: service,
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
          userId: USER_ID,
          tenantId: TENANT_ID,
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
    return app
  }

  it('creates a process step through the strict Zod boundary', async () => {
    const createStep = vi.fn().mockResolvedValue(STEP_RESULT)
    const app = await appFor({ createStep })

    const response = await request(app.getHttpServer())
      .post('/v1/process/steps')
      .send(STEP_COMMAND)
      .expect(201)

    expect(response.body).toEqual(STEP_RESULT)
    expect(createStep).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PR-L',
        isBusinessDays: true,
        slaDays: 2,
      }),
      expect.objectContaining({ tenantId: TENANT_ID })
    )
  })

  it('rejects unresolved owners and caller-controlled tenant fields', async () => {
    const createStep = vi.fn()
    const app = await appFor({ createStep })

    await request(app.getHttpServer())
      .post('/v1/process/steps')
      .send({
        ...STEP_COMMAND,
        responsibleBu: 'Commercial or SD - PM?',
        tenantId: TENANT_ID,
      })
      .expect(400)

    expect(createStep).not.toHaveBeenCalled()
  })

  it('rejects malformed task identifiers before service work', async () => {
    const assignTask = vi.fn()
    const app = await appFor({ assignTask })

    await request(app.getHttpServer())
      .patch('/v1/process/tasks/not-a-uuid/assignment')
      .send({ assignedTo: USER_ID })
      .expect(400)

    expect(assignTask).not.toHaveBeenCalled()
  })

  it('lists tasks through the strict, task-management queue boundary', async () => {
    const listTasks = vi.fn().mockResolvedValue(TASK_QUEUE_RESULT)
    const app = await appFor({ listTasks })

    await request(app.getHttpServer())
      .get(
        '/v1/process/tasks?status=blocked&responsibleBu=%20Commercial%20&page=2&limit=10'
      )
      .expect(200)
      .expect(TASK_QUEUE_RESULT)

    expect(listTasks).toHaveBeenCalledWith(
      {
        status: 'blocked',
        responsibleBu: 'Commercial',
        page: 2,
        limit: 10,
      },
      expect.objectContaining({ tenantId: TENANT_ID })
    )

    await request(app.getHttpServer())
      .get('/v1/process/tasks?status=blocked&unexpected=1')
      .expect(400)

    expect(listTasks).toHaveBeenCalledOnce()
    expect(
      Reflect.getMetadata(
        'third-code-erp:capabilities',
        ProcessController.prototype.listTasks
      )
    ).toEqual(['process.task.manage'])
  })

  it('strictly validates approval-rule query parameters', async () => {
    const listApprovalRules = vi.fn().mockResolvedValue([])
    const app = await appFor({ listApprovalRules })

    await request(app.getHttpServer())
      .get('/v1/process/approval-rules?objectType=purchase_order&unexpected=1')
      .expect(400)

    await request(app.getHttpServer())
      .get('/v1/process/approval-rules?objectType=purchase_order')
      .expect(200)

    expect(listApprovalRules).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      'purchase_order'
    )
  })

  it('previews an approval route through the strict read-only query boundary', async () => {
    const previewApprovalRoute = vi
      .fn()
      .mockResolvedValue(APPROVAL_ROUTE_PREVIEW_RESULT)
    const app = await appFor({ previewApprovalRoute })

    await request(app.getHttpServer())
      .get(
        '/v1/process/approval-route-preview?objectType=%20purchase_order%20&amountCentavos=0'
      )
      .expect(200)
      .expect(APPROVAL_ROUTE_PREVIEW_RESULT)

    expect(previewApprovalRoute).toHaveBeenCalledWith(
      {
        objectType: 'purchase_order',
        amountCentavos: '0',
      },
      expect.objectContaining({ tenantId: TENANT_ID })
    )

    await request(app.getHttpServer())
      .get(
        '/v1/process/approval-route-preview?objectType=purchase_order&amountCentavos=0&unexpected=1'
      )
      .expect(400)

    expect(previewApprovalRoute).toHaveBeenCalledOnce()
  })

  it('rejects blocked task status without a reason', async () => {
    const updateTaskStatus = vi.fn()
    const app = await appFor({ updateTaskStatus })

    await request(app.getHttpServer())
      .patch(`/v1/process/tasks/${STEP_ID}/status`)
      .send({ status: 'blocked' })
      .expect(400)

    expect(updateTaskStatus).not.toHaveBeenCalled()
  })
})
