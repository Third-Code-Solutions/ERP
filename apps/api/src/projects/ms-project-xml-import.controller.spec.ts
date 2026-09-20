import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MS_PROJECT_XML_PARSER_VERSION } from '@third-code-erp/shared-types'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { MsProjectXmlImportController } from './ms-project-xml-import.controller'
import { MsProjectXmlImportService } from './ms-project-xml-import.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const base = `/v1/projects/${PROJECT_ID}/schedule/ms-project-xml`

describe('MS Project XML protected endpoints', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { preview: vi.fn().mockResolvedValue({}), import: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'synthetic@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [MsProjectXmlImportController], providers: [{ provide: MsProjectXmlImportService, useValue: service }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init()
    close = () => app.close()
    return { app, service }
  }

  it.each(['preview', 'import'])('requires authentication for %s', async operation => {
    const { app, service } = await harness('pm')
    await request(app.getHttpServer()).post(`${base}/${operation}`).send({}).expect(401)
    expect(service.preview).not.toHaveBeenCalled()
    expect(service.import).not.toHaveBeenCalled()
  })

  it.each(['viewer', 'finance', 'commercial'])('denies %s both XML operations', async role => {
    const { app, service } = await harness(role)
    for (const operation of ['preview', 'import']) await request(app.getHttpServer()).post(`${base}/${operation}`).set('Authorization', 'Bearer synthetic').send({}).expect(403)
    expect(service.preview).not.toHaveBeenCalled()
    expect(service.import).not.toHaveBeenCalled()
  })

  it('validates request bodies and route UUIDs before delegation', async () => {
    const { app, service } = await harness('pm')
    for (const operation of ['preview', 'import']) await request(app.getHttpServer()).post(`${base}/${operation}`).set('Authorization', 'Bearer synthetic').send({}).expect(400)
    await request(app.getHttpServer()).post('/v1/projects/not-a-uuid/schedule/ms-project-xml/preview').set('Authorization', 'Bearer synthetic').send({}).expect(400)
    expect(service.preview).not.toHaveBeenCalled()
    expect(service.import).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'sd_pm_pe', 'pm'])('delegates validated commands for current %s context', async role => {
    const { app, service } = await harness(role)
    const preview = { projectId: PROJECT_ID, sourceBase64: Buffer.from('<Project/>').toString('base64') }
    const command = { ...preview, sourceHash: 'a'.repeat(64), parserVersion: MS_PROJECT_XML_PARSER_VERSION, requestId: '55555555-5555-4555-8555-555555555555', mappings: [{ sourceUid: 1, sourceOutlineLevel: 1, level: 'l1', ownerId: null }] }
    await request(app.getHttpServer()).post(`${base}/preview`).set('Authorization', 'Bearer synthetic').send(preview).expect(200)
    await request(app.getHttpServer()).post(`${base}/import`).set('Authorization', 'Bearer synthetic').send(command).expect(200)
    expect(service.preview).toHaveBeenCalledWith(PROJECT_ID, preview, expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID, role }))
    expect(service.import).toHaveBeenCalledWith(PROJECT_ID, command, expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID, role }))
    await request(app.getHttpServer()).post(`${base}/import`).set('Authorization', 'Bearer synthetic').send({ ...command, projectId: USER_ID }).expect(400)
    expect(service.import).toHaveBeenCalledOnce()
  })
})
