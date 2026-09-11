import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { TendersController } from './tenders.controller'
import { TendersService } from './tenders.service'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const TENDER_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const path = `/v1/opportunities/${OPPORTUNITY_ID}/tender`

describe('TendersController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = {
      detail: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      transition: vi.fn().mockResolvedValue({}),
      bindBom: vi.fn().mockResolvedValue({}),
      createDeviation: vi.fn().mockResolvedValue({}),
      updateDeviation: vi.fn().mockResolvedValue({}),
      createCriterion: vi.fn().mockResolvedValue({}),
      updateCriterion: vi.fn().mockResolvedValue({}),
      createVendorProfile: vi.fn().mockResolvedValue({}),
      updateVendorProfile: vi.fn().mockResolvedValue({}),
      upsertScore: vi.fn().mockResolvedValue({}),
    }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [TendersController], providers: [{ provide: TendersService, useValue: service }] }).compile()
    const app = module.createNestApplication(); const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close(); return { app, service }
  }

  const createBody = { opportunityId: OPPORTUNITY_ID, clientRequestId: REQUEST_ID, title: 'Tender', reference: 'TND-1', sourceMode: 'client_issued_boq', torDocumentId: null, boqDocumentId: '66666666-6666-4666-8666-666666666666', closingAt: null }

  it('allows viewer read but denies viewer mutation', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send(createBody).expect(403)
    expect(service.detail).toHaveBeenCalledWith(OPPORTUNITY_ID, expect.objectContaining({ role: 'viewer' }))
    expect(service.create).not.toHaveBeenCalled()
  })

  it('keeps score authority separate from tender document management', async () => {
    const { app, service } = await harness('sales')
    await request(app.getHttpServer()).post(`${path}/${TENDER_ID}/evaluation-scores`).set('Authorization', 'Bearer valid').send({ vendorProfileId: TENDER_ID, criterionId: TENDER_ID, expectedVersion: null, scoreBps: 5000, notes: '' }).expect(403)
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send(createBody).expect(201)
    expect(service.upsertScore).not.toHaveBeenCalled(); expect(service.create).toHaveBeenCalled()
  })

  it('derives authenticated actor and route identifiers', async () => {
    const { app, service } = await harness('commercial')
    await request(app.getHttpServer()).post(`${path}/${TENDER_ID}/status`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, status: 'open' }).expect(200)
    expect(service.transition).toHaveBeenCalledWith(OPPORTUNITY_ID, TENDER_ID, { expectedVersion: 1, status: 'open' }, expect.objectContaining({ role: 'commercial', userId: USER_ID, tenantId: TENANT_ID }))
  })

  it('passes opportunity ownership into nested tender mutations', async () => {
    const { app, service } = await harness('commercial')
    await request(app.getHttpServer()).post(`${path}/${TENDER_ID}/deviations`).set('Authorization', 'Bearer valid').send({ category: 'scope', title: 'Missing drawing', description: 'The reflected ceiling plan is missing.', sourceReference: 'TOR §4.2', ownerId: null }).expect(201)
    expect(service.createDeviation).toHaveBeenCalledWith(OPPORTUNITY_ID, TENDER_ID, expect.objectContaining({ title: 'Missing drawing' }), expect.objectContaining({ role: 'commercial' }))
  })

  it('allows an evaluator-only role to reach the submission transition', async () => {
    const { app, service } = await harness('sd_pm_pe')
    await request(app.getHttpServer()).post(`${path}/${TENDER_ID}/status`).set('Authorization', 'Bearer valid').send({ expectedVersion: 1, status: 'submitted' }).expect(200)
    expect(service.transition).toHaveBeenCalledWith(OPPORTUNITY_ID, TENDER_ID, { expectedVersion: 1, status: 'submitted' }, expect.objectContaining({ role: 'sd_pm_pe', userId: USER_ID, tenantId: TENANT_ID }))
  })
})
