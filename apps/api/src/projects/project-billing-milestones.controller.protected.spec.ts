import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectBillingMilestonesController } from './project-billing-milestones.controller'
import { ProjectBillingMilestonesService } from './project-billing-milestones.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const route = `/v1/projects/${PROJECT_ID}/billing/milestones`

describe('ProjectBillingMilestonesController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { list: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [ProjectBillingMilestonesController], providers: [{ provide: ProjectBillingMilestonesService, useValue: service }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init(); close = () => app.close(); return { app, service }
  }

  it('allows viewer reads and passes the tenant-bound principal', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).get(route).set('Authorization', 'Bearer valid').expect(200)
    expect(service.list).toHaveBeenCalledWith(PROJECT_ID, { page: 1, limit: 25 }, expect.objectContaining({ role: 'viewer', tenantId: TENANT_ID }))
  })
})
