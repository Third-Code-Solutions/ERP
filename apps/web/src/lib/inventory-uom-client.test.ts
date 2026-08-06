import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInventoryUomThroughCoreApi,
  inventoryUomCreateWritesUseCoreApi,
  inventoryUomUpdateWritesUseCoreApi,
  updateInventoryUomThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const RESULT = {
  uomId: '66666666-6666-4666-8666-666666666666',
  tenantId: TENANT_ID,
  code: 'EA',
  name: 'Each',
  decimalPlaces: 0,
  isActive: true,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

describe('ERP Core inventory UOM client', () => {
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
    expect(inventoryUomCreateWritesUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_INVENTORY_UOM_CREATE_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_UOM_CREATE_TENANT_IDS', TENANT_ID)
    expect(inventoryUomCreateWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(inventoryUomCreateWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('posts only the UOM command and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createInventoryUomThroughCoreApi({
        code: 'EA',
        name: 'Each',
        decimalPlaces: 0,
      })
    ).resolves.toEqual({ ok: true, data: RESULT })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/inventory/uoms',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'EA', name: 'Each', decimalPlaces: 0 }),
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

  it('gates updates by tenant and sends only mutable UOM state', async () => {
    expect(inventoryUomUpdateWritesUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_INVENTORY_UOM_UPDATE_VIA_API', 'true')
    vi.stubEnv('ERP_INVENTORY_UOM_UPDATE_TENANT_IDS', TENANT_ID)
    expect(inventoryUomUpdateWritesUseCoreApi(TENANT_ID)).toBe(true)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...RESULT, name: 'Units', isActive: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateInventoryUomThroughCoreApi(RESULT.uomId, {
        name: 'Units',
        isActive: false,
      })
    ).resolves.toEqual({
      ok: true,
      data: { ...RESULT, name: 'Units', isActive: false },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/inventory/uoms/${RESULT.uomId}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Units', isActive: false }),
      })
    )
  })
})
