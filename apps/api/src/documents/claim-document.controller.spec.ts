import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ClaimDocumentController } from './claim-document.controller'
import { ClaimDocumentService } from './claim-document.service'

const claimId = '33333333-3333-4333-8333-333333333333'
const tenantId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const command = { clientRequestId: '55555555-5555-4555-8555-555555555555', documentId: '66666666-6666-4666-8666-666666666666', kind: 'photo', caption: '  Evidence  ' }

describe('Claim attachment protected HTTP contract', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })
  async function appFor(role = 'admin') {
    const membership = { tenantId, role, email: 'claim@example.test', accountStatus: 'active', tenantStatus: 'active' }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [membership] }) }) }) }) } } as unknown as DatabaseService
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId }) } as unknown as SupabaseIdentityService
    const attach = vi.fn().mockResolvedValue({ attachmentId: command.clientRequestId, tenantId, projectId: '44444444-4444-4444-8444-444444444444', claimId, documentId: command.documentId, changed: true })
    const module = await Test.createTestingModule({ controllers: [ClaimDocumentController], providers: [{ provide: ClaimDocumentService, useValue: { attach } }] }).compile()
    const app = module.createNestApplication(), reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity, reflector, database), new CapabilityGuard(reflector))
    await app.init()
    close = () => app.close()
    return { app, attach }
  }

  it('rejects unauthenticated requests without invoking the command', async () => {
    const f = await appFor()
    await request(f.app.getHttpServer()).post(`/v1/claims/${claimId}/documents`).send(command).expect(401)
    expect(f.attach).not.toHaveBeenCalled()
  })
  it('rejects a viewer through the real capability guard', async () => {
    const f = await appFor('viewer')
    await request(f.app.getHttpServer()).post(`/v1/claims/${claimId}/documents`).set('Authorization', 'Bearer synthetic').send(command).expect(403)
    expect(f.attach).not.toHaveBeenCalled()
  })
  it('rejects invalid paths and injected authority fields before invocation', async () => {
    const f = await appFor()
    await request(f.app.getHttpServer()).post('/v1/claims/invalid/documents').set('Authorization', 'Bearer synthetic').send(command).expect(400)
    await request(f.app.getHttpServer()).post(`/v1/claims/${claimId}/documents`).set('Authorization', 'Bearer synthetic').send({ ...command, tenantId }).expect(400)
    expect(f.attach).not.toHaveBeenCalled()
  })
  it('binds the route and authenticated principal and normalizes caption', async () => {
    const f = await appFor('sd_pm_pe')
    await request(f.app.getHttpServer()).post(`/v1/claims/${claimId}/documents`).set('Authorization', 'Bearer synthetic').send(command).expect(200)
    expect(f.attach).toHaveBeenCalledWith(claimId, { ...command, caption: 'Evidence' }, expect.objectContaining({ tenantId, userId, role: 'sd_pm_pe' }))
  })
})
