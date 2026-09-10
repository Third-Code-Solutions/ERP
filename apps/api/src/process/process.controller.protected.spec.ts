import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import { ProcessController } from './process.controller'
import { ProcessService } from './process.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function databaseWithMembership(
  membership:
    | { tenantId: string; role: string; email: string }
    | undefined
): DatabaseService {
  const limit = vi.fn().mockResolvedValue(membership ? [membership] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return { client: { select } } as unknown as DatabaseService
}

describe('Process API protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    membership:
      | { tenantId: string; role: string; email: string }
      | undefined,
    listTasks = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      rows: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 1,
    }),
    updateTaskStatus = vi.fn().mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: TENANT_ID,
      processStepId: '33333333-3333-4333-8333-333333333333',
      subjectType: 'opportunity',
      subjectId: '55555555-5555-4555-8555-555555555555',
      instanceKey: 'opportunity:55555555-5555-4555-8555-555555555555:PR-L',
      assignedTo: null,
      status: 'in_progress',
      blockedReason: null,
      startedAt: '2026-08-12T00:00:00.000Z',
      completedAt: null,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    })
  ) {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }),
    } as unknown as SupabaseIdentityService
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcessController],
      providers: [
        {
          provide: ProcessService,
          useValue: { listTasks, updateTaskStatus },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(
        identity,
        reflector,
        databaseWithMembership(membership)
      ),
      new CapabilityGuard(reflector)
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
    return { app, identity, listTasks, updateTaskStatus }
  }

  it('rejects a missing bearer before Core service invocation', async () => {
    const harness = await appFor({
      tenantId: TENANT_ID,
      role: 'admin',
      email: 'admin@example.test',
    })

    await request(harness.app.getHttpServer())
      .get('/v1/process/tasks')
      .expect(401)

    expect(harness.identity.verifyAccessToken).not.toHaveBeenCalled()
    expect(harness.listTasks).not.toHaveBeenCalled()
  })

  it('denies a verified role without process.task.manage', async () => {
    const harness = await appFor({
      tenantId: TENANT_ID,
      role: 'viewer',
      email: 'viewer@example.test',
    })

    await request(harness.app.getHttpServer())
      .get('/v1/process/tasks')
      .set('Authorization', 'Bearer verified-token')
      .expect(403)

    expect(harness.listTasks).not.toHaveBeenCalled()
  })

  it('denies a verified role without process.task.manage before PATCH service work', async () => {
    const harness = await appFor({
      tenantId: TENANT_ID,
      role: 'viewer',
      email: 'viewer@example.test',
    })

    await request(harness.app.getHttpServer())
      .patch('/v1/process/tasks/44444444-4444-4444-8444-444444444444/status')
      .set('Authorization', 'Bearer verified-token')
      .send({ status: 'in_progress' })
      .expect(403)

    expect(harness.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('passes verified tenant membership to an authorized caller', async () => {
    const harness = await appFor({
      tenantId: TENANT_ID,
      role: 'admin',
      email: 'admin@example.test',
    })

    await request(harness.app.getHttpServer())
      .get('/v1/process/tasks?status=blocked')
      .set('Authorization', 'Bearer verified-token')
      .expect(200)

    expect(harness.listTasks).toHaveBeenCalledWith(
      { status: 'blocked', page: 1, limit: 25 },
      expect.objectContaining({
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'admin',
      })
    )
  })
})
