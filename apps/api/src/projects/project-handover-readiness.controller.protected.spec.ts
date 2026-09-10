import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectHandoverReadinessController } from './project-handover-readiness.controller'
import { ProjectHandoverReadinessService } from './project-handover-readiness.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('ProjectHandoverReadinessController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('allows a viewer to read readiness', async () => {
    const service = { read: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = {
      client: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ tenantId: TENANT_ID, role: 'viewer', email: 'demo@example.test' }],
            }),
          }),
        }),
      },
    }
    const module = await Test.createTestingModule({
      controllers: [ProjectHandoverReadinessController],
      providers: [{ provide: ProjectHandoverReadinessService, useValue: service }],
    }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService),
      new CapabilityGuard(reflector),
    )
    await app.init()
    close = () => app.close()
    await request(app.getHttpServer())
      .get(`/v1/projects/${PROJECT_ID}/handover-readiness`)
      .set('Authorization', 'Bearer valid')
      .expect(200)
    expect(service.read).toHaveBeenCalledWith(PROJECT_ID, {}, expect.objectContaining({ role: 'viewer' }))
  })
})
