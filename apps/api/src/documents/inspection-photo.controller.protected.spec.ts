import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { InspectionPhotoController } from './inspection-photo.controller'
import { InspectionPhotoService } from './inspection-photo.service'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const route = `/v1/opportunities/${OPPORTUNITY_ID}/inspection-photos`

describe('InspectionPhotoController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { create: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [InspectionPhotoController], providers: [{ provide: InspectionPhotoService, useValue: service }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    // Narrow boundary doubles implement only guard calls; production classes also
    // contain private injected dependencies, so structural assignment is unavailable.
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close(); return { app, service }
  }

  it.each(ERP_ROLES)('applies the existing site-inspection-submit policy to %s', async role => {
    const allowed = ['owner', 'admin', 'commercial'].includes(role)
    const { app, service } = await harness(role)
    await request(app.getHttpServer()).post(route).set('Authorization', 'Bearer valid').send({ opportunityId: OPPORTUNITY_ID, storagePath: `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`, fileName: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1 }).expect(allowed ? 201 : 403)
    if (allowed) expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: OPPORTUNITY_ID }), expect.objectContaining({ role, tenantId: TENANT_ID }))
    else expect(service.create).not.toHaveBeenCalled()
  })
})
