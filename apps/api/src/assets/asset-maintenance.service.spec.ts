import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { AssetMaintenanceService } from './asset-maintenance.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'
const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

const COMMAND = {
  maintenanceType: 'inspection' as const,
  summary: 'Annual safety inspection',
  performedOn: '2026-01-15',
  nextDueOn: null,
  vendorName: null,
  costCents: 0,
  notes: null,
}

describe('AssetMaintenanceService', () => {
  it('fails closed before touching the database for reads and writes', async () => {
    const transaction = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select: vi.fn(), transaction } } as unknown as DatabaseService
    const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
    const service = new AssetMaintenanceService(config, database, audit as never)

    await expect(
      service.list(ASSET_ID, { page: 1, limit: 50 }, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(service.create(ASSET_ID, COMMAND, PRINCIPAL, 'key-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(transaction).not.toHaveBeenCalled()
  })
})
