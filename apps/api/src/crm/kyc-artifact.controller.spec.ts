import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ERP_ROLES } from '@third-code-erp/shared-types'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { KycArtifactController } from './kyc-artifact.controller'
import { KycArtifactService } from './kyc-artifact.service'

const accountId = '33333333-3333-4333-8333-333333333333', tenantId = '22222222-2222-4222-8222-222222222222', userId = '11111111-1111-4111-8111-111111111111'
const command = { clientRequestId: '55555555-5555-4555-8555-555555555555', artifactType: 'other', notes: '  Evidence  ' }
const allowedRoles = ['owner', 'admin', 'sales']
const deniedRoles = ERP_ROLES.filter((role) => !allowedRoles.includes(role))
describe('KYC artifact protected HTTP contract', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })
  async function appFor(role = 'admin') {
    const membership = { tenantId, role, email: 'kyc@example.test', accountStatus: 'active', tenantStatus: 'active' }
    // These focused boundary doubles stand in for the JWT membership query;
    // authority service itself is exercised against PostgreSQL separately.
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [membership] }) }) }) }) } } as unknown as DatabaseService
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId }) } as unknown as SupabaseIdentityService
    const create = vi.fn().mockResolvedValue({ artifactId: command.clientRequestId, tenantId, accountId, documentId: null, changed: true })
    const list = vi.fn().mockResolvedValue({ accountId, tenantId, rows: [], selectedDocument: null, page: 1, limit: 20, total: 0, totalPages: 1 })
    const module = await Test.createTestingModule({ controllers: [KycArtifactController], providers: [{ provide: KycArtifactService, useValue: { create, list } }] }).compile()
    const app = module.createNestApplication(), reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity, reflector, database), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close()
    return { app, create, list }
  }
  it('rejects unauthenticated requests on both routes', async () => {
    const f = await appFor()
    await request(f.app.getHttpServer()).post(`/v1/crm/accounts/${accountId}/kyc-artifacts`).send(command).expect(401)
    await request(f.app.getHttpServer()).get(`/v1/crm/accounts/${accountId}/kyc-document-options`).expect(401)
    expect(f.create).not.toHaveBeenCalled(); expect(f.list).not.toHaveBeenCalled()
  })
  it.each(deniedRoles)('denies canonical role %s with synthetic JWT identity', async (role) => {
    const f = await appFor(role)
    await request(f.app.getHttpServer()).post(`/v1/crm/accounts/${accountId}/kyc-artifacts`).set('Authorization', 'Bearer synthetic').send(command).expect(403)
    await request(f.app.getHttpServer()).get(`/v1/crm/accounts/${accountId}/kyc-document-options`).set('Authorization', 'Bearer synthetic').expect(403)
  })
  it.each(allowedRoles)('accepts %s and normalizes metadata-only payload with synthetic JWT identity', async (role) => {
    const f = await appFor(role)
    await request(f.app.getHttpServer()).post(`/v1/crm/accounts/${accountId}/kyc-artifacts`).set('Authorization', 'Bearer synthetic').send(command).expect(200)
    expect(f.create).toHaveBeenCalledWith(accountId, { ...command, notes: 'Evidence', documentId: null }, expect.objectContaining({ tenantId, userId, role }))
    await request(f.app.getHttpServer()).get(`/v1/crm/accounts/${accountId}/kyc-document-options?page=2&limit=5&q=proof`).set('Authorization', 'Bearer synthetic').expect(200)
    expect(f.list).toHaveBeenCalledWith(accountId, { page: 2, limit: 5, q: 'proof' }, expect.objectContaining({ tenantId }))
  })
  it('rejects invalid paths, authority injection and unbounded queries', async () => {
    const f = await appFor()
    await request(f.app.getHttpServer()).post('/v1/crm/accounts/bad/kyc-artifacts').set('Authorization', 'Bearer synthetic').send(command).expect(400)
    await request(f.app.getHttpServer()).post(`/v1/crm/accounts/${accountId}/kyc-artifacts`).set('Authorization', 'Bearer synthetic').send({ ...command, tenantId }).expect(400)
    await request(f.app.getHttpServer()).get(`/v1/crm/accounts/${accountId}/kyc-document-options?limit=1000`).set('Authorization', 'Bearer synthetic').expect(400)
    expect(f.create).not.toHaveBeenCalled(); expect(f.list).not.toHaveBeenCalled()
  })
})
