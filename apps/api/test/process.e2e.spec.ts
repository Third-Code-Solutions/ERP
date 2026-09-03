import 'reflect-metadata'

import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../src/database/database.service'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { ProcessController } from '../src/process/process.controller'
import { ProcessService } from '../src/process/process.service'

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const VIEWER_ID = '22222222-2222-4222-8222-222222222222'
const TENANT_ID = '33333333-3333-4333-8333-333333333333'
const STEP_ID = '44444444-4444-4444-8444-444444444444'

const COMMAND = {
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

function databaseWithMembership(
  role: 'admin' | 'viewer'
): DatabaseService {
  const limit = vi.fn().mockResolvedValue([
    {
      tenantId: TENANT_ID,
      role,
      email: `${role}@example.test`,
      accountStatus: 'active',
      tenantStatus: 'active',
    },
  ])
  const where = vi.fn().mockReturnValue({ limit })
  const innerJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ innerJoin })
  const select = vi.fn().mockReturnValue({ from })
  return { client: { select } } as unknown as DatabaseService
}

describe('Process API authenticated contract E2E', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(role: 'admin' | 'viewer') {
    const userId = role === 'admin' ? ADMIN_ID : VIEWER_ID
    const createStep = vi.fn().mockResolvedValue({
      id: STEP_ID,
      tenantId: TENANT_ID,
      ...COMMAND,
      slaHours: null,
      templateLink: null,
      predecessorCode: null,
      isActive: true,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    })
    const health = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      observeMode: true,
      byBu: [],
      generatedAt: '2026-08-12T00:00:00.000Z',
    })
    const updateTaskStatus = vi.fn().mockResolvedValue({
      id: STEP_ID,
      tenantId: TENANT_ID,
      processStepId: STEP_ID,
      subjectType: 'opportunity',
      subjectId: STEP_ID,
      instanceKey: 'opportunity:step:PR-L',
      assignedTo: ADMIN_ID,
      status: 'completed',
      blockedReason: null,
      startedAt: '2026-08-12T00:00:00.000Z',
      completedAt: '2026-08-12T01:00:00.000Z',
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    })
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId }),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcessController],
      providers: [
        Reflector,
        SupabaseJwtGuard,
        CapabilityGuard,
        {
          provide: SupabaseIdentityService,
          useValue: identity,
        },
        {
          provide: DatabaseService,
          useValue: databaseWithMembership(role),
        },
        {
          provide: ProcessService,
          useValue: { createStep, health, updateTaskStatus },
        },
        {
          provide: APP_GUARD,
          useExisting: SupabaseJwtGuard,
        },
        {
          provide: APP_GUARD,
          useExisting: CapabilityGuard,
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    await app.init()
    close = () => app.close()
    return { app, createStep, health, updateTaskStatus }
  }

  it('runs authenticated admin process-step command and health read', async () => {
    const probe = await appFor('admin')

    await request(probe.app.getHttpServer())
      .post('/v1/process/steps')
      .set('Authorization', 'Bearer admin-token')
      .send(COMMAND)
      .expect(201)

    await request(probe.app.getHttpServer())
      .get('/v1/process/health')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)

    expect(probe.createStep).toHaveBeenCalledOnce()
    expect(probe.health).toHaveBeenCalledOnce()
  }, 30_000)

  it('enforces capability boundary for viewer mutation', async () => {
    const probe = await appFor('viewer')

    await request(probe.app.getHttpServer())
      .post('/v1/process/steps')
      .set('Authorization', 'Bearer viewer-token')
      .send(COMMAND)
      .expect(403)

    expect(probe.createStep).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects unauthenticated process access', async () => {
    const probe = await appFor('admin')

    await request(probe.app.getHttpServer())
      .get('/v1/process/health')
      .expect(401)

    expect(probe.health).not.toHaveBeenCalled()
  }, 30_000)

  it('routes task completion through the authenticated capability boundary', async () => {
    const probe = await appFor('admin')

    await request(probe.app.getHttpServer())
      .patch(`/v1/process/tasks/${STEP_ID}/status`)
      .set('Authorization', 'Bearer admin-token')
      .send({ status: 'completed' })
      .expect(200)

    expect(probe.updateTaskStatus).toHaveBeenCalledOnce()
  }, 30_000)
})
