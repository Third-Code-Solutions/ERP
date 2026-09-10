import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { InspectionRfisController } from './inspection-rfis.controller'
import { InspectionRfisService } from './inspection-rfis.service'

const opportunityId = '33333333-3333-4333-8333-333333333333'
const rfiId = '44444444-4444-4444-8444-444444444444'
const tenantId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const path = `/v1/crm/opportunities/${opportunityId}/inspection-rfis`
describe('Inspection RFI protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })
  async function harness(role: string) {
    const service = { list: vi.fn().mockResolvedValue({ rows: [] }), transition: vi.fn().mockResolvedValue({ changed: true }) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId }) }
    const database = { client: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ tenantId, role, email: 'demo@example.test' }] }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [InspectionRfisController], providers: [{ provide: InspectionRfisService, useValue: service }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    // Auth test doubles implement only the membership and identity boundary.
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init()
    close = () => app.close()
    return { app, service }
  }
  it('rejects unauthenticated reads and mutations', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).get(path).expect(401)
    await request(app.getHttpServer()).post(`${path}/${rfiId}/resolve`).send({ expectedResolvedAt: null, reason: 'Done' }).expect(401)
    expect(service.list).not.toHaveBeenCalled()
    expect(service.transition).not.toHaveBeenCalled()
  })
  it.each(['sales', 'viewer', 'procurement'])('denies %s mutation capability', async (role) => {
    const { app, service } = await harness(role)
    for (const action of ['resolve', 'reopen']) await request(app.getHttpServer()).post(`${path}/${rfiId}/${action}`).set('Authorization', 'Bearer valid').send({ expectedResolvedAt: null, reason: 'Done' }).expect(403)
    expect(service.transition).not.toHaveBeenCalled()
  })
  it.each(['owner', 'admin', 'commercial'])('derives %s actor and tenant from membership', async (role) => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).post(`${path}/${rfiId}/resolve`).set('Authorization', 'Bearer valid').send({ expectedResolvedAt: null, reason: 'Done' }).expect(200)
    expect(service.transition).toHaveBeenCalledWith(opportunityId, rfiId, 'resolved', { expectedResolvedAt: null, reason: 'Done' }, { tenantId, userId, role, email: 'demo@example.test' })
  })
  it('rejects injected actor/tenant and malformed route IDs before service invocation', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).post(`${path}/${rfiId}/resolve`).set('Authorization', 'Bearer valid').send({ expectedResolvedAt: null, reason: 'Done', tenantId }).expect(400)
    await request(app.getHttpServer()).post(`${path}/invalid/reopen`).set('Authorization', 'Bearer valid').send({ expectedResolvedAt: null, reason: 'Done' }).expect(400)
    await request(app.getHttpServer()).get(`${path}?limit=101`).set('Authorization', 'Bearer valid').expect(400)
    expect(service.transition).not.toHaveBeenCalled()
    expect(service.list).not.toHaveBeenCalled()
  })
})
