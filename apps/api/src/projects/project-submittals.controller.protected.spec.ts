import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectSubmittalsController } from './project-submittals.controller'
import { ProjectSubmittalsService } from './project-submittals.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const path = `/v1/projects/${PROJECT_ID}/submittals`

describe('ProjectSubmittalsController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { list: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), submit: vi.fn().mockResolvedValue({}), startReview: vi.fn().mockResolvedValue({}), decide: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [ProjectSubmittalsController], providers: [{ provide: ProjectSubmittalsService, useValue: service }] }).compile()
    const app = module.createNestApplication(); const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close(); return { app, service }
  }

  it('allows all roles to read but denies viewer mutation', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, title: 'Submittal', description: 'Description', specSection: '', discipline: '', planReference: '', dueDate: null, assignedTo: null }).expect(403)
    expect(service.list).toHaveBeenCalled(); expect(service.create).not.toHaveBeenCalled()
  })

  it('separates review authority from document-control management', async () => {
    const { app, service } = await harness('procurement')
    await request(app.getHttpServer()).post(`${path}/${SUBMITTAL_ID}/start-review`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1 }).expect(403)
    await request(app.getHttpServer()).post(`${path}/${SUBMITTAL_ID}/submit`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, submissionNotes: '' }).expect(200)
    expect(service.startReview).not.toHaveBeenCalled(); expect(service.submit).toHaveBeenCalled()
  })

  it('derives the authenticated membership actor for creation and review', async () => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, title: 'Submittal', description: 'Description', specSection: '', discipline: '', planReference: '', dueDate: null, assignedTo: null }).expect(201)
    await request(app.getHttpServer()).post(`${path}/${SUBMITTAL_ID}/review`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, decision: 'approve', reviewNotes: 'Approved', rejectionReason: '' }).expect(200)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), expect.objectContaining({ role: 'pm' }))
    expect(service.decide).toHaveBeenCalledWith(PROJECT_ID, SUBMITTAL_ID, expect.anything(), expect.objectContaining({ role: 'pm' }))
  })
})
