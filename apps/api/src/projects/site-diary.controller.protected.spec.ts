import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { SiteDiaryController } from './site-diary.controller'
import { SiteDiaryService } from './site-diary.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Site diary protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function harness(role: string) {
    const service = {
      list: vi.fn().mockResolvedValue({ rows: [] }),
      create: vi.fn().mockResolvedValue({ created: true }),
      update: vi.fn().mockResolvedValue({ changed: true }),
      submit: vi.fn().mockResolvedValue({ changed: true }),
    }
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
      controllers: [SiteDiaryController],
      providers: [{ provide: SiteDiaryService, useValue: service }],
    }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(
        identity as unknown as SupabaseIdentityService,
        reflector,
        database as unknown as DatabaseService,
      ),
      new CapabilityGuard(reflector),
    )
    await app.init()
    close = () => app.close()
    return { app, service }
  }

  const createBody = {
    projectId: PROJECT_ID,
    clientRequestId: REQUEST_ID,
    diaryDate: '2026-09-10',
    weather: 'Cloudy',
    manpowerCount: 14,
    workCompleted: 'MEP rough-in progressed.',
    constraints: '',
    safetyNotes: 'PPE checked.',
  }

  it('rejects unauthenticated reads and writes', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).get(`/v1/projects/${PROJECT_ID}/diary`).expect(401)
    await request(app.getHttpServer()).post(`/v1/projects/${PROJECT_ID}/diary`).send(createBody).expect(401)
    expect(service.list).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })

  it.each(['sales', 'viewer', 'finance'])('allows %s to read but denies writes', async (role) => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).get(`/v1/projects/${PROJECT_ID}/diary`).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).post(`/v1/projects/${PROJECT_ID}/diary`).set('Authorization', 'Bearer valid').send(createBody).expect(403)
    expect(service.list).toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'pm', 'commercial', 'safety'])('allows %s to create and submit', async (role) => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).post(`/v1/projects/${PROJECT_ID}/diary`).set('Authorization', 'Bearer valid').send(createBody).expect(201)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ diaryDate: '2026-09-10' }), expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID, role }))
    await request(app.getHttpServer()).post(`/v1/projects/${PROJECT_ID}/diary/${ENTRY_ID}/submit`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1 }).expect(200)
    expect(service.submit).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, { expectedVersion: 1 }, expect.objectContaining({ userId: USER_ID, role }))
  })

  it('rejects malformed identifiers and forged body fields before service invocation', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).get('/v1/projects/not-a-uuid/diary').set('Authorization', 'Bearer valid').expect(400)
    await request(app.getHttpServer()).post(`/v1/projects/${PROJECT_ID}/diary`).set('Authorization', 'Bearer valid').send({ ...createBody, tenantId: TENANT_ID }).expect(400)
    expect(service.list).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })
})
