import 'reflect-metadata'
import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ERP_READ_CAPABILITIES } from '@third-code-erp/shared-types/authorization'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { RoadmapController } from './roadmap.controller'
import { RoadmapService } from './roadmap.service'

const CAPABILITIES_KEY = 'third-code-erp:capabilities'
const tenantId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const priceListId = '33333333-3333-4333-8333-333333333333'
const deliveryBody = {
  channel: 'email',
  provider: 'resend',
  eventType: 'po.issued',
  aggregateType: 'purchase_order',
  aggregateId: '44444444-4444-4444-8444-444444444444',
  recipient: 'buyer@example.test',
  body: 'PO issued',
  templateVersion: '1',
}

describe('Roadmap controller protected boundary', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => { await close?.(); close = undefined })

  async function harness(role: string) {
    const service = {
      transitionPriceList: vi.fn().mockResolvedValue({ status: 'active' }),
      enqueueProviderDelivery: vi.fn().mockResolvedValue({ status: 'pending' }),
    }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId }) }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [{ tenantId, role, email: 'demo@example.test', accountStatus: 'active', tenantStatus: 'active' }] }) }) }) }) } }
    const module = await Test.createTestingModule({ controllers: [RoadmapController], providers: [{ provide: RoadmapService, useValue: service }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    // Auth test doubles implement only the membership and identity boundary.
    app.useGlobalGuards(new SupabaseJwtGuard(identity as unknown as SupabaseIdentityService, reflector, database as unknown as DatabaseService), new CapabilityGuard(reflector))
    await app.init()
    close = () => app.close()
    return { app, service }
  }

  function activate(app: Awaited<ReturnType<typeof harness>>['app']) {
    return request(app.getHttpServer())
      .post(`/v1/roadmap/price-lists/${priceListId}/workflow`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'price-list-1')
      .send({ action: 'activate' })
  }

  function queueDelivery(app: Awaited<ReturnType<typeof harness>>['app']) {
    return request(app.getHttpServer())
      .post('/v1/roadmap/provider-delivery')
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'delivery-1')
      .send(deliveryBody)
  }

  it.each(['viewer', 'pm', 'procurement', 'sales', 'cx'])('denies %s price list activation', async (role) => {
    const { app, service } = await harness(role)
    await activate(app).expect(403)
    expect(service.transitionPriceList).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'commercial'])('lets %s activate a price list as the verified actor', async (role) => {
    const { app, service } = await harness(role)
    await activate(app).expect(200)
    expect(service.transitionPriceList).toHaveBeenCalledWith(priceListId, { action: 'activate' }, { tenantId, userId, role, email: 'demo@example.test' }, 'price-list-1')
  })

  it.each(['viewer', 'sales', 'cx', 'commercial', 'procurement'])('denies %s provider delivery', async (role) => {
    const { app, service } = await harness(role)
    await queueDelivery(app).expect(403)
    expect(service.enqueueProviderDelivery).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin'])('lets %s queue provider delivery', async (role) => {
    const { app, service } = await harness(role)
    await queueDelivery(app).expect(202)
    expect(service.enqueueProviderDelivery).toHaveBeenCalledTimes(1)
  })

  it('never lets a mutation route rely on read-only capabilities', () => {
    const readCapabilities: readonly string[] = ERP_READ_CAPABILITIES
    const prototype = RoadmapController.prototype as unknown as Record<string, unknown>
    const mutations = Object.getOwnPropertyNames(prototype).filter((name) => {
      const handler = prototype[name]
      if (typeof handler !== 'function') return false
      const method: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler)
      return method !== undefined && method !== RequestMethod.GET
    })

    expect(mutations.length).toBeGreaterThan(0)
    for (const name of mutations) {
      const capabilities: string[] = Reflect.getMetadata(CAPABILITIES_KEY, prototype[name] as object) ?? []
      expect(capabilities.some((capability) => !readCapabilities.includes(capability)), name).toBe(true)
    }
  })
})
