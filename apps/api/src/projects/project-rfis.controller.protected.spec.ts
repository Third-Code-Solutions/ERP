import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectRfisController } from './project-rfis.controller'
import { ProjectRfisService } from './project-rfis.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const path = `/v1/projects/${PROJECT_ID}/rfis`

describe('Project RFI protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function harness(role: string) {
    const service = {
      list: vi.fn().mockResolvedValue({ rows: [] }),
      create: vi.fn().mockResolvedValue({ created: true }),
      answer: vi.fn().mockResolvedValue({ changed: true }),
      close: vi.fn().mockResolvedValue({ changed: true }),
      reopen: vi.fn().mockResolvedValue({ changed: true }),
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
      controllers: [ProjectRfisController],
      providers: [{ provide: ProjectRfisService, useValue: service }],
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

  it('rejects unauthenticated reads and mutations', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).get(path).expect(401)
    await request(app.getHttpServer())
      .post(path)
      .send({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'RFI',
        question: 'Question',
        priority: 'normal',
        assignedTo: null,
        dueAt: null,
      })
      .expect(401)
    expect(service.list).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })

  it.each(['sales', 'viewer', 'finance'])('allows %s to read but denies mutation', async (role) => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer())
      .post(`${path}/${RFI_ID}/close`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, reason: 'Done' })
      .expect(403)
    expect(service.list).toHaveBeenCalled()
    expect(service.close).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'design', 'safety'])('derives %s actor from membership for create and answer', async (role) => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer valid')
      .send({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'RFI',
        question: 'Question',
        priority: 'normal',
        assignedTo: null,
        dueAt: null,
      })
      .expect(201)
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, subject: 'RFI' }),
      { tenantId: TENANT_ID, userId: USER_ID, role, email: 'demo@example.test' },
    )
    await request(app.getHttpServer())
      .post(`${path}/${RFI_ID}/answer`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, response: 'Answer' })
      .expect(200)
    expect(service.answer).toHaveBeenCalledWith(
      PROJECT_ID,
      RFI_ID,
      { expectedVersion: 1, response: 'Answer' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID, role }),
    )
  })

  it('rejects forged tenant input and malformed project route IDs before service invocation', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer valid')
      .send({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'RFI',
        question: 'Question',
        priority: 'normal',
        assignedTo: null,
        dueAt: null,
        tenantId: TENANT_ID,
      })
      .expect(400)
    await request(app.getHttpServer())
      .get('/v1/projects/not-a-uuid/rfis')
      .set('Authorization', 'Bearer valid')
      .expect(400)
    expect(service.create).not.toHaveBeenCalled()
    expect(service.list).not.toHaveBeenCalled()
  })
})
