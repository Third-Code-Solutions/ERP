import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectWeeklyProgressController } from './project-weekly-progress.controller'
import { ProjectWeeklyProgressService } from './project-weekly-progress.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PERIOD_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const base = `/v1/projects/${PROJECT_ID}/progress/weekly`
const payload = {
  projectId: PROJECT_ID,
  clientRequestId: REQUEST_ID,
  weekEnding: '2026-09-13',
  percentByCategory: { civil_pct: 10, electrical_pct: 20, mep_pct: 30, finishes_pct: 40, overall_pct: 25 },
  notes: '',
}

describe('ProjectWeeklyProgressController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { list: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}), lock: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = {
      client: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test' }],
            }),
          }),
        }),
      },
    }
    const module = await Test.createTestingModule({
      controllers: [ProjectWeeklyProgressController],
      providers: [{ provide: ProjectWeeklyProgressService, useValue: service }],
    }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService),
      new CapabilityGuard(reflector),
    )
    await app.init()
    close = () => app.close()
    return { app, service }
  }

  it('allows viewers to read but denies weekly capture and lock', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).get(base).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).post(base).set('Authorization', 'Bearer valid').send(payload).expect(403)
    await request(app.getHttpServer()).post(`${base}/${PERIOD_ID}/lock`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, lockReason: '' }).expect(403)
    expect(service.list).toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
    expect(service.lock).not.toHaveBeenCalled()
  })

  it('permits PM capture and lock routes', async () => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer()).post(base).set('Authorization', 'Bearer valid').send(payload).expect(201)
    await request(app.getHttpServer()).post(`${base}/${PERIOD_ID}/lock`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, lockReason: '' }).expect(200)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), expect.objectContaining({ role: 'pm' }))
    expect(service.lock).toHaveBeenCalledWith(PROJECT_ID, PERIOD_ID, expect.objectContaining({ expectedVersion: 1 }), expect.objectContaining({ role: 'pm' }))
  })
})
