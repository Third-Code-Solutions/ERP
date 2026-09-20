import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { ClaimTransitionController } from './claim-transition.controller'
import { ClaimTransitionService } from './claim-transition.service'

const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const path = `/v1/claims/${CLAIM_ID}/transition`

describe('Claim transition protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function harness(role: string) {
    const service = { transition: vi.fn().mockResolvedValue({ claimId: CLAIM_ID, changed: true, receipt: {} }) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = {
      client: {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [{ tenantId: TENANT_ID, role, email: 'claim@example.test', accountStatus: 'active', tenantStatus: 'active' }],
              }),
            }),
          }),
        }),
      },
    }
    const module = await Test.createTestingModule({
      controllers: [ClaimTransitionController],
      providers: [{ provide: ClaimTransitionService, useValue: service }],
    }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService),
      new CapabilityGuard(reflector),
    )
    await app.init()
    close = () => app.close()
    return { app, service }
  }

  it('rejects unauthenticated transition commands', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).post(path).send({ action: 'submit', clientRequestId: REQUEST_ID }).expect(401)
    expect(service.transition).not.toHaveBeenCalled()
  })

  it('denies roles without a transition capability', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send({ action: 'submit', clientRequestId: REQUEST_ID }).expect(403)
    expect(service.transition).not.toHaveBeenCalled()
  })

  it('derives the actor from membership and routes the strict command', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send({ action: 'submit', clientRequestId: REQUEST_ID }).expect(200)
    expect(service.transition).toHaveBeenCalledWith(
      CLAIM_ID,
      { action: 'submit', clientRequestId: REQUEST_ID },
      { tenantId: TENANT_ID, userId: USER_ID, role: 'admin', email: 'claim@example.test' },
    )
  })

  it('rejects browser-owned authority fields at the boundary', async () => {
    const { app, service } = await harness('admin')
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer valid').send({ action: 'submit', clientRequestId: REQUEST_ID, tenantId: TENANT_ID }).expect(400)
    expect(service.transition).not.toHaveBeenCalled()
  })
})
