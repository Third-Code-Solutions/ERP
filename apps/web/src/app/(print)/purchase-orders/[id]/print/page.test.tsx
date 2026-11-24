import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  select: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))

vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('./print-button', () => ({ PrintButton: () => null }))

import PoPrintPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PO_ID = '55555555-5555-4555-8555-555555555555'

function renderPage() {
  return PoPrintPage({ params: Promise.resolve({ id: PO_ID }) })
}

describe('purchase order print route gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['sales', 'design', 'finance', 'safety', 'cx'])(
    'sends %s away before any query: prices, lines and the vendor TIN stay unread',
    async (role) => {
      mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role })

      await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT /dashboard?error=forbidden')
      expect(mocks.select).not.toHaveBeenCalled()
    }
  )

  it('lets procurement reach the tenant-scoped purchase order query', async () => {
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'procurement' })
    mocks.select.mockReturnValue({
      from: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: async () => [] }) }) }),
    })

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).toHaveBeenCalledOnce()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('returns notFound without a session', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
