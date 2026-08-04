import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getInventoryWarehouseCloseoutThroughCoreApi,
  inventoryWarehouseCloseoutReadsUseCoreApi,
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
  name: 'Main store',
  projectId: null,
  isActive: true,
  quantityMicros: '0',
  valueCents: '0',
  canDeactivate: true,
  disposition: 'ready',
}

describe('ERP Core inventory Warehouse closeout client', () => {
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
    expect(inventoryWarehouseCloseoutReadsUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_TENANT_IDS', TENANT_ID)
    expect(inventoryWarehouseCloseoutReadsUseCoreApi(TENANT_ID)).toBe(true)
    expect(inventoryWarehouseCloseoutReadsUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('gets and validates the exact Warehouse closeout result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getInventoryWarehouseCloseoutThroughCoreApi(WAREHOUSE_ID)
    ).resolves.toEqual({ ok: true, data: RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/inventory/warehouses/${WAREHOUSE_ID}/closeout`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer never-log-or-return-this-token',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })
})
