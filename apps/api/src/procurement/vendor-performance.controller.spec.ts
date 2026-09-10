import 'reflect-metadata'

import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { VendorPerformanceController } from './vendor-performance.controller'
import { VendorPerformanceService } from './vendor-performance.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('VendorPerformanceController', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function harness(role: string) {
    const service = { read: vi.fn().mockResolvedValue({ rows: [], totals: {} }) }
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }) }
    const database = {
      client: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                { tenantId: TENANT_ID, role, email: 'demo@example.test' },
              ],
            }),
          }),
        }),
      },
    }
    const module = await Test.createTestingModule({
      controllers: [VendorPerformanceController],
      providers: [{ provide: VendorPerformanceService, useValue: service }],
    }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(
        identity as unknown as SupabaseIdentityService,
        reflector,
        database as unknown as DatabaseService,
      ),
      new CapabilityGuard(reflector),
    )
    await app.init()
    close = () => app.close()
    return { app, service }
  }

  it('allows procurement to read the tenant-scoped projection', async () => {
    const { app, service } = await harness('procurement')
    await request(app.getHttpServer())
      .get(`/v1/procurement/vendors/performance?projectId=${PROJECT_ID}`)
      .set('Authorization', 'Bearer valid')
      .expect(200)
    expect(service.read).toHaveBeenCalledWith(
      { projectId: PROJECT_ID },
      expect.objectContaining({ role: 'procurement' }),
    )
  })

  it('denies a viewer before the service is called', async () => {
    const { app, service } = await harness('viewer')
    await request(app.getHttpServer())
      .get('/v1/procurement/vendors/performance')
      .set('Authorization', 'Bearer valid')
      .expect(403)
    expect(service.read).not.toHaveBeenCalled()
  })

  it('rejects unknown query fields at the boundary', async () => {
    const { app, service } = await harness('procurement')
    await request(app.getHttpServer())
      .get('/v1/procurement/vendors/performance?unexpected=value')
      .set('Authorization', 'Bearer valid')
      .expect(400)
    expect(service.read).not.toHaveBeenCalled()
  })
})
