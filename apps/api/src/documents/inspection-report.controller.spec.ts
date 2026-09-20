import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { InspectionReportController } from './inspection-report.controller'
import { InspectionReportService } from './inspection-report.service'

const opportunityId = '11111111-1111-4111-8111-111111111111'
const inspectionId = '22222222-2222-4222-8222-222222222222'
const tenantId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const route = `/v1/opportunities/${opportunityId}/inspections/${inspectionId}/report`
describe('Inspection report protected HTTP command', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })
  async function harness(role = 'commercial') {
    const service = { archive: vi.fn().mockResolvedValue({ tenantId, opportunityId, inspectionId, documentId: '55555555-5555-4555-8555-555555555555', status: 'archived', replayed: false }) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId, role, email: 'synthetic@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [InspectionReportController], providers: [{ provide: InspectionReportService, useValue: service }] }).compile()
    const app = module.createNestApplication(), reflector = new Reflector()
    // Synthetic identity/membership boundaries; actual guards, controller and pipes.
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close()
    return { app, service }
  }
  it.each(ERP_ROLES)('enforces canonical role %s', async role => {
    const { app, service } = await harness(role), allowed = ['owner', 'admin', 'commercial'].includes(role)
    await request(app.getHttpServer()).post(route).set('Authorization', 'Bearer synthetic').send({}).expect(allowed ? 201 : 403)
    if (allowed) expect(service.archive).toHaveBeenCalledWith({ opportunityId, inspectionId }, expect.objectContaining({ userId, tenantId, role }))
    else expect(service.archive).not.toHaveBeenCalled()
  })
  it.each([{ payload: {} }, { tenantId }, [], null])('rejects nonempty or nonobject body %j', async body => {
    const { app, service } = await harness()
    await request(app.getHttpServer()).post(route).set('Authorization', 'Bearer synthetic').set('Content-Type', 'application/json').send(JSON.stringify(body)).expect(400)
    expect(service.archive).not.toHaveBeenCalled()
  })
  it('rejects missing authentication and invalid path identity before service', async () => {
    const { app, service } = await harness()
    await request(app.getHttpServer()).post(route).send({}).expect(401)
    await request(app.getHttpServer()).post(route.replace(inspectionId, 'invalid')).set('Authorization', 'Bearer synthetic').send({}).expect(400)
    expect(service.archive).not.toHaveBeenCalled()
  })
})
