import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { RfqBidLevelingController } from './rfq-bid-leveling.controller'
import { RfqBidLevelingService } from './rfq-bid-leveling.service'

const RFQ_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('RfqBidLevelingController protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = { read: vi.fn().mockResolvedValue({}) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = {
      client: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ tenantId: TENANT_ID, role, email: 'demo@example.test' }],
            }),
          }),
        }),
      },
    }
    const module = await Test.createTestingModule({
      controllers: [RfqBidLevelingController],
      providers: [{ provide: RfqBidLevelingService, useValue: service }],
    }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService),
      new CapabilityGuard(reflector),
    )
    await app.init(); close = () => app.close()
    return { app, service }
  }

  it('allows commercial to read quote evidence', async () => {
    const { app, service } = await harness('commercial')
    await request(app.getHttpServer())
      .get(`/v1/procurement/rfqs/${RFQ_ID}/bid-leveling`)
      .set('Authorization', 'Bearer valid')
      .expect(200)
    expect(service.read).toHaveBeenCalledWith(RFQ_ID, expect.objectContaining({ role: 'commercial' }))
  })

  it('denies a viewer before the service is called', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer())
      .get(`/v1/procurement/rfqs/${RFQ_ID}/bid-leveling`)
      .set('Authorization', 'Bearer valid')
      .expect(403)
    expect(service.read).not.toHaveBeenCalled()
  })
})
