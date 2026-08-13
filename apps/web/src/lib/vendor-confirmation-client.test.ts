import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getVendorConfirmationView,
  submitVendorConfirmation,
} from './vendor-confirmation-client'

const TOKEN = 'a'.repeat(64)

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('vendor confirmation core client', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test/')
    vi.unstubAllGlobals()
  })

  it('maps a valid public review response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          sessionId: '11111111-1111-4111-8111-111111111111',
          purchaseOrderId: '22222222-2222-4222-8222-222222222222',
          poNumber: 'PO-1',
          vendorName: 'Vendor',
          projectName: 'Project',
          projectLocation: null,
          deliveryDate: null,
          notes: null,
          subtotalCents: 0,
          vatCents: 0,
          withholdingTaxCents: 0,
          totalCents: 0,
          state: 'pending',
          expiresAt: '2099-01-01T00:00:00.000Z',
          lines: [],
        })
      )
    )

    await expect(getVendorConfirmationView(TOKEN)).resolves.toMatchObject({
      ok: true,
      data: { poNumber: 'PO-1' },
    })
  })

  it('fails closed when the core API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 503)))
    await expect(getVendorConfirmationView(TOKEN)).resolves.toEqual({
      ok: false,
      error: 'Supplier confirmation is not available yet. Contact the project team.',
    })
  })

  it('sends strict body and idempotency key for a response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        sessionId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        purchaseOrderId: '33333333-3333-4333-8333-333333333333',
        vendorId: '44444444-4444-4444-8444-444444444444',
        decision: 'accepted',
        respondedAt: '2099-01-01T00:00:00.000Z',
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitVendorConfirmation(
        TOKEN,
        { decision: 'accepted', responderName: 'Ana' },
        'vendor-key-1'
      )
    ).resolves.toMatchObject({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/public/purchase-orders/${TOKEN}/confirmation`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'vendor-key-1' }),
        body: JSON.stringify({ decision: 'accepted', responderName: 'Ana' }),
      })
    )
  })
})
