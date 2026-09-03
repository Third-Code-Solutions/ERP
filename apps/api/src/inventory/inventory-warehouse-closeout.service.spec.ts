import 'reflect-metadata'

import { ForbiddenException } from '@nestjs/common'
import type { DatabaseService } from '../database/database.service'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { describe, expect, it, vi } from 'vitest'
import { InventoryWarehouseCloseoutService } from './inventory-warehouse-closeout.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({
    for: rowLock,
    then: (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(rows).then(resolve, reject),
  })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, limit, rowLock }
}

function harness(
  balance: { quantity_micros: string; value_cents: string },
  role: ErpPrincipal['role'] = PRINCIPAL.role,
) {
  const membershipQuery = selectQuery([
    {
      tenantId: PRINCIPAL.tenantId,
      role,
      email: PRINCIPAL.email,
    },
  ])
  const warehouseQuery = selectQuery([
    {
      id: WAREHOUSE_ID,
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
    },
  ])
  const transactionClient = {
    select: vi
      .fn()
      .mockReturnValueOnce({ from: membershipQuery.from })
      .mockReturnValueOnce({ from: warehouseQuery.from }),
    execute: vi.fn().mockResolvedValue([balance]),
  }
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
    callback(transactionClient)
  )
  return {
    service: new InventoryWarehouseCloseoutService({
      client: { transaction },
    } as unknown as DatabaseService),
    transaction,
    transactionClient,
  }
}

describe('InventoryWarehouseCloseoutService', () => {
  it('returns ready when the active Warehouse has zero exact balance', async () => {
    const probe = harness({ quantity_micros: '0', value_cents: '0' })

    await expect(probe.service.read(WAREHOUSE_ID, PRINCIPAL)).resolves.toEqual({
      warehouseId: WAREHOUSE_ID,
      tenantId: PRINCIPAL.tenantId,
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
      quantityMicros: '0',
      valueCents: '0',
      canDeactivate: true,
      disposition: 'ready',
    })
    expect(probe.transaction).toHaveBeenCalledOnce()
    expect(probe.transactionClient.execute).toHaveBeenCalledOnce()
  })

  it('blocks deactivation when net stock balance is nonzero', async () => {
    const probe = harness({ quantity_micros: '4250000', value_cents: '10001' })

    await expect(probe.service.read(WAREHOUSE_ID, PRINCIPAL)).resolves.toMatchObject({
      quantityMicros: '4250000',
      valueCents: '10001',
      canDeactivate: false,
      disposition: 'nonzero_balance',
    })
  })

  it('allows Viewer to read the tenant-bound closeout projection', async () => {
    const probe = harness({ quantity_micros: '0', value_cents: '0' }, 'viewer')

    await expect(
      probe.service.read(WAREHOUSE_ID, { ...PRINCIPAL, role: 'viewer' }),
    ).resolves.toMatchObject({ warehouseId: WAREHOUSE_ID, canDeactivate: true })
  })

  it('fails closed for an unknown tenant member', async () => {
    const probe = harness({ quantity_micros: '0', value_cents: '0' })
    probe.transactionClient.select.mockReset()
    const membershipQuery = selectQuery([])
    probe.transactionClient.select.mockReturnValueOnce({ from: membershipQuery.from })

    await expect(probe.service.read(WAREHOUSE_ID, PRINCIPAL)).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })
})
