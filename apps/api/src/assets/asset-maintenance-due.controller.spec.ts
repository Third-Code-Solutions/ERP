import 'reflect-metadata'

import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { AssetMaintenanceDueController } from './asset-maintenance-due.controller'
import { AssetMaintenanceService } from './asset-maintenance.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Asset maintenance due HTTP contract', () => {
  async function appFor(maintenanceDue = vi.fn()): Promise<INestApplication> {
    const module = await Test.createTestingModule({
      controllers: [AssetMaintenanceDueController],
      providers: [
        { provide: AssetMaintenanceService, useValue: { maintenanceDue } },
      ],
    }).compile()
    const app = module.createNestApplication()
    app.use((req: { principal?: unknown }, _res: unknown, next: () => void) => {
      req.principal = {
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'viewer',
        email: 'viewer@example.test',
      }
      next()
    })
    await app.init()
    return app
  }

  it('parses bounded due query values and passes the principal', async () => {
    const maintenanceDue = vi.fn().mockResolvedValue({ rows: [] })
    const app = await appFor(maintenanceDue)
    try {
      await request(app.getHttpServer())
        .get('/v1/assets/maintenance/due?asOf=2026-08-07&daysAhead=14&page=2&limit=20')
        .expect(200)
      expect(maintenanceDue).toHaveBeenCalledWith(
        { asOf: '2026-08-07', daysAhead: 14, page: 2, limit: 20 },
        expect.objectContaining({ tenantId: TENANT_ID })
      )
    } finally {
      await app.close()
    }
  })

  it('rejects unsupported due query fields before the service', async () => {
    const maintenanceDue = vi.fn()
    const app = await appFor(maintenanceDue)
    try {
      await request(app.getHttpServer())
        .get('/v1/assets/maintenance/due?tenantId=other')
        .expect(400)
      expect(maintenanceDue).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
