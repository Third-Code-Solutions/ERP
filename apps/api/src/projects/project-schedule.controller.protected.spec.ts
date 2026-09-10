import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectScheduleController } from './project-schedule.controller'
import { ProjectScheduleService } from './project-schedule.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const base = `/v1/projects/${PROJECT_ID}/schedule/tasks`

describe('ProjectScheduleController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { list: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateStatus: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test' }] }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [ProjectScheduleController], providers: [{ provide: ProjectScheduleService, useValue: service }] }).compile()
    const app = module.createNestApplication(); const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close(); return { app, service }
  }

  it('allows viewers to read but denies schedule mutations', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).get(base).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).post(base).set('Authorization', 'Bearer valid').send({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: '', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }).expect(403)
    expect(service.list).toHaveBeenCalled(); expect(service.create).not.toHaveBeenCalled()
  })

  it('permits PM schedule management and keeps status mutation guarded', async () => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer()).post(`${base}/${TASK_ID}/status`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, status: 'in_progress', percentComplete: 20, actualStart: '2026-09-10', actualFinish: null, actualLaborMinutes: 30, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }).expect(200)
    expect(service.updateStatus).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, expect.objectContaining({ status: 'in_progress' }), expect.objectContaining({ role: 'pm' }))
  })
})
