import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  inventoryWarehouseUpdateWritesUseCoreApi,
  updateInventoryWarehouseThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'
const RESULT = {
  warehouseId: WAREHOUSE_ID,
  tenantId: TENANT_ID,
  code: 'MAIN',
  name: 'Closed materials store',
  projectId: null,
  isActive: false,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:01:00.000Z',
}

describe('ERP Core inventory Warehouse update client', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'never-log-or-return-this-token' } },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('requires exact flag and tenant allowlist', () => {
    expect(inventoryWarehouseUpdateWritesUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_INVENTORY_WAREHOUSE_UPDATE_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_WAREHOUSE_UPDATE_TENANT_IDS', TENANT_ID)
    expect(inventoryWarehouseUpdateWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(inventoryWarehouseUpdateWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('patches only mutable Warehouse state and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateInventoryWarehouseThroughCoreApi(WAREHOUSE_ID, {
        name: 'Closed materials store',
        isActive: false,
      })
    ).resolves.toEqual({ ok: true, data: RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/inventory/warehouses/${WAREHOUSE_ID}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Closed materials store',
          isActive: false,
        }),
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'content-type': 'application/json',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })
})
