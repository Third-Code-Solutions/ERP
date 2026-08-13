import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureInventoryItemThroughCoreApi,
  inventoryItemConfigurationWritesUseCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const ITEM_ID = '44444444-4444-4444-8444-444444444444'
const UOM_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const RESULT = {
  materialItemId: ITEM_ID,
  tenantId: TENANT_ID,
  baseUomId: UOM_ID,
  inventoryTracked: true,
  unit: 'EA',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

describe('ERP Core inventory item configuration client', () => {
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

  it('requires the exact flag and tenant allowlist', () => {
    expect(inventoryItemConfigurationWritesUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_INVENTORY_ITEM_CONFIG_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_ITEM_CONFIG_TENANT_IDS', TENANT_ID)
    expect(inventoryItemConfigurationWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(inventoryItemConfigurationWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('patches only the item configuration route and validates its result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      configureInventoryItemThroughCoreApi(ITEM_ID, {
        uomId: UOM_ID,
        tracked: true,
      })
    ).resolves.toEqual({ ok: true, data: RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/inventory/items/${ITEM_ID}/configuration`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ uomId: UOM_ID, tracked: true }),
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
