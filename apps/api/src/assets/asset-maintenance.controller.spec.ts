import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { AssetMaintenanceController } from './asset-maintenance.controller'
import { AssetMaintenanceService } from './asset-maintenance.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'

describe('Asset maintenance HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    list = vi.fn(),
    create = vi.fn()
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssetMaintenanceController],
      providers: [
        {
          provide: AssetMaintenanceService,
          useValue: { list, create },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'pm',
        email: 'pm@example.test',
      }
      next()
    })
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    await app.init()
    close = () => app.close()
    return app
  }

  it('rejects unsupported maintenance query fields', async () => {
    const list = vi.fn()
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get(`/v1/assets/${ASSET_ID}/maintenance?unexpected=true`)
      .expect(400)

    expect(list).not.toHaveBeenCalled()
  })

  it('forwards tenant-scoped list and idempotent create contracts', async () => {
    const list = vi.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      assetId: ASSET_ID,
      rows: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 1,
    })
    const create = vi.fn().mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: TENANT_ID,
      assetId: ASSET_ID,
      maintenanceType: 'inspection',
      summary: 'Annual safety inspection',
      performedOn: '2026-01-15',
      nextDueOn: null,
      vendorName: null,
      costCents: 0,
      notes: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-01-15T00:00:00.000Z',
    })
    const app = await appFor(list, create)

    await request(app.getHttpServer())
      .get(`/v1/assets/${ASSET_ID}/maintenance?page=2&limit=20`)
      .expect(200)
    expect(list).toHaveBeenCalledWith(
      ASSET_ID,
      { page: 2, limit: 20 },
      expect.objectContaining({ tenantId: TENANT_ID })
    )

    await request(app.getHttpServer())
      .post(`/v1/assets/${ASSET_ID}/maintenance`)
      .set('Idempotency-Key', 'maintenance-test-1')
      .send({
        maintenanceType: 'inspection',
        summary: 'Annual safety inspection',
        performedOn: '2026-01-15',
      })
      .expect(201)
    expect(create).toHaveBeenCalledWith(
      ASSET_ID,
      {
        maintenanceType: 'inspection',
        summary: 'Annual safety inspection',
        performedOn: '2026-01-15',
        nextDueOn: null,
        vendorName: null,
        costCents: 0,
        notes: null,
      },
      expect.objectContaining({ tenantId: TENANT_ID }),
      'maintenance-test-1'
    )
  })
})
