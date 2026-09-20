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
import { ProjectSubmittalDocumentsController } from './project-submittal-documents.controller'
import { ProjectSubmittalDocumentsService } from './project-submittal-documents.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const LINK_ID = '55555555-5555-4555-8555-555555555555'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const base = `/v1/projects/${PROJECT_ID}`

describe('ProjectSubmittalDocumentsController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = {
      listProjectDocuments: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      link: vi.fn().mockResolvedValue({}),
      unlink: vi.fn().mockResolvedValue({}),
    }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [ProjectSubmittalDocumentsController], providers: [{ provide: ProjectSubmittalDocumentsService, useValue: service }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close(); return { app, service }
  }

  it.each(ERP_ROLES)('allows active %s membership to read project documents', async role => {
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).get(`${base}/documents`).set('Authorization', 'Bearer valid').expect(200)
    expect(service.listProjectDocuments).toHaveBeenCalledWith(PROJECT_ID, expect.anything(), expect.objectContaining({ role, tenantId: TENANT_ID, userId: USER_ID }))
  })

  it('allows all roles to read but denies a viewer link mutation', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).get(`${base}/documents`).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).get(`${base}/submittals/${SUBMITTAL_ID}/documents`).set('Authorization', 'Bearer valid').expect(200)
    await request(app.getHttpServer()).post(`${base}/submittals/${SUBMITTAL_ID}/documents`).set('Authorization', 'Bearer valid').send({ documentId: DOCUMENT_ID, role: 'plan', caption: '', expectedVersion: 1, clientRequestId: REQUEST_ID }).expect(403)
    expect(service.listProjectDocuments).toHaveBeenCalled(); expect(service.list).toHaveBeenCalled(); expect(service.link).not.toHaveBeenCalled()
  })

  it('permits document-control management for procurement and keeps unlink guarded', async () => {
    const { app, service } = await harness('procurement')
    await request(app.getHttpServer()).post(`${base}/submittals/${SUBMITTAL_ID}/documents`).set('Authorization', 'Bearer valid').send({ documentId: DOCUMENT_ID, role: 'submission', caption: '', expectedVersion: 1, clientRequestId: REQUEST_ID }).expect(201)
    await request(app.getHttpServer()).post(`${base}/submittals/${SUBMITTAL_ID}/documents/${LINK_ID}/unlink`).set('Authorization', 'Bearer valid').send({ expectedVersion: 2 }).expect(200)
    expect(service.link).toHaveBeenCalled(); expect(service.unlink).toHaveBeenCalled()
  })
})
