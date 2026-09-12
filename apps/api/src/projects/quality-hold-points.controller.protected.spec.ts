import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { qualityHoldPointPunchlistHandoffResultSchema } from '@third-code-erp/shared-types'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { QualityHoldPointsController } from './quality-hold-points.controller'
import { QualityHoldPointsService } from './quality-hold-points.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const path = `/v1/projects/${PROJECT_ID}/quality`

describe('QualityHoldPointsController protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function harness(role: string) {
    const service = {
      list: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      prepare: vi.fn().mockResolvedValue({}),
      submit: vi.fn().mockResolvedValue({}),
      accept: vi.fn().mockResolvedValue({}),
      reject: vi.fn().mockResolvedValue({}),
      handoffToPunchlist: vi.fn().mockResolvedValue({}),
    }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = {
      client: {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }],
              }),
            }),
          }),
        }),
      },
    }
    const module = await Test.createTestingModule({
      controllers: [QualityHoldPointsController],
      providers: [{ provide: QualityHoldPointsService, useValue: service }],
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

  it('requires authentication and never invokes Core anonymously', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).get(path).expect(401)
    await request(app.getHttpServer()).post(path).send({}).expect(401)
    expect(service.list).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })

  it('preserves the strict legacy receipt and serves request identity only on explicit opt-in', async () => {
    const { app, service } = await harness('pm')
    const receipt = {
      clientRequestId: REQUEST_ID, projectId: PROJECT_ID, qualityHoldPointId: ENTRY_ID,
      handoffId: REQUEST_ID, created: true, changed: true,
      source: { qualityHoldPointId: ENTRY_ID, iwrNumber: 'IWR-001', findings: '', rejectionReason: 'Repair defect', planDocumentId: null },
      items: [{ id: USER_ID, projectId: PROJECT_ID, description: 'Repair defect', location: null, trade: null, priority: 'medium', status: 'open', dueDate: null, assignedToUserId: null, assignedToText: null, createdAt: '2026-09-13T00:00:00.000Z', createdBy: USER_ID, sourceHandoffId: REQUEST_ID }],
    }
    service.handoffToPunchlist.mockResolvedValue(receipt)
    const body = { clientRequestId: REQUEST_ID, items: [{ description: 'Repair defect' }] }
    const legacy = await request(app.getHttpServer()).post(`${path}/${ENTRY_ID}/punchlist`).set('Authorization', 'Bearer valid').send(body).expect(201)
    expect(legacy.body).not.toHaveProperty('clientRequestId')
    expect(qualityHoldPointPunchlistHandoffResultSchema.omit({ clientRequestId: true }).safeParse(legacy.body).success).toBe(true)
    const bound = await request(app.getHttpServer()).post(`${path}/${ENTRY_ID}/punchlist`).set('Authorization', 'Bearer valid').set('x-erp-receipt-version', '1').send(body).expect(201)
    expect(qualityHoldPointPunchlistHandoffResultSchema.parse(bound.body)).toEqual(receipt)
  })

  it.each(['2', '1, 1', ''])('rejects unsupported receipt version %j before mutation', async version => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer()).post(`${path}/${ENTRY_ID}/punchlist`).set('Authorization', 'Bearer valid').set('x-erp-receipt-version', version).send({ clientRequestId: REQUEST_ID, items: [{ description: 'Repair defect' }] }).expect(400)
    expect(service.handoffToPunchlist).not.toHaveBeenCalled()
  })

  it.each(['viewer', 'sales', 'finance'])('allows %s to read but denies quality mutation', async (role) => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer valid')
      .send({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        title: 'IWR',
        description: 'Inspect work',
        discipline: '',
        location: '',
        planReference: '',
        holdPoint: true,
        inspectionDate: null,
        assignedTo: null,
      })
      .expect(403)
    expect(service.list).toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })

  it('separates acceptance authority from request management', async () => {
    const { app, service } = await harness('safety')
    await request(app.getHttpServer())
      .post(`${path}/${ENTRY_ID}/accept`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, findings: '', acceptanceNotes: 'Accepted' })
      .expect(403)
    await request(app.getHttpServer())
      .post(`${path}/${ENTRY_ID}/submit`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, requestNotes: 'Inspect this work.' })
      .expect(200)
    expect(service.accept).not.toHaveBeenCalled()
    expect(service.submit).toHaveBeenCalled()
  })

  it('derives actor from authenticated membership for manager and approver routes', async () => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer valid')
      .send({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        title: 'IWR',
        description: 'Inspect work',
        discipline: '',
        location: '',
        planReference: '',
        holdPoint: true,
        inspectionDate: null,
        assignedTo: null,
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`${path}/${ENTRY_ID}/accept`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, findings: '', acceptanceNotes: 'Accepted' })
      .expect(200)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), expect.objectContaining({ role: 'pm' }))
    expect(service.accept).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, expect.anything(), expect.objectContaining({ role: 'pm' }))
  })

  it.each(ERP_ROLES)('enforces punchlist handoff authority for %s', async (role) => {
    const { app, service } = await harness(role)
    const allowed = ['owner', 'admin', 'sd_pm_pe', 'pm', 'cx'].includes(role)
    await request(app.getHttpServer())
      .post(`${path}/${ENTRY_ID}/punchlist`)
      .set('Authorization', 'Bearer valid')
      .send({
        clientRequestId: REQUEST_ID,
        planDocumentId: null,
        items: [{ description: 'Repair the failed inspection item.' }],
      })
      .expect(allowed ? 201 : 403)
    expect(service.handoffToPunchlist).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })

  it('passes the authenticated actor and route scope to the punchlist handoff service', async () => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer())
      .post(`${path}/${ENTRY_ID}/punchlist`)
      .set('Authorization', 'Bearer valid')
      .send({
        clientRequestId: REQUEST_ID,
        planDocumentId: null,
        items: [{ description: 'Repair the failed inspection item.' }],
      })
      .expect(201)
    expect(service.handoffToPunchlist).toHaveBeenCalledWith(
      PROJECT_ID,
      ENTRY_ID,
      expect.objectContaining({ clientRequestId: REQUEST_ID }),
      expect.objectContaining({ role: 'pm', tenantId: TENANT_ID }),
    )
  })
})
