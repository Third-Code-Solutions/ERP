import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  flag: vi.fn(),
  core: vi.fn(),
  getUserProfile: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { execute: mocks.execute },
}))
vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))
vi.mock('./erp-core-client', () => ({
  inventoryStockMovementReadsUseCoreApi: mocks.flag,
  getInventoryStockMovementsThroughCoreApi: mocks.core,
}))

import { getStockMovementRegister } from './inventory-movement-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

const ROW = {
  id: '88888888-8888-4888-8888-888888888888',
  internal_number: 'SM-2026-000001',
  movement_type: 'transfer' as const,
  status: 'posted' as const,
  movement_date: '2026-08-05',
  reason: 'Move accepted materials',
  source_code: 'MAIN',
  target_code: 'SITE-A',
  project_name: 'Site A',
  line_count: 2,
  total_value_cents: 125_000n,
}

describe('Stock Movement page query seam', () => {
  beforeEach(() => {
    mocks.execute.mockReset()
    mocks.flag.mockReset()
    mocks.core.mockReset()
    mocks.getUserProfile.mockReset()
  })

  it('keeps the legacy read path tenant-scoped while the gate is closed', async () => {
    mocks.flag.mockReturnValue(false)
    mocks.execute.mockResolvedValue([ROW])

    await expect(getStockMovementRegister(TENANT_ID)).resolves.toEqual([
      {
        id: ROW.id,
        internal_number: ROW.internal_number,
        movement_type: ROW.movement_type,
        status: ROW.status,
        movement_date: ROW.movement_date,
        reason: ROW.reason,
        source_code: ROW.source_code,
        target_code: ROW.target_code,
        project_name: ROW.project_name,
        line_count: 2,
        total_value_cents: 125_000,
      },
    ])

    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0])
    expect(query.params).toContain(TENANT_ID)
  })

  it('maps the Core result only when the exact tenant gate is enabled', async () => {
    mocks.flag.mockReturnValue(true)
    mocks.core.mockResolvedValue({
      ok: true,
      data: {
        tenantId: TENANT_ID,
        rows: [
          {
            id: ROW.id,
            internalNumber: ROW.internal_number,
            movementType: ROW.movement_type,
            status: ROW.status,
            movementDate: ROW.movement_date,
            reason: ROW.reason,
            sourceWarehouseCode: ROW.source_code,
            targetWarehouseCode: ROW.target_code,
            projectName: ROW.project_name,
            lineCount: 2,
            totalValueCents: '125000',
          },
        ],
        total: 1,
        page: 1,
        limit: 500,
        totalPages: 1,
      },
    })

    await expect(getStockMovementRegister(TENANT_ID)).resolves.toMatchObject([
      { id: ROW.id, total_value_cents: 125_000 },
    ])
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.core).toHaveBeenCalledWith({ page: 1, limit: 500 })
  })
})
